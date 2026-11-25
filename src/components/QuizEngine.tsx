import React, { useMemo, useState } from 'react';
import { CheckCircle2, HelpCircle, RotateCcw, Volume2, XCircle } from 'lucide-react';
import type { AccentType, CEFRLevel, QuizAttempt, UILanguage, VocabWord } from '../types.ts';
import { escapeRegExp } from '../data/curriculum.ts';
import { speechEngine } from '../utils/speech.ts';

interface QuizEngineProps {
  lang: UILanguage;
  level: CEFRLevel;
  storyId?: string;
  targetWords: VocabWord[];
  allLevelWords: VocabWord[];
  accent: AccentType;
  speechRate: number;
  onWordOutcome: (wordId: string, outcome: 'known' | 'unknown') => void;
  onSaveAttempt: (attempt: Omit<QuizAttempt, 'id' | 'createdAt'>) => void;
  onExit?: () => void;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export const QuizEngine: React.FC<QuizEngineProps> = ({
  lang,
  level,
  storyId,
  targetWords,
  allLevelWords,
  accent,
  speechRate,
  onWordOutcome,
  onSaveAttempt,
  onExit,
}) => {
  const isAr = lang === 'ar';
  const [mode, setMode] = useState<'multiple-choice' | 'fill-blank'>('multiple-choice');
  const [questionCount, setQuestionCount] = useState<5 | 8 | 10>(8);
  const [started, setStarted] = useState(false);
  const [qIdx, setQIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    typoNote: boolean;
    expected: string;
  } | null>(null);
  const [masteredIds, setMasteredIds] = useState<string[]>([]);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);

  const questions = useMemo(() => {
    const pool = [...targetWords].slice(0, Math.min(questionCount, targetWords.length));
    return pool.map((word, idx) => {
      const sentence = word.sentences[idx % 3];
      const blankedSentence = sentence.replace(
        new RegExp(`\\b${escapeRegExp(word.word)}\\b`, 'i'),
        '______'
      );

      const distractors = allLevelWords
        .filter((w) => w.id !== word.id)
        .slice(idx * 3, idx * 3 + 3);
      while (distractors.length < 3 && allLevelWords.length > 3) {
        const extra = allLevelWords[(idx + distractors.length + 1) % allLevelWords.length];
        if (extra.id !== word.id && !distractors.some((d) => d.id === extra.id)) {
          distractors.push(extra);
        } else {
          break;
        }
      }

      const useSentencePrompt = idx % 2 === 1 && blankedSentence.includes('______');
      const optionsRaw = useSentencePrompt
        ? [word.word, ...distractors.map((d) => d.word)]
        : [word.translationAr, ...distractors.map((d) => d.translationAr)];

      // Deterministic shuffle of 4 options
      const options = [...optionsRaw].sort(
        (a, b) => ((a.charCodeAt(0) + idx) % 7) - ((b.charCodeAt(0) + idx) % 7)
      );

      return {
        word,
        prompt: useSentencePrompt ? blankedSentence : word.word,
        isSentencePrompt: useSentencePrompt,
        expectedOption: useSentencePrompt ? word.word : word.translationAr,
        blankedSentence: blankedSentence.includes('______')
          ? blankedSentence
          : `${word.translationAr} (______)`,
        options,
      };
    });
  }, [targetWords, allLevelWords, questionCount, started]);

  const activeQ = questions[qIdx];

  const handleStart = () => {
    setStarted(true);
    setFinished(false);
    setQIdx(0);
    setSelectedOption(null);
    setTypedAnswer('');
    setFeedback(null);
    setMasteredIds([]);
    setReviewIds([]);
  };

  const recordOutcome = (wordId: string, correct: boolean, typoNote: boolean, expected: string) => {
    setFeedback({ correct, typoNote, expected });
    speechEngine.speakText(activeQ.word.word, accent, speechRate);
    onWordOutcome(wordId, correct ? 'known' : 'unknown');
    if (correct) {
      setMasteredIds((prev) => (prev.includes(wordId) ? prev : [...prev, wordId]));
    } else {
      setReviewIds((prev) => (prev.includes(wordId) ? prev : [...prev, wordId]));
    }
  };

  const handleSelectChoice = (opt: string) => {
    if (feedback || !activeQ) return;
    setSelectedOption(opt);
    const isCorrect = opt === activeQ.expectedOption;
    recordOutcome(activeQ.word.id, isCorrect, false, activeQ.expectedOption);
  };

  const handleSubmitTyping = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedback || !activeQ || !typedAnswer.trim()) return;
    const expected = activeQ.word.word.trim().toLowerCase();
    const actual = typedAnswer.trim().toLowerCase();
    const dist = levenshtein(expected, actual);
    const typoTolerance = expected.length >= 6 ? 2 : 1;
    const isExact = dist === 0;
    const isClosePass = !isExact && dist <= typoTolerance;
    recordOutcome(activeQ.word.id, isExact || isClosePass, isClosePass, activeQ.word.word);
  };

  const handleNext = () => {
    if (qIdx + 1 < questions.length) {
      setQIdx((i) => i + 1);
      setSelectedOption(null);
      setTypedAnswer('');
      setFeedback(null);
    } else {
      setFinished(true);
      onSaveAttempt({
        mode,
        level,
        storyId,
        score: masteredIds.length,
        total: questions.length,
        masteredWordIds: masteredIds,
        reviewWordIds: reviewIds,
      });
    }
  };

  if (!targetWords.length) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-sm text-slate-500">
          {isAr ? 'اختر قصة أو مجموعة كلمات لبدء الاختبار.' : 'Select a story or word set to start a quiz.'}
        </p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isAr ? 'اختبار قصير لتذكّر الكلمات' : 'Quick Vocabulary Recall Quiz'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {isAr
              ? 'اختبار سريع (أقل من دقيقتين) مع نطق فوري وتحديث نظام التكرار المتباعد.'
              : 'Under 2 minutes with instant audio feedback and spaced repetition updates.'}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'اختر نمط الاختبار:' : 'Choose Quiz Mode:'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('multiple-choice')}
              className={`p-4 rounded-xl border text-start cursor-pointer transition-colors ${
                mode === 'multiple-choice'
                  ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <p className="font-bold text-sm text-slate-900 dark:text-white">
                {isAr ? 'اختيار من متعدد' : 'Multiple Choice'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isAr ? '4 خيارات للترجمة أو إكمال الجملة' : '4 choices for translation or sentence gap'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode('fill-blank')}
              className={`p-4 rounded-xl border text-start cursor-pointer transition-colors ${
                mode === 'fill-blank'
                  ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <p className="font-bold text-sm text-slate-900 dark:text-white">
                {isAr ? 'كتابة الكلمة في الفراغ' : 'Fill in the Blank'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isAr ? 'اكتب الكلمة مع تسامح بسيط للأخطاء الطفيفة' : 'Type the missing word with gentle typo tolerance'}
              </p>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'عدد الأسئلة:' : 'Question Count:'}
          </p>
          <div className="flex gap-2">
            {([5, 8, 10] as const).map((cnt) => (
              <button
                key={cnt}
                type="button"
                onClick={() => setQuestionCount(cnt)}
                className={`min-h-[44px] flex-1 rounded-xl font-bold text-sm border cursor-pointer tabular-nums ${
                  questionCount === cnt
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {Math.min(cnt, targetWords.length)}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleStart}
          className="w-full min-h-[48px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm cursor-pointer"
        >
          {isAr ? 'ابدأ الاختبار الآن' : 'Start Quiz'}
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto" />
          <h2 className="text-2xl font-bold">
            {isAr ? 'ملخص الاختبار' : 'Quiz Summary'}
          </h2>
          <p className="text-3xl font-bold font-mono-nums text-blue-700 dark:text-blue-400">
            {masteredIds.length} / {questions.length}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-2">
              {isAr ? `كلمات متقنة (${masteredIds.length})` : `Mastered (${masteredIds.length})`}
            </p>
            <div dir="ltr" className="flex flex-wrap gap-1.5 text-xs text-left">
              {masteredIds.map((id) => {
                const w = targetWords.find((tw) => tw.id === id);
                return w ? (
                  <span key={id} className="font-semibold text-emerald-900 dark:text-emerald-200">
                    {w.word}
                  </span>
                ) : null;
              })}
              {masteredIds.length === 0 && <span className="text-slate-500">—</span>}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <p className="text-xs font-bold text-red-800 dark:text-red-300 mb-2">
              {isAr ? `تحتاج مراجعة (${reviewIds.length})` : `Needs Review (${reviewIds.length})`}
            </p>
            <div dir="ltr" className="flex flex-wrap gap-1.5 text-xs text-left">
              {reviewIds.map((id) => {
                const w = targetWords.find((tw) => tw.id === id);
                return w ? (
                  <span key={id} className="font-semibold text-red-900 dark:text-red-200">
                    {w.word}
                  </span>
                ) : null;
              })}
              {reviewIds.length === 0 && <span className="text-slate-500">—</span>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleStart}
            className="flex-1 min-h-[44px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{isAr ? 'إعادة الاختبار' : 'Retry Quiz'}</span>
          </button>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="min-h-[44px] px-5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold cursor-pointer"
            >
              {isAr ? 'عودة' : 'Back'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>
          {isAr ? 'سؤال' : 'Question'} {qIdx + 1} / {questions.length}
        </span>
        <button
          type="button"
          onClick={() => speechEngine.speakText(activeQ.word.word, accent, speechRate)}
          className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 cursor-pointer"
        >
          <Volume2 className="w-4 h-4" />
          <span>{isAr ? 'استمع' : 'Listen'}</span>
        </button>
      </div>

      {mode === 'multiple-choice' ? (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4" />
              <span>
                {activeQ.isSentencePrompt
                  ? isAr
                    ? 'اختر الكلمة المناسبة لإكمال الجملة:'
                    : 'Choose the word that completes the sentence:'
                  : isAr
                  ? 'اختر الترجمة الصحيحة للكلمة:'
                  : 'Select the Arabic translation:'}
              </span>
            </p>
            <p
              dir="ltr"
              className="text-left text-xl font-bold text-slate-900 dark:text-white leading-relaxed"
            >
              {activeQ.prompt}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {activeQ.options.map((opt) => {
              const isSelected = selectedOption === opt;
              const isCorrectOpt = opt === activeQ.expectedOption;
              let btnStyle =
                'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-blue-500';
              if (feedback) {
                if (isCorrectOpt) {
                  btnStyle =
                    'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200';
                } else if (isSelected) {
                  btnStyle =
                    'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200';
                }
              }
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={Boolean(feedback)}
                  onClick={() => handleSelectChoice(opt)}
                  dir={activeQ.isSentencePrompt ? 'ltr' : 'rtl'}
                  className={`min-h-[48px] px-4 py-3 rounded-xl border text-sm font-semibold text-start transition-colors cursor-pointer ${btnStyle}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmitTyping} className="space-y-4">
          <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
            <p className="text-xs text-slate-500">
              {isAr ? 'اكتب الكلمة الإنجليزية المناسبة في الفراغ:' : 'Type the missing English word:'}
            </p>
            <p dir="ltr" className="text-left text-lg font-semibold text-slate-900 dark:text-white">
              {activeQ.blankedSentence}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              {isAr ? 'المعنى:' : 'Hint:'} {activeQ.word.translationAr}
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              dir="ltr"
              disabled={Boolean(feedback)}
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              placeholder="Type missing word..."
              className="flex-1 min-h-[48px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {!feedback && (
              <button
                type="submit"
                className="min-h-[48px] px-5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold cursor-pointer"
              >
                {isAr ? 'تحقق' : 'Check'}
              </button>
            )}
          </div>
        </form>
      )}

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
            feedback.correct
              ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30'
              : 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
          }`}
        >
          <div className="flex items-start gap-2.5 text-sm">
            {feedback.correct ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">
                {feedback.correct
                  ? feedback.typoNote
                    ? isAr
                      ? `مقبولة مع تنبيه إملائي بسيط! الصحيح: ${activeQ.word.word}`
                      : `Accepted with minor spelling note! Exact: ${activeQ.word.word}`
                    : isAr
                    ? 'إجابة صحيحة!'
                    : 'Correct!'
                  : isAr
                  ? `الإجابة الصحيحة: ${feedback.expected}`
                  : `Correct answer: ${feedback.expected}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer shrink-0"
          >
            {qIdx + 1 < questions.length ? (isAr ? 'التالي' : 'Next') : isAr ? 'النتيجة' : 'Summary'}
          </button>
        </div>
      )}
    </div>
  );
};
