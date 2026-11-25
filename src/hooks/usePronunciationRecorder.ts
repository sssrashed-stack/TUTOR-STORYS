import { useCallback, useEffect, useRef, useState } from 'react';

export type MicPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied';

export interface UsePronunciationRecorderOptions {
  maxDurationSeconds?: number;
  onRecordingComplete?: (blob: Blob, mimeType: string) => void;
}

export interface UsePronunciationRecorderReturn {
  isSupported: boolean;
  permissionState: MicPermissionState;
  isRecording: boolean;
  elapsedSeconds: number;
  audioLevel: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  mimeType: string;
  activeSentence: string | null;
  error: string | null;
  requestPermission: () => Promise<boolean>;
  startRecording: (sentence?: string) => Promise<boolean>;
  stopRecording: () => Promise<Blob | null>;
  getAudioBlob: () => Blob | null;
  resetRecording: () => void;
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

export function usePronunciationRecorder(
  options: UsePronunciationRecorderOptions = {}
): UsePronunciationRecorderReturn {
  const { maxDurationSeconds = 25, onRecordingComplete } = options;

  const isSupported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const [permissionState, setPermissionState] = useState<MicPermissionState>('unknown');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('audio/webm');
  const [activeSentence, setActiveSentence] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopResolversRef = useRef<Array<(blob: Blob | null) => void>>([]);
  const onCompleteRef = useRef(onRecordingComplete);
  onCompleteRef.current = onRecordingComplete;

  // Query initial microphone permission state when Permissions API is available
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    let active = true;
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        if (!active) return;
        setPermissionState(status.state as MicPermissionState);
        status.onchange = () => {
          if (active) setPermissionState(status.state as MicPermissionState);
        };
      })
      .catch(() => {
        // Browsers like Safari may not support querying 'microphone'
      });
    return () => {
      active = false;
    };
  }, []);

  const cleanupStreamsAndTimers = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const resetRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    cleanupStreamsAndTimers();
    setIsRecording(false);
    const resolvers = stopResolversRef.current.splice(0);
    resolvers.forEach((r) => r(null));

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    blobRef.current = null;
    chunksRef.current = [];
    setAudioBlob(null);
    setAudioUrl(null);
    setActiveSentence(null);
    setElapsedSeconds(0);
    setError(null);
  }, [cleanupStreamsAndTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      cleanupStreamsAndTimers();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, [cleanupStreamsAndTimers]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Microphone recording is not supported in this browser.');
      return false;
    }
    try {
      const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      probeStream.getTracks().forEach((track) => track.stop());
      setPermissionState('granted');
      setError(null);
      return true;
    } catch (err) {
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setPermissionState('denied');
        setError('Microphone permission was denied.');
      } else {
        setError('Could not access the microphone.');
      }
      return false;
    }
  }, [isSupported]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false);
      return Promise.resolve(blobRef.current);
    }
    return new Promise((resolve) => {
      stopResolversRef.current.push(resolve);
      setIsRecording(false);
      recorder.stop();
    });
  }, []);

  const startRecording = useCallback(
    async (sentence?: string): Promise<boolean> => {
      setError(null);

      if (!isSupported) {
        setError('Microphone recording is not supported in this browser.');
        return false;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        await stopRecording();
      }

      resetRecording();
      setActiveSentence(sentence?.trim() || null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        setPermissionState('granted');

        // Monitor input volume via Web Audio API AnalyserNode
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            if (ctx.state === 'suspended') {
              void ctx.resume().catch(() => {});
            }
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const sampleLevel = () => {
              if (!audioCtxRef.current) return;
              analyser.getByteTimeDomainData(dataArray);
              let sumSquares = 0;
              for (let i = 0; i < dataArray.length; i++) {
                const norm = (dataArray[i] - 128) / 128;
                sumSquares += norm * norm;
              }
              const rms = Math.sqrt(sumSquares / dataArray.length);
              setAudioLevel(Math.min(1, rms * 3.5));
              rafRef.current = window.requestAnimationFrame(sampleLevel);
            };
            rafRef.current = window.requestAnimationFrame(sampleLevel);
          }
        } catch {
          // Non-fatal if Web Audio visualization is unavailable
        }

        const supportedMime = PREFERRED_MIME_TYPES.find((type) =>
          MediaRecorder.isTypeSupported(type)
        );
        const recorder = supportedMime
          ? new MediaRecorder(stream, { mimeType: supportedMime })
          : new MediaRecorder(stream);

        chunksRef.current = [];
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onerror = () => {
          cleanupStreamsAndTimers();
          setIsRecording(false);
          setError('Microphone recording encountered an unexpected error.');
          const resolvers = stopResolversRef.current.splice(0);
          resolvers.forEach((r) => r(null));
        };

        recorder.onstop = () => {
          cleanupStreamsAndTimers();
          setIsRecording(false);

          const finalMime = recorder.mimeType || supportedMime || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: finalMime });

          if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
          }
          const nextUrl = URL.createObjectURL(blob);
          audioUrlRef.current = nextUrl;
          blobRef.current = blob;

          setMimeType(finalMime);
          setAudioBlob(blob);
          setAudioUrl(nextUrl);

          const resolvers = stopResolversRef.current.splice(0);
          resolvers.forEach((r) => r(blob));

          onCompleteRef.current?.(blob, finalMime);
        };

        recorder.start();
        setIsRecording(true);
        setElapsedSeconds(0);

        timerRef.current = window.setInterval(() => {
          setElapsedSeconds((prev) => {
            if (prev + 1 >= maxDurationSeconds) {
              if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
              }
              setIsRecording(false);
              return maxDurationSeconds;
            }
            return prev + 1;
          });
        }, 1000);

        return true;
      } catch (err) {
        cleanupStreamsAndTimers();
        setIsRecording(false);
        const errName = err instanceof Error ? err.name : '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setPermissionState('denied');
          setError('Microphone permission was denied.');
        } else {
          setError('Could not access the microphone.');
        }
        return false;
      }
    },
    [cleanupStreamsAndTimers, isSupported, maxDurationSeconds, resetRecording, stopRecording]
  );

  const getAudioBlob = useCallback((): Blob | null => {
    return blobRef.current;
  }, []);

  return {
    isSupported,
    permissionState,
    isRecording,
    elapsedSeconds,
    audioLevel,
    audioBlob,
    audioUrl,
    mimeType,
    activeSentence,
    error,
    requestPermission,
    startRecording,
    stopRecording,
    getAudioBlob,
    resetRecording,
  };
}
