import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Square,
  Volume2,
} from 'lucide-react';
import type {
  AccentType,
  CEFRLevel,
  PronunciationEvaluation,
  UILanguage,
} from '../types.ts';
import { usePronunciationRecorder } from '../hooks/usePronunciationRecorder.ts';
import { speechEngine } from '../utils/speech.ts';
import { CircularScoreRing, PronunciationScoreFeedback } from './PronunciationScoreFeedback.tsx';

interface ShadowingModeProps {
  lang: UILanguage;
  storyId: string;
  sentences: string[];
  level: CEFRLevel;
  accent: AccentType;
  initialRate: number;
  authToken: string;
}

type ShadowingPhase = 'idle' | 'listening' | 'pause-cue' | 'recording' | 'scoring' | 'between' | 'completed';

const SHADOW_SPEEDS = [0.75, 1.0, 1.25] as const;

function pickClosestShadowSpeed(rate: number): number {
  let best: number = SHADOW_SPEEDS[1];
  let minDiff = Infinity;
  for (const s of SHADOW_SPEEDS) {
    const diff = Math.abs(s - rate);
    if (diff < minDiff) {
      minDiff = diff;
      best = s;
    }
  }
  return best;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to encode audio'));
    reader.readAsDataURL(blob);
  });
}

function getTierBadgeClasses(score: number): string {
  if (score >= 80) {
    return 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300';
  }
  if (score >= 50) {
    return 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300';
  }
  return 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300';
}

export const ShadowingMode: React.FC<ShadowingModeProps> = ({
  lang,
  storyId,
  sentences,
  level,
  accent,
  initialRate,
  authToken,
}) => {
  const isAr = lang === 'ar';

  const [shadowRate, setShadowRate] = useState<number>(() => pickClosestShadowSpeed(initialRate));
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [phase, setPhase] = useState<ShadowingPhase>('idle');
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [inspectIdx, setInspectIdx] = useState<number>(0);
  const [recordCountdown, setRecordCountdown] = useState<number>(0);
  const [resultsByIndex, setResultsByIndex] = useState<Record<number, PronunciationEvaluation>>({});
  const [loopError, setLoopError] = useState<string | null>(null);

  // Monotonic token invalidates stale async callbacks on stop, story switch, or unmount
  const sessionTokenRef = useRef<number>(0);
  const delayTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const isLoopActiveRef = useRef<boolean>(false);

  const {
    isSupported,
    permissionState,
    audioLevel,
    error: recorderError,
    requestPermission,
    startRecording,
    stopRecording,
    resetRecording,
  } = usePronunciationRecorder({ maxDurationSeconds: 18 });

  const clearLoopTimers = useCallback(() => {
    if (delayTimerRef.current !== null) {
      window.clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const haltSession = useCallback(
    (nextPhase: ShadowingPhase = 'idle') => {
      sessionTokenRef.current += 1;
      isLoopActiveRef.current = false;
      clearLoopTimers();
      speechEngine.stop();
      resetRecording();
      setRecordCountdown(0);
      setPhase(nextPhase);
    },
    [clearLoopTimers, resetRecording]
  );

  // Reset when story changes
  useEffect(() => {
    haltSession('idle');
    setCurrentIdx(0);
    setInspectIdx(0);
    setResultsByIndex({});
    setLoopError(null);
  }, [storyId, haltSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionTokenRef.current += 1;
      isLoopActiveRef.current = false;
      clearLoopTimers();
      speechEngine.stop();
      resetRecording();
    };
  }, [clearLoopTimers, resetRecording]);

  const scoreAudioForSentence = useCallback(
    async (
      blob: Blob,
      mimeType: string,
      sentence: string,
      idx: number,
      token: number
    ): Promise<boolean> => {
      if (blob.size < 400) {
        setLoopError(
          isAr
            ? 'التسجيل قصير جدًا أو صامت. جرّب القراءة بصوت أوضح قرب الميكروفون.'
            : 'Recording was too short or silent. Speak clearly near the microphone.'
        );
        return false;
      }

      const base64 = await blobToBase64(blob);
      if (token !== sessionTokenRef.current) return false;

      const res = await fetch('/api/ai/pronunciation-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType,
          expectedSentence: sentence,
          accent,
          level,
        }),
      });
      const data = await res.json();
      if (token !== sessionTokenRef.current) return false;

      if (!res.ok || !data.evaluation) {
        setLoopError(
          data.error ||
            (isAr ? 'تعذر تقييم النطق حاليًا.' : 'Could not evaluate pronunciation.')
        );
        return false;
      }

      setResultsByIndex((prev) => ({
        ...prev,
        [idx]: data.evaluation as PronunciationEvaluation,
      }));
      setInspectIdx(idx);
      return true;
    },
    [accent, authToken, isAr, level]
  );

  const runSentenceCycle = useCallback(
    (idx: number, token: number) => {
      if (token !== sessionTokenRef.current || !isLoopActiveRef.current) return;
      if (idx >= sentences.length) {
        isLoopActiveRef.current = false;
        setPhase('completed');
        return;
      }

      const sentence = sentences[idx];
      const wordCount = sentence.split(/\s+/).filter(Boolean).length;
      const repeatSeconds = Math.max(5, Math.min(14, Math.ceil(wordCount / 1.4) + 3));

      setCurrentIdx(idx);
      setInspectIdx(idx);
      setLoopError(null);
      setPhase('listening');

      // Step 1: Play model sentence via speechEngine at 0.75x - 1.25x
      speechEngine.speakText(sentence, accent, shadowRate, () => {
        if (token !== sessionTokenRef.current || !isLoopActiveRef.current) return;

        // Step 2: Brief automatic pause so TTS tail fades before mic opens
        setPhase('pause-cue');
        delayTimerRef.current = window.setTimeout(async () => {
          if (token !== sessionTokenRef.current || !isLoopActiveRef.current) return;

          const started = await startRecording(sentence);
          if (token !== sessionTokenRef.current || !isLoopActiveRef.current) {
            if (started) resetRecording();
            return;
          }
          if (!started) {
            isLoopActiveRef.current = false;
            setPhase('idle');
            return;
          }

          // Step 3: Capture learner repeating aloud with visible countdown
          setPhase('recording');
          setRecordCountdown(repeatSeconds);

          let remaining = repeatSeconds;
          countdownTimerRef.current = window.setInterval(() => {
            if (token !== sessionTokenRef.current || !isLoopActiveRef.current) return;
            remaining -= 1;
            setRecordCountdown(Math.max(0, remaining));
            if (remaining <= 0) {
              if (countdownTimerRef.current !== null) {
                window.clearInterval(countdownTimerRef.current);
                countdownTimerRef.current = null;
              }
              void finalizeCurrentRecording(idx, sentence, token);
            }
          }, 1000);
        }, 400);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accent, sentences, shadowRate, startRecording, resetRecording]
  );

  const finalizeCurrentRecording = useCallback(
    async (idx: number, sentence: string, token: number) => {
      if (token !== sessionTokenRef.current) return;
      clearLoopTimers();
      setPhase('scoring');

      const blob = await stopRecording();
      if (token !== sessionTokenRef.current) return;

      if (!blob) {
        setLoopError(isAr ? 'لم يتم التقاط صوت مسموع.' : 'No audio was captured.');
        isLoopActiveRef.current = false;
        setPhase('idle');
        return;
      }

      try {
        const ok = await scoreAudioForSentence(
          blob,
          blob.type || 'audio/webm',
          sentence,
          idx,
          token
        );
        if (token !== sessionTokenRef.current) return;

        if (!ok) {
          isLoopActiveRef.current = false;
          setPhase('idle');
          return;
        }

        if (idx + 1 >= sentences.length) {
          isLoopActiveRef.current = false;
          setPhase('completed');
          return;
        }

        if (autoAdvance && isLoopActiveRef.current) {
          setPhase('between');
          delayTimerRef.current = window.setTimeout(() => {
            if (token !== sessionTokenRef.current || !isLoopActiveRef.current) return;
            runSentenceCycle(idx + 1, token);
          }, 2200);
        } else {
          isLoopActiveRef.current = false;
          setCurrentIdx(idx + 1);
          setPhase('idle');
        }
      } catch {
        if (token !== sessionTokenRef.current) return;
        setLoopError(isAr ? 'تعذر إرسال الصوت للتقييم.' : 'Network error scoring audio.');
        isLoopActiveRef.current = false;
        setPhase('idle');
      }
    },
    [autoAdvance, clearLoopTimers, isAr, runSentenceCycle, scoreAudioForSentence, sentences.length, stopRecording]
  );

  const handleStartLoop = async (startFromIdx = currentIdx) => {
    setLoopError(null);
    if (!isSupported) {
      setLoopError(
        isAr
          ? 'متصفحك لا يدعم تسجيل الميكروفون.'
          : 'Microphone recording is not supported in this browser.'
      );
      return;
    }

    const permOk = permissionState === 'granted' ? true : await requestPermission();
    if (!permOk) return;

    sessionTokenRef.current += 1;
    const token = sessionTokenRef.current;
    isLoopActiveRef.current = true;
    const safeIdx = startFromIdx >= sentences.length ? 0 : startFromIdx;
    runSentenceCycle(safeIdx, token);
  };

  const handleFinishSentenceEarly = () => {
    if (phase !== 'recording') return;
    const token = sessionTokenRef.current;
    const sentence = sentences[currentIdx];
    if (sentence) {
      void finalizeCurrentRecording(currentIdx, sentence, token);
    }
  };

  const handleSkipSentence = () => {
    if (!isLoopActiveRef.current) return;
    clearLoopTimers();
    speechEngine.stop();
    resetRecording();
    const nextIdx = currentIdx + 1;
    if (nextIdx >= sentences.length) {
      isLoopActiveRef.current = false;
      setPhase('completed');
      return;
    }
    sessionTokenRef.current += 1;
    const token = sessionTokenRef.current;
    isLoopActiveRef.current = true;
    runSentenceCycle(nextIdx, token);
  };

  const scoredEntries = useMemo(
    () =>
      Object.entries(resultsByIndex)
        .map(([idxStr, ev]) => ({ idx: Number(idxStr), evaluation: ev as PronunciationEvaluation }))
        .sort((a, b) => a.idx - b.idx),
    [resultsByIndex]
  );

  const storyAverages = useMemo(() => {
    if (scoredEntries.length === 0) return null;
    const count = scoredEntries.length;
    const sum = scoredEntries.reduce(
      (acc, item) => ({
        pronunciation: acc.pronunciation + item.evaluation.pronunciationScore,
        accent: acc.accent + item.evaluation.accentScore,
        overall: acc.overall + item.evaluation.overallScore,
      }),
      { pronunciation: 0, accent: 0, overall: 0 }
    );
    return {
      pronunciationScore: Math.round(sum.pronunciation / count),
      accentScore: Math.round(sum.accent / count),
      overallScore: Math.round(sum.overall / count),
      completedCount: count,
    };
  }, [scoredEntries]);

  const activeSentence = sentences[currentIdx] || '';
  const inspectedEvaluation = resultsByIndex[inspectIdx] || null;
  const activeError =
    loopError ||
    (recorderError
      ? permissionState === 'denied'
        ? isAr
          ? 'تم رفض إذن الميكروفون. يرجى السماح بالوصول من إعدادات المتصفح.'
          : 'Microphone permission denied. Please enable it in browser settings.'
        : recorderError
      : null);

  const isRunning = phase !== 'idle' && phase !== 'completed';

  return (
    <div className="space-y-5">
      {/* Controls Bar: Speed (0.75x - 1.25x) & Auto-Advance */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'سرعة الترديد:' : 'Shadowing Speed:'}
          </span>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {SHADOW_SPEEDS.map((spd) => (
              <button
                key={spd}
                type="button"
                disabled={isRunning}
                onClick={() => setShadowRate(spd)}
                className={`min-h-[36px] px-2.5 text-xs font-mono-nums font-semibold rounded-md cursor-pointer disabled:opacity-50 ${
                  shadowRate === spd
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(e) => setAutoAdvance(e.target.checked)}
            className="w-4 h-4 rounded accent-blue-700"
          />
          <span>
            {isAr ? 'انتقال تلقائي للجملة التالية' : 'Auto-advance to next sentence'}
          </span>
        </label>
      </div>

      {/* Story-Wide Sentence Progress Strip */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          <span>
            {isAr
              ? `تقدّم القصة: ${scoredEntries.length} من ${sentences.length} جملة`
              : `Story Progress: ${scoredEntries.length} / ${sentences.length} sentences`}
          </span>
          <span>
            {isAr ? `الجملة الحالية #${currentIdx + 1}` : `Sentence #${currentIdx + 1}`}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {sentences.map((_, idx) => {
            const ev = resultsByIndex[idx];
            const isCurrent = idx === currentIdx && isRunning;
            const isInspected = idx === inspectIdx;
            return (
              <button
                key={idx}
                type="button"
                disabled={isRunning}
                onClick={() => {
                  setCurrentIdx(idx);
                  setInspectIdx(idx);
                }}
                aria-label={isAr ? `الجملة ${idx + 1}` : `Sentence ${idx + 1}`}
                className={`min-h-[36px] min-w-[36px] px-2.5 rounded-lg border text-xs font-mono-nums font-bold transition-colors cursor-pointer disabled:cursor-default ${
                  isCurrent
                    ? 'border-blue-600 bg-blue-700 text-white'
                    : ev
                    ? `${getTierBadgeClasses(ev.overallScore)} ${
                        isInspected ? 'ring-2 ring-blue-600 dark:ring-blue-400' : ''
                      }`
                    : isInspected
                    ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400'
                }`}
              >
                {ev ? `${idx + 1} · ${ev.overallScore}%` : idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Guided Shadowing Card */}
      <div className="p-4 sm:p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
          <span className="text-slate-500 dark:text-slate-400 tabular-nums">
            {isAr
              ? `الجملة ${currentIdx + 1} من ${sentences.length}`
              : `Sentence ${currentIdx + 1} of ${sentences.length}`}
          </span>

          {phase === 'listening' && (
            <span className="inline-flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
              <Volume2 className="w-4 h-4 animate-pulse" />
              <span>{isAr ? 'استمع للنطق النموذجي...' : 'Listen to the model...'}</span>
            </span>
          )}
          {phase === 'pause-cue' && (
            <span className="text-amber-700 dark:text-amber-400">
              {isAr ? 'استعد للترديد...' : 'Get ready to repeat...'}
            </span>
          )}
          {phase === 'recording' && (
            <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 tabular-nums">
              <Mic className="w-4 h-4 animate-pulse" />
              <span>
                {isAr
                  ? `دورك الآن — ردّد الجملة (${recordCountdown}ث)`
                  : `Your turn — repeat aloud (${recordCountdown}s)`}
              </span>
            </span>
          )}
          {phase === 'scoring' && (
            <span className="inline-flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{isAr ? 'جاري حساب النتيجة...' : 'Scoring pronunciation...'}</span>
            </span>
          )}
          {phase === 'between' && (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>{isAr ? 'تم التقييم! الانتقال للجملة التالية...' : 'Scored! Moving to next sentence...'}</span>
            </span>
          )}
          {phase === 'completed' && (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>{isAr ? 'اكتملت جولة الترديد للقصة!' : 'Story shadowing complete!'}</span>
            </span>
          )}
        </div>

        <p
          dir="ltr"
          className="text-left text-base sm:text-lg font-semibold text-slate-900 dark:text-white leading-relaxed"
        >
          {activeSentence}
        </p>

        {/* Live Microphone Input Meter */}
        {phase === 'recording' && (
          <div className="space-y-1.5">
            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-600 dark:bg-red-400 transition-[width] duration-75"
                style={{ width: `${Math.max(8, Math.round(audioLevel * 100))}%` }}
              />
            </div>
          </div>
        )}

        {/* Guided Loop Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!isRunning ? (
            <>
              <button
                type="button"
                disabled={!isSupported || sentences.length === 0}
                onClick={() => void handleStartLoop(phase === 'completed' ? 0 : currentIdx)}
                className="min-h-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>
                  {phase === 'completed'
                    ? isAr
                      ? 'إعادة ترديد القصة كاملة'
                      : 'Restart Full Story Loop'
                    : currentIdx > 0 && scoredEntries.length > 0
                    ? isAr
                      ? `متابعة من الجملة ${currentIdx + 1}`
                      : `Resume from Sentence ${currentIdx + 1}`
                    : isAr
                    ? 'ابدأ التدريب التتبّعي للقصة'
                    : 'Start Story Shadowing'}
                </span>
              </button>

              {resultsByIndex[currentIdx] && (
                <button
                  type="button"
                  onClick={() => void handleStartLoop(currentIdx)}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isAr ? `إعادة الجملة #${currentIdx + 1}` : `Retry Sentence #${currentIdx + 1}`}</span>
                </button>
              )}
            </>
          ) : (
            <>
              {phase === 'recording' && (
                <button
                  type="button"
                  onClick={handleFinishSentenceEarly}
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isAr ? 'انتهيت — قيّم الآن' : 'Done — Score Now'}</span>
                </button>
              )}

              <button
                type="button"
                disabled={phase === 'scoring'}
                onClick={handleSkipSentence}
                className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <SkipForward className="w-4 h-4" />
                <span>{isAr ? 'تخطي الجملة' : 'Skip'}</span>
              </button>

              <button
                type="button"
                onClick={() => haltSession('idle')}
                className="min-h-[44px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {phase === 'between' ? <Pause className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                <span>{isAr ? 'إيقاف مؤقت' : 'Pause Loop'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {activeError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-800 dark:text-red-300"
        >
          {activeError}
        </div>
      )}

      {/* Story-Wide Average Ring Scores Across Completed Sentences */}
      {storyAverages && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr
                ? `متوسط نتائج القصة (${storyAverages.completedCount} / ${sentences.length})`
                : `Story-Wide Shadowing Rings (${storyAverages.completedCount} / ${sentences.length})`}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CircularScoreRing
              score={storyAverages.pronunciationScore}
              title={isAr ? 'متوسط النطق' : 'Avg Pronunciation'}
              lang={lang}
              featured
            />
            <CircularScoreRing
              score={storyAverages.accentScore}
              title={isAr ? `متوسط اللكنة (${accent === 'en-GB' ? 'UK' : 'US'})` : `Avg Accent (${accent === 'en-GB' ? 'UK' : 'US'})`}
              lang={lang}
            />
            <CircularScoreRing
              score={storyAverages.overallScore}
              title={isAr ? 'متوسط الطلاقة العامة' : 'Avg Overall Fluency'}
              lang={lang}
            />
          </div>
        </div>
      )}

      {/* Detailed Instant Feedback for Selected / Latest Sentence */}
      {inspectedEvaluation && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr
              ? `تفاصيل تقييم الجملة #${inspectIdx + 1}:`
              : `Sentence #${inspectIdx + 1} Detailed Feedback:`}
          </p>
          <PronunciationScoreFeedback
            lang={lang}
            evaluation={inspectedEvaluation}
            accent={accent}
            speechRate={shadowRate}
          />
        </div>
      )}
    </div>
  );
};
