import React, { useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type {
  AccentType,
  PronunciationEvaluation,
  UILanguage,
} from '../types.ts';
import { speechEngine } from '../utils/speech.ts';

interface PronunciationScoreFeedbackProps {
  lang: UILanguage;
  evaluation: PronunciationEvaluation;
  accent: AccentType;
  speechRate: number;
}

interface ScoreTierStyle {
  strokeClass: string;
  trackClass: string;
  textClass: string;
  labelAr: string;
  labelEn: string;
  Icon: React.FC<{ className?: string }>;
}

function getScoreTier(score: number): ScoreTierStyle {
  if (score >= 80) {
    return {
      strokeClass: 'stroke-emerald-600 dark:stroke-emerald-400',
      trackClass: 'stroke-emerald-100 dark:stroke-emerald-950/60',
      textClass: 'text-emerald-700 dark:text-emerald-400',
      labelAr: 'ممتاز',
      labelEn: 'Strong',
      Icon: CheckCircle2,
    };
  }
  if (score >= 50) {
    return {
      strokeClass: 'stroke-amber-500 dark:stroke-amber-400',
      trackClass: 'stroke-amber-100 dark:stroke-amber-950/60',
      textClass: 'text-amber-700 dark:text-amber-400',
      labelAr: 'جيد — قيد التحسن',
      labelEn: 'Developing',
      Icon: AlertCircle,
    };
  }
  return {
    strokeClass: 'stroke-red-600 dark:stroke-red-400',
    trackClass: 'stroke-red-100 dark:stroke-red-950/60',
    textClass: 'text-red-700 dark:text-red-400',
    labelAr: 'يحتاج إعادة تدريب',
    labelEn: 'Needs Practice',
    Icon: RotateCcw,
  };
}

interface CircularRingProps {
  score: number;
  title: string;
  lang: UILanguage;
  featured?: boolean;
}

export const CircularScoreRing: React.FC<CircularRingProps> = ({
  score,
  title,
  lang,
  featured = false,
}) => {
  const isAr = lang === 'ar';
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tier = getScoreTier(clamped);
  const StatusIcon = tier.Icon;

  const size = featured ? 124 : 104;
  const strokeWidth = featured ? 10 : 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center gap-2.5">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{title}</p>

      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={`${title}: ${clamped}%`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className={tier.trackClass}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className={`${tier.strokeClass} transition-[stroke-dashoffset] duration-500 ease-out`}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`${
              featured ? 'text-2xl' : 'text-xl'
            } font-bold font-mono-nums tabular-nums ${tier.textClass}`}
          >
            {clamped}%
          </span>
        </div>
      </div>

      <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${tier.textClass}`}>
        <StatusIcon className="w-3.5 h-3.5 shrink-0" />
        <span>{isAr ? tier.labelAr : tier.labelEn}</span>
      </div>
    </div>
  );
};

export const PronunciationScoreFeedback: React.FC<PronunciationScoreFeedbackProps> = ({
  lang,
  evaluation,
  accent,
  speechRate,
}) => {
  const isAr = lang === 'ar';

  const simpleSuggestions = useMemo(() => {
    const tips: Array<{ text: string; listenWord?: string }> = [];

    // 1. Score-tier actionable tip
    if (evaluation.pronunciationScore < 50) {
      tips.push({
        text: isAr
          ? 'استمع للجملة بسرعة 0.75x أولًا، ثم اقرأها ببطء وبصوت واضح قريب من الميكروفون.'
          : 'Listen to the sentence at 0.75x speed first, then read it slowly and clearly near the mic.',
      });
    } else if (evaluation.pronunciationScore < 80) {
      tips.push({
        text: isAr
          ? 'نطقك مفهوم! ركّز على وضوح نهايات الكلمات وربطها بسلاسة في القراءة التالية.'
          : 'Your reading is understandable. Focus on crisp word endings and smooth phrasing next.',
      });
    } else {
      tips.push({
        text: isAr
          ? 'نطق ممتاز وواضح! يمكنك الآن الانتقال للجملة التالية أو التجربة بسرعة قراءة أعلى.'
          : 'Clear, accurate pronunciation! Try the next sentence or practice at a brisker pace.',
      });
    }

    // 2. Accent gap tip if accent score trails pronunciation
    if (evaluation.accentScore + 10 < evaluation.pronunciationScore || evaluation.accentScore < 70) {
      tips.push({
        text: isAr
          ? `لتقوية اللكنة (${accent === 'en-GB' ? 'البريطانية UK' : 'الأمريكية US'})، قلّد نبرة الصوت ومواضع التشديد في الجملة النموذجية.`
          : `To sharpen your ${accent === 'en-GB' ? 'British (UK)' : 'American (US)'} accent, mirror the rhythm and stressed syllables in the model audio.`,
      });
    }

    // 3. Specific tips for words marked needs_work or missed
    const trickyWords = evaluation.wordFeedback.filter(
      (w) => w.status === 'needs_work' || w.status === 'missed'
    );
    for (const w of trickyWords.slice(0, 3)) {
      tips.push({
        text: w.tipAr
          ? `${w.word}: ${w.tipAr}`
          : isAr
          ? `أعد الاستماع لكلمة "${w.word}" وانطقها منفردة مرتين ثم داخل الجملة.`
          : `Replay "${w.word}", say it twice on its own, then read the full sentence again.`,
        listenWord: w.word,
      });
    }

    return tips;
  }, [evaluation, accent, isAr]);

  return (
    <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
      {/* Color-Coded Circular Progress Rings (80%+ Green, 50-79% Yellow, <50% Red) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CircularScoreRing
          score={evaluation.pronunciationScore}
          title={isAr ? 'دقة النطق والمخارج' : 'Pronunciation Score'}
          lang={lang}
          featured
        />
        <CircularScoreRing
          score={evaluation.accentScore}
          title={isAr ? `اللكنة (${accent === 'en-GB' ? 'UK' : 'US'})` : `Accent (${accent === 'en-GB' ? 'UK' : 'US'})`}
          lang={lang}
        />
        <CircularScoreRing
          score={evaluation.overallScore}
          title={isAr ? 'التقييم العام' : 'Overall Fluency'}
          lang={lang}
        />
      </div>

      {/* Ring Threshold Legend (unboxed inline metadata) */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
          <span>80%+ {isAr ? 'ممتاز' : 'Strong'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-amber-400" />
          <span>50–79% {isAr ? 'متوسط' : 'Developing'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 dark:bg-red-400" />
          <span>&lt;50% {isAr ? 'يحتاج تدريبًا' : 'Needs Practice'}</span>
        </span>
      </div>

      {/* AI Coach Summary & Heard Transcript */}
      <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300">
          <Sparkles className="w-4 h-4" />
          <span>{isAr ? 'ملاحظات مدرّب النطق' : 'AI Pronunciation Coach'}</span>
        </div>
        <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
          {evaluation.coachSummaryAr}
        </p>
        {evaluation.heardTranscript && (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold">{isAr ? 'ما تم سماعه:' : 'Heard:'}</span>{' '}
            <span dir="ltr" className="font-mono-nums">
              "{evaluation.heardTranscript}"
            </span>
          </p>
        )}
      </div>

      {/* Simple Actionable Suggestions Based on AI Feedback */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <span>{isAr ? 'خطوات بسيطة للتحسين السريع' : 'Simple Improvement Suggestions'}</span>
        </div>
        <ul className="space-y-2">
          {simpleSuggestions.map((item, idx) => (
            <li
              key={idx}
              className="flex items-center justify-between gap-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300"
            >
              <span>• {item.text}</span>
              {item.listenWord && (
                <button
                  type="button"
                  onClick={() => speechEngine.speakText(item.listenWord!, accent, speechRate)}
                  aria-label={`Listen to ${item.listenWord}`}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Per-Word Clarity Breakdown */}
      {evaluation.wordFeedback.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {evaluation.wordFeedback.map((wf, idx) => (
            <div
              key={`${wf.word}-${idx}`}
              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-start justify-between gap-2"
            >
              <div className="space-y-0.5">
                <div dir="ltr" className="text-left text-sm font-bold flex items-center gap-2">
                  <span
                    className={
                      wf.status === 'accurate'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : wf.status === 'needs_work'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-red-700 dark:text-red-400'
                    }
                  >
                    {wf.word}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {wf.status === 'accurate'
                    ? isAr
                      ? 'نطق واضح'
                      : 'Clear'
                    : wf.status === 'needs_work'
                    ? isAr
                      ? 'يحتاج تحسينًا'
                      : 'Needs work'
                    : isAr
                    ? 'غير مسموع'
                    : 'Missed'}
                  {wf.tipAr ? ` — ${wf.tipAr}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => speechEngine.speakText(wf.word, accent, speechRate)}
                aria-label={`Hear ${wf.word}`}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
              >
                <Volume2 className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
