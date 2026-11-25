import type { AccentType, Story, VocabWord } from '../types.ts';

class SpeechEngine {
  private activeKeepAliveOsc: OscillatorNode | null = null;
  private audioCtx: AudioContext | null = null;
  private fallbackTimer: number | null = null;
  private playlistCancelled = false;

  private pickVoice(accent: AccentType): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    const exact = voices.find((v) => v.lang.toLowerCase() === accent.toLowerCase());
    if (exact) return exact;

    const prefix = accent.toLowerCase().slice(0, 5);
    const byPrefix = voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
    if (byPrefix) return byPrefix;

    const anyEn = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    return anyEn || null;
  }

  private pickArabicVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => v.lang.toLowerCase().startsWith('ar')) || null;
  }

  private clearTimers(): void {
    if (this.fallbackTimer !== null) {
      window.clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  /**
   * Keeps a silent WebAudio session active so mobile browsers allow continuous
   * MediaSession / lock-screen story playback across tracks.
   */
  private startSilentKeepAlive(): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }
      if (!this.activeKeepAliveOsc) {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        gain.gain.value = 0.0001; // inaudible keep-alive signal
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        this.activeKeepAliveOsc = osc;
      }
    } catch {
      // Ignore if AudioContext blocked
    }
  }

  private stopSilentKeepAlive(): void {
    try {
      if (this.activeKeepAliveOsc) {
        this.activeKeepAliveOsc.stop();
        this.activeKeepAliveOsc.disconnect();
        this.activeKeepAliveOsc = null;
      }
    } catch {
      this.activeKeepAliveOsc = null;
    }
  }

  stop(): void {
    this.playlistCancelled = true;
    this.clearTimers();
    this.stopSilentKeepAlive();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
  }

  speakText(
    text: string,
    accent: AccentType = 'en-US',
    rate = 1.0,
    onEnd?: () => void
  ): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    this.clearTimers();

    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = accent;
    utt.rate = Math.min(1.75, Math.max(0.5, rate));
    const voice = this.pickVoice(accent);
    if (voice) utt.voice = voice;
    utt.onend = () => onEnd?.();
    utt.onerror = () => onEnd?.();
    window.speechSynthesis.speak(utt);
  }

  speakStoryWithTracking(
    text: string,
    accent: AccentType,
    rate: number,
    onCharIndex: (charIdx: number) => void,
    onDone: () => void
  ): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onDone();
      return;
    }
    window.speechSynthesis.cancel();
    this.clearTimers();

    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = accent;
    utt.rate = Math.min(1.75, Math.max(0.5, rate));
    const voice = this.pickVoice(accent);
    if (voice) utt.voice = voice;

    let boundarySeen = false;
    utt.onboundary = (e) => {
      if (typeof e.charIndex === 'number') {
        boundarySeen = true;
        onCharIndex(e.charIndex);
      }
    };

    // Fallback progress estimator if browser TTS doesn't fire onboundary
    const words = text.split(/\s+/);
    const msPerWord = Math.round(370 / rate);
    let idx = 0;
    let charCursor = 0;
    this.fallbackTimer = window.setInterval(() => {
      if (boundarySeen || idx >= words.length) return;
      onCharIndex(charCursor);
      charCursor += words[idx].length + 1;
      idx++;
    }, msPerWord);

    utt.onend = () => {
      this.clearTimers();
      onCharIndex(-1);
      onDone();
    };
    utt.onerror = () => {
      this.clearTimers();
      onCharIndex(-1);
      onDone();
    };

    window.speechSynthesis.speak(utt);
  }

  speakWordSequence(
    words: VocabWord[],
    withTranslation: boolean,
    accent: AccentType,
    rate: number,
    onActiveWord: (wordId: string | null) => void,
    onDone: () => void
  ): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onDone();
      return;
    }
    this.stop();
    this.playlistCancelled = false;

    const runIndex = (idx: number) => {
      if (this.playlistCancelled || idx >= words.length) {
        onActiveWord(null);
        onDone();
        return;
      }
      const w = words[idx];
      onActiveWord(w.id);

      const uttEn = new SpeechSynthesisUtterance(w.word);
      uttEn.lang = accent;
      uttEn.rate = Math.min(1.75, Math.max(0.5, rate));
      const vEn = this.pickVoice(accent);
      if (vEn) uttEn.voice = vEn;

      uttEn.onend = () => {
        if (this.playlistCancelled) return;
        if (withTranslation) {
          const uttAr = new SpeechSynthesisUtterance(w.translationAr);
          uttAr.lang = 'ar-SA';
          uttAr.rate = 1.0;
          const vAr = this.pickArabicVoice();
          if (vAr) uttAr.voice = vAr;
          uttAr.onend = () => setTimeout(() => runIndex(idx + 1), 220);
          uttAr.onerror = () => setTimeout(() => runIndex(idx + 1), 220);
          window.speechSynthesis.speak(uttAr);
        } else {
          setTimeout(() => runIndex(idx + 1), 260);
        }
      };
      uttEn.onerror = () => runIndex(idx + 1);
      window.speechSynthesis.speak(uttEn);
    };

    runIndex(0);
  }

  startLevelPlaylist(params: {
    stories: Story[];
    startIndex: number;
    accent: AccentType;
    rate: number;
    onStoryChange: (story: Story, idx: number) => void;
    onStop: () => void;
  }): void {
    const { stories, startIndex, accent, rate, onStoryChange, onStop } = params;
    if (!stories.length || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onStop();
      return;
    }

    this.stop();
    this.playlistCancelled = false;
    this.startSilentKeepAlive();

    let currentIdx = Math.max(0, Math.min(startIndex, stories.length - 1));

    const playTrack = (idx: number) => {
      if (this.playlistCancelled || idx >= stories.length || idx < 0) {
        this.stop();
        onStop();
        return;
      }
      currentIdx = idx;
      const story = stories[idx];
      onStoryChange(story, idx);

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `${story.level} · ${story.title}`,
          artist: 'Tutor Story Audio Library',
          album: `Level ${story.level} (${idx + 1}/${stories.length})`,
        });
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.setActionHandler('pause', () => {
          this.stop();
          onStop();
        });
        navigator.mediaSession.setActionHandler('stop', () => {
          this.stop();
          onStop();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          window.speechSynthesis.cancel();
          playTrack(currentIdx + 1);
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          window.speechSynthesis.cancel();
          playTrack(Math.max(0, currentIdx - 1));
        });
      }

      const utt = new SpeechSynthesisUtterance(`${story.title}. ${story.text}`);
      utt.lang = accent;
      utt.rate = Math.min(1.75, Math.max(0.5, rate));
      const voice = this.pickVoice(accent);
      if (voice) utt.voice = voice;

      utt.onend = () => {
        if (!this.playlistCancelled) {
          setTimeout(() => playTrack(currentIdx + 1), 650);
        }
      };
      utt.onerror = () => {
        if (!this.playlistCancelled) {
          setTimeout(() => playTrack(currentIdx + 1), 650);
        }
      };
      window.speechSynthesis.speak(utt);
    };

    playTrack(currentIdx);
  }
}

export const speechEngine = new SpeechEngine();

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function listenForPronunciation(
  accent: AccentType,
  onResult: (transcript: string) => void,
  onError: (msg: string) => void
): () => void {
  const w = window as unknown as Record<string, unknown>;
  const Rec = (w.SpeechRecognition || w.webkitSpeechRecognition) as
    | (new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: (e: { error: string }) => void;
        start: () => void;
        stop: () => void;
      })
    | undefined;

  if (!Rec) {
    onError('Speech recognition is not supported in this browser.');
    return () => {};
  }

  const recognition = new Rec();
  recognition.lang = accent;
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;

  recognition.onresult = (event) => {
    const first = event.results?.[0]?.[0]?.transcript ?? '';
    onResult(first);
  };
  recognition.onerror = (e) => {
    onError(e.error || 'Microphone error');
  };
  recognition.start();

  return () => {
    try {
      recognition.stop();
    } catch {
      // ignore
    }
  };
}
