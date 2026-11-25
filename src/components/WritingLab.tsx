import React, { useMemo, useState } from 'react';
import { History, RefreshCw, Sparkles } from 'lucide-react';
import type {
  CEFRLevel,
  UILanguage,
  VocabWord,
  WritingSubmission,
} from '../types.ts';
import { WRITING_TOPICS } from '../data/curriculum.ts';

interface WritingLabProps {
  lang: UILanguage;
  userLevel: CEFRLevel;
  levelWords: VocabWord[];
  submissions: WritingSubmission[];
  authToken: string;
  onSubmissionSaved: (sub: WritingSubmission) => void;
}

export const WritingLab: React.FC<WritingLabProps> = ({
  lang,
  userLevel,
  levelWords,
  submissions,
  authToken,
  onSubmissionSaved,
}) => {
  const isAr = lang === 'ar';
  const topics = WRITING_TOPICS[userLevel];
  const [topicIdx, setTopicIdx] = useState(0);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeResult, setActiveResult] = useState<WritingSubmission | null>(
    submissions[0] ?? null
  );

  const currentTopic = topics[topicIdx % topics.length];

  const suggestedWords = useMemo(() => {
    return levelWords.slice(topicIdx * 5, topicIdx * 5 + 6);
  }, [levelWords, topicIdx]);

  const wordCount = useMemo(
    () => (text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0),
    [text]
  );

  const handleSubmit = async () => {
    if (text.trim().length < 5) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/correct-writing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          text,
          level: userLevel,
          topicEn: currentTopic.en,
          topicAr: currentTopic.ar,
          suggestedWords: suggestedWords.map((w) => w.word),
          saveHistory: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (isAr ? 'تعذر تصحيح النص.' : 'Failed to evaluate writing.'));
        return;
      }
      setActiveResult(data.submission);
      onSubmissionSaved(data.submission);
    } catch {
      setError(isAr ? 'تعذر الاتصال بالخادم.' : 'Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editor Column */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                {isAr ? `موضوع كتابة للمستوى ${userLevel}` : `Level ${userLevel} Writing Prompt`}
              </p>
              <h2 dir="ltr" className="text-lg font-bold text-slate-900 dark:text-white text-left mt-1">
                {currentTopic.en}
              </h2>
              {isAr && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{currentTopic.ar}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setTopicIdx((i) => (i + 1) % topics.length)}
              className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{isAr ? 'موضوع آخر' : 'Another Topic'}</span>
            </button>
          </div>

          {/* Suggested Words from Stories/Flashcards */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              {isAr
                ? 'كلمات مقترحة من قصصك لإدراجها في الكتابة (اضغط لإضافتها):'
                : 'Suggested words from your stories (click to insert):'}
            </p>
            <div dir="ltr" className="flex flex-wrap gap-2">
              {suggestedWords.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setText((prev) => (prev ? `${prev} ${w.word}` : w.word))}
                  title={w.translationAr}
                  className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-red-700 dark:text-red-400 hover:border-blue-500 cursor-pointer"
                >
                  {w.word}
                </button>
              ))}
            </div>
          </div>

          <textarea
            dir="ltr"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your English paragraph here..."
            className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-left leading-7 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-mono-nums text-slate-500 dark:text-slate-400">
              {wordCount} / {currentTopic.minWords} {isAr ? 'كلمة مقترحة' : 'recommended words'}
            </p>

            <button
              type="button"
              disabled={loading || text.trim().length < 5}
              onClick={handleSubmit}
              className="min-h-[48px] px-5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {loading
                  ? isAr
                    ? 'جاري التصحيح والتحليل...'
                    : 'Analyzing Writing...'
                  : isAr
                  ? 'تحقق وصحّح الكتابة'
                  : 'Check & Correct Writing'}
              </span>
            </button>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-800 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* AI Correction & Arabic Explanations Column */}
        <div className="lg:col-span-5 space-y-6">
          {activeResult ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isAr ? 'التصحيح المفصّل والشرح العربي' : 'Detailed Correction & Arabic Guide'}
              </h3>

              <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1.5">
                  {isAr ? 'النص المصحّح:' : 'Corrected Version:'}
                </p>
                <p dir="ltr" className="text-sm text-left text-slate-900 dark:text-white leading-relaxed">
                  {activeResult.correctedText}
                </p>
              </div>

              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {activeResult.overallFeedbackAr}
              </p>

              {activeResult.errors.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {isAr
                      ? `الأخطاء المكتشفة (${activeResult.errors.length}):`
                      : `Detected Issues (${activeResult.errors.length}):`}
                  </p>
                  {activeResult.errors.map((err, i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5"
                    >
                      <div dir="ltr" className="text-left text-xs font-semibold">
                        <span className="line-through text-red-600 dark:text-red-400">
                          {err.original}
                        </span>
                        {' → '}
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {err.correction}
                        </span>
                        <span className="text-slate-400 ms-2">({err.errorType})</span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        <span className="font-semibold">{isAr ? 'القاعدة:' : 'Rule:'}</span>{' '}
                        {err.ruleAr} — {err.explanationAr}
                      </p>
                      <p dir="ltr" className="text-left text-xs text-blue-700 dark:text-blue-400">
                        Ex: {err.exampleEn}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {activeResult.frequentPatternsAr.length > 0 && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">
                    {isAr ? 'ملخص أكثر الأخطاء تكرارًا:' : 'Recurring Error Summary:'}
                  </p>
                  <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc list-inside">
                    {activeResult.frequentPatternsAr.map((pat, idx) => (
                      <li key={idx}>{pat}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {isAr
                ? 'اكتب فقرتك واضغط «تحقق وصحّح الكتابة» لعرض التصحيح والشرح العربي هنا.'
                : 'Write your paragraph and submit to view corrections and Arabic explanations here.'}
            </div>
          )}

          {/* Saved History */}
          {submissions.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <History className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <span>{isAr ? 'سجل الكتابات السابقة' : 'Writing History'}</span>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {submissions.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setActiveResult(sub)}
                    className={`w-full p-3 rounded-xl border text-start cursor-pointer transition-colors ${
                      activeResult?.id === sub.id
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <p dir="ltr" className="text-xs font-semibold text-left truncate">
                      {sub.topicEn}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      {sub.level} · {new Date(sub.createdAt).toLocaleDateString()} · {sub.errors.length}{' '}
                      {isAr ? 'ملاحظات' : 'notes'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
