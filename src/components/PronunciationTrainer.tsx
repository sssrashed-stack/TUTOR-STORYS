import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mic,
  Play,
  RotateCcw,
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
import { PronunciationScoreFeedback } from './PronunciationScoreFeedback.tsx';
import { ShadowingMode } from './ShadowingMode.tsx';

interface PronunciationTrainerProps {
  lang: UILanguage;
  storyId: string;
  storyText: string;
  level: CEFRLevel;
  accent: AccentType;
  speechRate: number;
  authToken: string;
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

export const PronunciationTrainer: React.FC<PronunciationTrainerProps> = ({
  lang,
  storyId,
  storyText,
  level,
  accent,
  speechRate,
  authToken,
}) => {
  const isAr = lang === 'ar';

  const sentences = useMemo(() => {
    const raw = storyText.match(/[^.!?]+[.!?]+/g) || [storyText];
    return raw.map((s) => s.trim()).filter((s) => s.length > 8);
  }, [storyText]);

  const [trainerMode, setTrainerMode] = useState<'single' | 'shadowing'>('single');
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<PronunciationEvaluation | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const activeSentence = sentences[sentenceIdx % Math.max(1, sentences.length)] || storyText;

  const analyzeBlob = async (blob: Blob, mimeType: string) => {
    if (blob.size < 400) {
      setAnalysisError(
        isAr
          ? 'التسجيل قصير جدًا. اضغط للتسجيل واقرأ الجملة بوضوح.'
          : 'Recording was too short. Please read the sentence clearly.'
      );
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const base64 = await blobToBase64(blob);
      const res = await fetch('/api/ai/pronunciation-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType,
          expectedSentence: activeSentence,
          accent,
          level,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalysisError(
          data.error ||
            (isAr ? 'تعذر تقييم النطق حاليًا.' : 'Could not evaluate pronunciation.')
        );
        return;
      }
      setEvaluation(data.evaluation);
    } catch {
      setAnalysisError(isAr ? 'تعذر إرسال التسجيل للخادم.' : 'Network error sending audio.');
    } finally {
      setAnalyzing(false);
    }
  };

  const {
    isSupported,
    permissionState,
    isRecording,
    elapsedSeconds,
    audioLevel,
    audioBlob,
    audioUrl,
    mimeType,
    error: recorderError,
    startRecording,
    stopRecording,
    getAudioBlob,
    resetRecording,
  } = usePronunciationRecorder({
    maxDurationSeconds: 25,
    onRecordingComplete: (blob, recordedMime) => {
      void analyzeBlob(blob, recordedMime);
    },
  });

  useEffect(() => {
    setSentenceIdx(0);
    setEvaluation(null);
    setAnalysisError(null);
    resetRecording();
  }, [storyId, resetRecording]);

  const handleStart = async () => {
    setEvaluation(null);
    setAnalysisError(null);
    speechEngine.stop();
    await startRecording(activeSentence);
  };

  const handleStop = async () => {
    const blob = await stopRecording();
    // getAudioBlob() remains available as a direct getter if re-analysis is triggered manually
    if (!blob && getAudioBlob()) {
      await analyzeBlob(getAudioBlob()!, mimeType);
    }
  };

  const switchSentence = (nextIdx: number) => {
    if (isRecording || analyzing) return;
    setSentenceIdx((nextIdx + sentences.length) % sentences.length);
    setEvaluation(null);
    setAnalysisError(null);
    resetRecording();
  };

  const displayedError =
    analysisError ||
    (recorderError
      ? permissionState === 'denied'
        ? isAr
          ? 'تم رفض إذن الميكروفون. يرجى تفعيله من إعدادات المتصفح.'
          : 'Microphone permission was denied. Please enable it in your browser settings.'
        : !isSupported
        ? isAr
          ? 'متصفحك لا يدعم تسجيل الميكروفون.'
          : 'Microphone recording is not supported in this browser.'
        : isAr
        ? 'تعذر الوصول إلى الميكروفون. يرجى المحاولة مرة أخرى.'
        : recorderError
      : null);

  const switchTrainerMode = (nextMode: 'single' | 'shadowing') => {
    if (nextMode === trainerMode) return;
    speechEngine.stop();
    resetRecording();
    setTrainerMode(nextMode);
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {isAr ? 'مدرّب النطق واللكنة بالذكاء الاصطناعي' : 'AI Pronunciation & Accent Trainer'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {trainerMode === 'shadowing'
              ? isAr
                ? 'وضع الترديد التتبّعي: استمع لكل جملة ثم ردّدها تلقائيًا لتحصل على تقييم فوري للقصة كاملة.'
                : 'Guided Shadowing Loop: listen sentence-by-sentence, repeat aloud automatically, and earn rings across the whole story.'
              : isAr
              ? `سجّل صوتك وأنت تقرأ جملة من القصة للحصول على نسبة مئوية دقيقة للنطق واللكنة (${accent === 'en-GB' ? 'بريطانية UK' : 'أمريكية US'}).`
              : `Record yourself reading a story sentence aloud for an AI percentage score on pronunciation and ${accent === 'en-GB' ? 'British (UK)' : 'American (US)'} accent.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented Mode Toggle: Single Sentence vs Guided Shadowing */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              disabled={isRecording || analyzing}
              onClick={() => switchTrainerMode('single')}
              className={`min-h-[40px] px-3 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                trainerMode === 'single'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {isAr ? 'جملة مفردة' : 'Single Sentence'}
            </button>
            <button
              type="button"
              disabled={isRecording || analyzing}
              onClick={() => switchTrainerMode('shadowing')}
              className={`min-h-[40px] px-3 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                trainerMode === 'shadowing'
                  ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {isAr ? 'وضع الترديد (Shadowing)' : 'Shadowing Mode'}
            </button>
          </div>

          {trainerMode === 'single' && (
            <div className="flex items-center gap-2 text-xs font-mono-nums text-slate-500 dark:text-slate-400">
              <button
                type="button"
                disabled={isRecording || analyzing || sentences.length <= 1}
                onClick={() => switchSentence(sentenceIdx - 1)}
                aria-label={isAr ? 'الجملة السابقة' : 'Previous sentence'}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                {isAr ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
              <span className="tabular-nums px-1">
                {(sentenceIdx % sentences.length) + 1} / {sentences.length}
              </span>
              <button
                type="button"
                disabled={isRecording || analyzing || sentences.length <= 1}
                onClick={() => switchSentence(sentenceIdx + 1)}
                aria-label={isAr ? 'الجملة التالية' : 'Next sentence'}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {trainerMode === 'shadowing' ? (
        <ShadowingMode
          lang={lang}
          storyId={storyId}
          sentences={sentences}
          level={level}
          accent={accent}
          initialRate={speechRate}
          authToken={authToken}
        />
      ) : (
        <>

      {/* Target Sentence Card */}
      <div className="p-4 sm:p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
        <p dir="ltr" className="text-left text-base sm:text-lg font-semibold text-slate-900 dark:text-white leading-relaxed">
          {activeSentence}
        </p>

        {/* Live Web Audio input level indicator while recording */}
        {isRecording && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>{isAr ? 'مستوى الصوت المسجّل' : 'Microphone input level'}</span>
              <span>{elapsedSeconds}s / 25s</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 dark:bg-blue-400 transition-[width] duration-75"
                style={{ width: `${Math.max(8, Math.round(audioLevel * 100))}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => speechEngine.speakText(activeSentence, accent, speechRate)}
            className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <Volume2 className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <span>{isAr ? 'استمع للنطق الصحيح' : 'Hear Model'}</span>
          </button>

          {!isRecording ? (
            <button
              type="button"
              disabled={analyzing || !isSupported}
              onClick={handleStart}
              className="min-h-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
              <span>
                {analyzing
                  ? isAr
                    ? 'جاري تحليل النطق...'
                    : 'Scoring Audio...'
                  : evaluation
                  ? isAr
                    ? 'إعادة التسجيل'
                    : 'Record Again'
                  : isAr
                  ? 'ابدأ التسجيل بالميكروفون'
                  : 'Record Sentence'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer tabular-nums"
            >
              <Square className="w-4 h-4" />
              <span>
                {isAr ? `إيقاف وتقييم (${elapsedSeconds}ث)` : `Stop & Score (${elapsedSeconds}s)`}
              </span>
            </button>
          )}

          {audioUrl && !isRecording && (
            <button
              type="button"
              onClick={() => audioPreviewRef.current?.play()}
              className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>{isAr ? 'اسمع تسجيلك' : 'Play My Voice'}</span>
            </button>
          )}

          {audioBlob && analysisError && !analyzing && !isRecording && (
            <button
              type="button"
              onClick={() => void analyzeBlob(audioBlob, mimeType)}
              className="min-h-[44px] px-4 rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{isAr ? 'إعادة تحليل التسجيل' : 'Retry Analysis'}</span>
            </button>
          )}
        </div>

        {audioUrl && (
          <audio ref={audioPreviewRef} src={audioUrl} className="hidden" />
        )}
      </div>

      {displayedError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-800 dark:text-red-300"
        >
          {displayedError}
        </div>
      )}

      {/* Visual Color-Coded Circular Progress Rings & Suggestions */}
      {evaluation && (
          <PronunciationScoreFeedback
            lang={lang}
            evaluation={evaluation}
            accent={accent}
            speechRate={speechRate}
          />
        )}
        </>
      )}
    </section>
  );
};
