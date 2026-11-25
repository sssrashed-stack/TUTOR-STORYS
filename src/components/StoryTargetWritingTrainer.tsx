import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  Infinity as InfinityIcon,
  Mic,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type {
  AccentType,
  CEFRLevel,
  Story,
  UILanguage,
  VocabWord,
  WritingSubmission,
} from '../types.ts';
import { escapeRegExp } from '../data/curriculum.ts';
import {
  isSpeechRecognitionSupported,
  listenForPronunciation,
  speechEngine,
} from '../utils/speech.ts';

interface StoryTargetWritingTrainerProps {
  lang: UILanguage;
  story: Story;
  targetWords: VocabWord[];
  level: CEFRLevel;
  accent: AccentType;
  speechRate: number;
  authToken: string;
  onSubmissionSaved?: (sub: WritingSubmission) => void;
}

type TrainerMode = 'word-drill' | 'sentence-practice';
type QueueOrder = 'infinite-random' | 'sequential' | 'mistakes-first';

interface DiffToken {
  char: string;
  status: 'match' | 'wrong' | 'missing' | 'extra';
}

interface WordAttemptFeedback {
  expected: string;
  typed: string;
  outcome: 'exact' | 'close' | 'wrong';
  userDiff: DiffToken[];
  targetDiff: DiffToken[];
  diagnosisAr: string;
  diagnosisEn: string;
}

/**
 * Computes character-level Levenshtein alignment between user input and expected target word
 * so learners immediately see exact missing, extra, swapped, or wrong letters.
 */
function analyzeSpellingError(typedRaw: string, expectedRaw: string): WordAttemptFeedback {
  const typed = typedRaw.trim();
  const expected = expectedRaw.trim();
  const a = typed.toLowerCase();
  const b = expected.toLowerCase();

  if (a === b) {
    return {
      expected,
      typed,
      outcome: 'exact',
      userDiff: typed.split('').map((c) => ({ char: c, status: 'match' })),
      targetDiff: expected.split('').map((c) => ({ char: c, status: 'match' })),
      diagnosisAr: 'إملاء صحيح 100%! أحسنت.',
      diagnosisEn: 'Exact spelling match! Well done.',
    };
  }

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion from user input (extra char typed)
        dp[i][j - 1] + 1, // insertion into user input (missing char)
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = dp[m][n];
  const userDiff: DiffToken[] = [];
  const targetDiff: DiffToken[] = [];

  let i = m;
  let j = n;
  let missingCount = 0;
  let extraCount = 0;
  let wrongCount = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      userDiff.unshift({ char: typed[i - 1], status: 'match' });
      targetDiff.unshift({ char: expected[j - 1], status: 'match' });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      userDiff.unshift({ char: typed[i - 1], status: 'wrong' });
      targetDiff.unshift({ char: expected[j - 1], status: 'wrong' });
      wrongCount++;
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j] === dp[i][j - 1] + 1)) {
      userDiff.unshift({ char: '_', status: 'missing' });
      targetDiff.unshift({ char: expected[j - 1], status: 'missing' });
      missingCount++;
      j--;
    } else {
      userDiff.unshift({ char: typed[i - 1], status: 'extra' });
      extraCount++;
      i--;
    }
  }

  const reasonsAr: string[] = [];
  const reasonsEn: string[] = [];
  if (missingCount > 0) {
    reasonsAr.push(`نقص ${missingCount} حرف`);
    reasonsEn.push(`${missingCount} missing letter(s)`);
  }
  if (extraCount > 0) {
    reasonsAr.push(`${extraCount} حرف زائد`);
    reasonsEn.push(`${extraCount} extra letter(s)`);
  }
  if (wrongCount > 0) {
    reasonsAr.push(`${wrongCount} حرف مختلف`);
    reasonsEn.push(`${wrongCount} incorrect letter(s)`);
  }

  const outcome = distance <= 2 ? 'close' : 'wrong';
  return {
    expected,
    typed,
    outcome,
    userDiff,
    targetDiff,
    diagnosisAr:
      reasonsAr.length > 0
        ? `ملاحظة التصحيح: ${reasonsAr.join('، ')}. أعد كتابة الكلمة للتثبيت.`
        : 'تحقق من ترتيب الحروف وأعد المحاولة.',
    diagnosisEn:
      reasonsEn.length > 0
        ? `Correction note: ${reasonsEn.join(', ')}. Re-type to lock it in.`
        : 'Check the letter order and try again.',
  };
}

function shuffleWords(list: VocabWord[]): VocabWord[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const StoryTargetWritingTrainer: React.FC<StoryTargetWritingTrainerProps> = ({
  lang,
  story,
  targetWords,
  level,
  accent,
  speechRate,
  authToken,
  onSubmissionSaved,
}) => {
  const isAr = lang === 'ar';

  const [mode, setMode] = useState<TrainerMode>('word-drill');
  const [queueOrder, setQueueOrder] = useState<QueueOrder>('infinite-random');

  // Infinite word-writing state (strictly targetWords only)
  const [queue, setQueue] = useState<VocabWord[]>(() => shuffleWords(targetWords));
  const [queuePos, setQueuePos] = useState(0);
  const [typedWord, setTypedWord] = useState('');
  const [wordFeedback, setWordFeedback] = useState<WordAttemptFeedback | null>(null);
  const [revealHintLevel, setRevealHintLevel] = useState<0 | 1 | 2>(0);
  const [totalWordAttempts, setTotalWordAttempts] = useState(0);
  const [correctWordAttempts, setCorrectWordAttempts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wordMistakeCounts, setWordMistakeCounts] = useState<Record<string, number>>({});
  const [listeningMic, setListeningMic] = useState(false);
  const [micResult, setMicResult] = useState<string | null>(null);

  // Infinite sentence-writing & AI correction state (strictly targetWords only)
  const [focusWordIdx, setFocusWordIdx] = useState(0);
  const [sentenceDraft, setSentenceDraft] = useState('');
  const [checkingSentence, setCheckingSentence] = useState(false);
  const [sentenceError, setSentenceError] = useState<string | null>(null);
  const [sentenceResult, setSentenceResult] = useState<WritingSubmission | null>(null);
  const [sentenceHistory, setSentenceHistory] = useState<WritingSubmission[]>([]);

  // Reset cleanly when story changes
  useEffect(() => {
    setQueue(
      queueOrder === 'sequential' ? [...targetWords] : shuffleWords(targetWords)
    );
    setQueuePos(0);
    setTypedWord('');
    setWordFeedback(null);
    setRevealHintLevel(0);
    setTotalWordAttempts(0);
    setCorrectWordAttempts(0);
    setStreak(0);
    setWordMistakeCounts({});
    setMicResult(null);
    setFocusWordIdx(0);
    setSentenceDraft('');
    setSentenceError(null);
    setSentenceResult(null);
    setSentenceHistory([]);
  }, [story.id, targetWords]);

  const rebuildInfiniteQueue = useCallback(
    (order: QueueOrder, mistakesMap: Record<string, number>) => {
      if (targetWords.length === 0) return [];
      if (order === 'sequential') return [...targetWords];
      if (order === 'mistakes-first') {
        const missed = targetWords.filter((w) => (mistakesMap[w.id] ?? 0) > 0);
        if (missed.length > 0) {
          return shuffleWords(missed);
        }
      }
      return shuffleWords(targetWords);
    },
    [targetWords]
  );

  const activeWord: VocabWord | undefined =
    queue[queuePos] || targetWords[queuePos % Math.max(1, targetWords.length)];

  const handleOrderChange = (nextOrder: QueueOrder) => {
    setQueueOrder(nextOrder);
    const nextQ = rebuildInfiniteQueue(nextOrder, wordMistakeCounts);
    setQueue(nextQ);
    setQueuePos(0);
    setTypedWord('');
    setWordFeedback(null);
    setRevealHintLevel(0);
    setMicResult(null);
  };

  const advanceToNextWord = useCallback(() => {
    if (targetWords.length === 0) return;
    setTypedWord('');
    setWordFeedback(null);
    setRevealHintLevel(0);
    setMicResult(null);

    if (queuePos + 1 < queue.length) {
      setQueuePos((p) => p + 1);
    } else {
      // Seamlessly loop infinitely with a fresh batch
      const nextBatch = rebuildInfiniteQueue(queueOrder, wordMistakeCounts);
      setQueue(nextBatch);
      setQueuePos(0);
    }
  }, [queue.length, queueOrder, queuePos, rebuildInfiniteQueue, targetWords.length, wordMistakeCounts]);

  const handleCheckWordSpelling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWord || !typedWord.trim()) return;

    // If user already got exact match and presses Enter again, smoothly advance to next word
    if (wordFeedback?.outcome === 'exact' && typedWord.trim().toLowerCase() === activeWord.word.toLowerCase()) {
      advanceToNextWord();
      return;
    }

    const analysis = analyzeSpellingError(typedWord, activeWord.word);
    setWordFeedback(analysis);
    setTotalWordAttempts((c) => c + 1);

    if (analysis.outcome === 'exact') {
      setCorrectWordAttempts((c) => c + 1);
      setStreak((s) => s + 1);
      speechEngine.speakText(activeWord.word, accent, speechRate);
    } else {
      setStreak(0);
      setWordMistakeCounts((prev) => ({
        ...prev,
        [activeWord.id]: (prev[activeWord.id] ?? 0) + 1,
      }));
      // Re-inject missed word a couple of steps ahead in the current infinite queue for reinforcement
      setQueue((prev) => {
        const insertAt = Math.min(prev.length, queuePos + 3);
        const next = [...prev];
        next.splice(insertAt, 0, activeWord);
        return next;
      });
    }
  };

  const handleRetrySameWord = () => {
    setTypedWord('');
    setWordFeedback(null);
  };

  const handleMicPractice = () => {
    if (!activeWord) return;
    setListeningMic(true);
    setMicResult(null);
    listenForPronunciation(
      accent,
      (transcript) => {
        setListeningMic(false);
        const match = transcript.toLowerCase().includes(activeWord.word.toLowerCase());
        setMicResult(
          match
            ? isAr
              ? `ممتاز! تم التقاط النطق الصحيح: "${transcript}"`
              : `Great! Heard: "${transcript}"`
            : isAr
            ? `تم سماع: "${transcript}" — حاول نطق "${activeWord.word}" بوضوح.`
            : `Heard: "${transcript}" — try saying "${activeWord.word}" clearly.`
        );
      },
      (err) => {
        setListeningMic(false);
        setMicResult(err);
      }
    );
  };

  const hintDisplay = useMemo(() => {
    if (!activeWord || revealHintLevel === 0) return null;
    const w = activeWord.word;
    if (revealHintLevel === 1) {
      return `${w[0]}${' _'.repeat(Math.max(0, w.length - 1))} (${w.length})`;
    }
    return w
      .split('')
      .map((ch, idx) => (idx === 0 || idx === w.length - 1 || idx % 3 === 0 ? ch : '_'))
      .join(' ');
  }, [activeWord, revealHintLevel]);

  // Target words detected in current sentence draft
  const usedStoryWordsInDraft = useMemo(() => {
    if (!sentenceDraft.trim() || targetWords.length === 0) return [] as VocabWord[];
    const lower = sentenceDraft.toLowerCase();
    return targetWords.filter((w) => {
      const rx = new RegExp(`\\b${escapeRegExp(w.word.toLowerCase())}\\b`, 'i');
      return rx.test(lower);
    });
  }, [sentenceDraft, targetWords]);

  const focusedTargetWord = targetWords[focusWordIdx % Math.max(1, targetWords.length)];

  const handlePickRandomTargetWordForSentence = () => {
    if (targetWords.length <= 1) return;
    let next = Math.floor(Math.random() * targetWords.length);
    if (next === focusWordIdx) {
      next = (focusWordIdx + 1) % targetWords.length;
    }
    setFocusWordIdx(next);
  };

  const handleCheckSentence = async () => {
    if (sentenceDraft.trim().length < 3 || targetWords.length === 0) return;
    setCheckingSentence(true);
    setSentenceError(null);
    try {
      const res = await fetch('/api/ai/correct-writing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          text: sentenceDraft.trim(),
          level,
          topicEn: focusedTargetWord
            ? `Practice using ONLY this story's target words (especially "${focusedTargetWord.word}")`
            : `Practice using target words from story "${story.title}"`,
          topicAr: focusedTargetWord
            ? `تدريب كتابة جملة باستخدام الكلمة المستهدفة "${focusedTargetWord.word}" وكلمات القصة`
            : `تدريب كتابة باستخدام كلمات قصة "${story.titleAr}"`,
          suggestedWords: targetWords.map((w) => w.word),
          saveHistory: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSentenceError(
          data.error || (isAr ? 'تعذر تصحيح الجملة حاليًا.' : 'Correction failed.')
        );
        return;
      }
      const submission: WritingSubmission = data.submission;
      setSentenceResult(submission);
      setSentenceHistory((prev) => [submission, ...prev]);
      onSubmissionSaved?.(submission);
    } catch {
      setSentenceError(isAr ? 'تعذر الاتصال بالخادم.' : 'Network error.');
    } finally {
      setCheckingSentence(false);
    }
  };

  const handleNewInfiniteSentenceRound = () => {
    setSentenceDraft('');
    setSentenceError(null);
    setSentenceResult(null);
    handlePickRandomTargetWordForSentence();
  };

  const accuracyPct =
    totalWordAttempts > 0 ? Math.round((correctWordAttempts / totalWordAttempts) * 100) : 0;

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
      {/* Header & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
            <InfinityIcon className="w-4 h-4" />
            <span>
              {isAr
                ? `تدريب لانهائي حصريًا على الكلمات المستهدفة (${targetWords.length} كلمة فقط)`
                : `Unlimited Practice · Exclusively This Story's ${targetWords.length} Target Words`}
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            {isAr
              ? 'تدريب الكتابة على الكلمات المستهدفة وتصحيح الأخطاء'
              : 'Target-Words Writing Trainer & Error Correction'}
          </h2>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setMode('word-drill')}
            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'word-drill'
                ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isAr ? 'كتابة وإملاء الكلمات (∞)' : 'Word Spelling Drill (∞)'}
          </button>
          <button
            type="button"
            onClick={() => setMode('sentence-practice')}
            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'sentence-practice'
                ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isAr ? 'كتابة جمل وتصحيح الأخطاء (∞)' : 'Sentence Writing & AI Fix (∞)'}
          </button>
        </div>
      </div>

      {/* MODE 1: INFINITE TARGET-WORD SPELLING & LETTER-LEVEL ERROR CORRECTION */}
      {mode === 'word-drill' && activeWord && (
        <div className="space-y-4">
          {/* Infinite Session Stats + Order Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-400 tabular-nums">
              <span>
                {isAr ? 'الممارسة:' : 'Practiced:'}{' '}
                <strong className="text-slate-900 dark:text-white">{totalWordAttempts} / ∞</strong>
              </span>
              <span>
                {isAr ? 'الدقة:' : 'Accuracy:'}{' '}
                <strong className="text-emerald-700 dark:text-emerald-400">{accuracyPct}%</strong>
              </span>
              <span>
                {isAr ? 'سلسلة الصح:' : 'Streak:'}{' '}
                <strong className="text-blue-700 dark:text-blue-400">{streak}</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['infinite-random', isAr ? 'عشوائي بلا حدود' : 'Endless Random'],
                  ['sequential', isAr ? 'بالترتيب' : 'Sequential'],
                  [
                    'mistakes-first',
                    isAr
                      ? `أخطائي (${Object.keys(wordMistakeCounts).length})`
                      : `Missed (${Object.keys(wordMistakeCounts).length})`,
                  ],
                ] as Array<[QueueOrder, string]>
              ).map(([ord, label]) => (
                <button
                  key={ord}
                  type="button"
                  onClick={() => handleOrderChange(ord)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    queueOrder === ord
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Active Target Word Card */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isAr
                    ? 'اكتب الكلمة الإنجليزية المستهدفة المطابقة لهذا المعنى:'
                    : 'Type the English target word matching this meaning:'}
                </p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {activeWord.translationAr}
                </p>
                {hintDisplay && (
                  <p
                    dir="ltr"
                    className="mt-1.5 text-left text-sm font-mono font-semibold text-blue-700 dark:text-blue-400 tracking-wider"
                  >
                    {hintDisplay}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => speechEngine.speakText(activeWord.word, accent, speechRate)}
                  className="min-h-[44px] px-3.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{isAr ? 'استمع للنطق' : 'Listen'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setRevealHintLevel((prev) => (prev === 0 ? 1 : prev === 1 ? 2 : 0))
                  }
                  className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>{isAr ? 'تلميح' : 'Hint'}</span>
                </button>

                {isSpeechRecognitionSupported() && (
                  <button
                    type="button"
                    onClick={handleMicPractice}
                    disabled={listeningMic}
                    className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                      listeningMic
                        ? 'bg-red-600 text-white border-red-600'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                    <span>{listeningMic ? (isAr ? 'تحدّث...' : 'Speak...') : isAr ? 'انطق' : 'Speak'}</span>
                  </button>
                )}
              </div>
            </div>

            {micResult && (
              <p className="text-xs text-blue-700 dark:text-blue-400 font-medium">{micResult}</p>
            )}

            <form onSubmit={handleCheckWordSpelling} className="flex flex-wrap sm:flex-nowrap gap-2">
              <input
                type="text"
                dir="ltr"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={typedWord}
                onChange={(e) => {
                  setTypedWord(e.target.value);
                  if (wordFeedback) setWordFeedback(null);
                }}
                placeholder="Type the target English word..."
                className="flex-1 min-w-[200px] min-h-[46px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-base text-left font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={!typedWord.trim()}
                className="min-h-[46px] px-5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold disabled:opacity-40 cursor-pointer shrink-0"
              >
                {wordFeedback?.outcome === 'exact'
                  ? isAr
                    ? 'التالي ←'
                    : 'Next →'
                  : isAr
                  ? 'تحقق وصحّح'
                  : 'Check & Fix'}
              </button>
            </form>

            {/* Detailed Error Correction Feedback */}
            {wordFeedback && (
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  wordFeedback.outcome === 'exact'
                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30'
                    : 'border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-950/30'
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-bold">
                  {wordFeedback.outcome === 'exact' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
                  )}
                  <span
                    className={
                      wordFeedback.outcome === 'exact'
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-red-800 dark:text-red-300'
                    }
                  >
                    {isAr ? wordFeedback.diagnosisAr : wordFeedback.diagnosisEn}
                  </span>
                </div>

                {wordFeedback.outcome !== 'exact' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        {isAr ? 'ما كتبته (موضع الخطأ):' : 'What you typed (error highlighted):'}
                      </p>
                      <div dir="ltr" className="text-left font-mono text-base font-bold tracking-wide">
                        {wordFeedback.userDiff.map((tok, idx) => (
                          <span
                            key={idx}
                            className={
                              tok.status === 'match'
                                ? 'text-slate-800 dark:text-slate-200'
                                : tok.status === 'missing'
                                ? 'text-amber-600 dark:text-amber-400 underline mx-0.5'
                                : 'text-red-600 dark:text-red-400 line-through bg-red-100/70 dark:bg-red-950/60 px-0.5 rounded'
                            }
                          >
                            {tok.char}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800">
                      <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                        {isAr ? 'التصحيح الصحيح:' : 'Correct spelling:'}
                      </p>
                      <div dir="ltr" className="text-left font-mono text-base font-bold tracking-wide">
                        {wordFeedback.targetDiff.map((tok, idx) => (
                          <span
                            key={idx}
                            className={
                              tok.status === 'match'
                                ? 'text-emerald-800 dark:text-emerald-300'
                                : 'text-white bg-emerald-600 dark:bg-emerald-500 px-1 rounded mx-0.5'
                            }
                          >
                            {tok.char}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {wordFeedback.outcome !== 'exact' && (
                    <button
                      type="button"
                      onClick={handleRetrySameWord}
                      className="min-h-[40px] px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isAr ? 'أعد كتابة هذه الكلمة الآن' : 'Re-type Word Now'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={advanceToNextWord}
                    className="min-h-[40px] px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>{isAr ? 'الكلمة المستهدفة التالية (∞)' : 'Next Target Word (∞)'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {isAr
                ? 'التدريب مستمر بلا حدود على كلمات هذه القصة فقط، والكلمات التي تخطئ فيها تتكرر تلقائيًا حتى تتقنها.'
                : 'Practice continues endlessly using only this story’s target words; missed words repeat automatically.'}
            </span>
            <button
              type="button"
              onClick={advanceToNextWord}
              className="min-h-[40px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isAr ? 'تبديل الكلمة' : 'Skip / Next Word'}</span>
            </button>
          </div>
        </div>
      )}

      {/* MODE 2: INFINITE SENTENCE WRITING WITH ONLY TARGET WORDS + AI ERROR CORRECTION */}
      {mode === 'sentence-practice' && (
        <div className="space-y-4">
          {/* Focused Target Word Challenge Bar */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr
                  ? 'اكتب جملة أو فقرة باستخدام الكلمات المستهدفة لهذه القصة فقط (تحدٍ لا نهائي):'
                  : 'Write a sentence using ONLY this story’s target words (unlimited attempts):'}
              </p>
              {focusedTargetWord && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {isAr ? 'الكلمة المقترحة الآن:' : 'Suggested focus word:'}
                  </span>
                  <span dir="ltr" className="text-base font-bold text-red-700 dark:text-red-400">
                    {focusedTargetWord.word}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({focusedTargetWord.translationAr})
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handlePickRandomTargetWordForSentence}
              className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Shuffle className="w-4 h-4" />
              <span>{isAr ? 'تغيير الكلمة المقترحة' : 'New Target Word'}</span>
            </button>
          </div>

          {/* Clickable Story Target Words (ONLY the story's target words) */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span>
                {isAr
                  ? 'اضغط على أي كلمة مستهدفة من القصة لإدراجها في كتابتك:'
                  : 'Tap any target word from this story to insert it:'}
              </span>
              <span className="tabular-nums font-medium">
                {isAr
                  ? `استُخدمت: ${usedStoryWordsInDraft.length} / ${targetWords.length}`
                  : `Used: ${usedStoryWordsInDraft.length} / ${targetWords.length}`}
              </span>
            </div>
            <div dir="ltr" className="flex flex-wrap gap-2">
              {targetWords.map((w, idx) => {
                const isUsed = usedStoryWordsInDraft.some((u) => u.id === w.id);
                const isFocus = focusedTargetWord?.id === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    title={w.translationAr}
                    onClick={() => {
                      setFocusWordIdx(idx);
                      setSentenceDraft((prev) => (prev.trim() ? `${prev.trimEnd()} ${w.word}` : w.word));
                    }}
                    className={`min-h-[38px] px-3 rounded-lg border text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                      isUsed
                        ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                        : isFocus
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-red-700 dark:text-red-400'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-red-700 dark:text-red-400 hover:border-blue-500'
                    }`}
                  >
                    {isUsed && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                    <span>{w.word}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <textarea
            dir="ltr"
            rows={4}
            value={sentenceDraft}
            onChange={(e) => setSentenceDraft(e.target.value)}
            placeholder={
              focusedTargetWord
                ? `Write a sentence using "${focusedTargetWord.word}" and other red target words...`
                : 'Write English sentences using the story target words...'
            }
            className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-left leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-600"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-mono-nums text-slate-500 dark:text-slate-400">
              {isAr
                ? `محاولات التصحيح في هذه القصة: ${sentenceHistory.length} / ∞`
                : `Correction attempts on this story: ${sentenceHistory.length} / ∞`}
            </span>

            <div className="flex flex-wrap items-center gap-2">
              {(sentenceResult || sentenceDraft.trim()) && (
                <button
                  type="button"
                  onClick={handleNewInfiniteSentenceRound}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isAr ? 'تدريب جديد (∞)' : 'New Attempt (∞)'}</span>
                </button>
              )}

              <button
                type="button"
                disabled={checkingSentence || sentenceDraft.trim().length < 3}
                onClick={handleCheckSentence}
                className="min-h-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {checkingSentence
                    ? isAr
                      ? 'جاري تصحيح الأخطاء...'
                      : 'Correcting Errors...'
                    : isAr
                    ? 'صحّح الجملة والأخطاء مجانًا'
                    : 'Correct Errors for Free'}
                </span>
              </button>
            </div>
          </div>

          {sentenceError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-800 dark:text-red-300"
            >
              {sentenceError}
            </div>
          )}

          {sentenceResult && (
            <div className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  {isAr ? 'الجملة المصحّحة:' : 'Corrected Sentence:'}
                </p>
                {sentenceResult.suggestedWordsUsed.length > 0 && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {isAr ? 'كلمات مستهدفة مستخدمة:' : 'Target words used:'}{' '}
                    <strong dir="ltr" className="text-slate-800 dark:text-slate-200">
                      {sentenceResult.suggestedWordsUsed.join(', ')}
                    </strong>
                  </span>
                )}
              </div>

              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-3">
                <p dir="ltr" className="text-sm text-left font-medium text-slate-900 dark:text-white leading-relaxed">
                  {sentenceResult.correctedText}
                </p>
                <button
                  type="button"
                  onClick={() => speechEngine.speakText(sentenceResult.correctedText, accent, speechRate)}
                  aria-label="Listen to corrected sentence"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {sentenceResult.overallFeedbackAr}
              </p>

              {sentenceResult.errors.length > 0 ? (
                <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    {isAr
                      ? `تفاصيل الأخطاء وتصحيحها (${sentenceResult.errors.length}):`
                      : `Error Breakdown (${sentenceResult.errors.length}):`}
                  </p>
                  {sentenceResult.errors.map((err, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                    >
                      <div dir="ltr" className="text-left font-semibold">
                        <span className="line-through text-red-600 dark:text-red-400">
                          {err.original}
                        </span>
                        {' → '}
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {err.correction}
                        </span>
                        <span className="text-slate-400 ms-2">({err.errorType})</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300">
                        <span className="font-semibold">{isAr ? 'التصحيح:' : 'Rule:'}</span>{' '}
                        {err.ruleAr ? `${err.ruleAr} — ` : ''}
                        {err.explanationAr}
                      </p>
                      {err.exampleEn && (
                        <p dir="ltr" className="text-left text-blue-700 dark:text-blue-400">
                          Ex: {err.exampleEn}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {isAr
                    ? 'لا توجد أخطاء نحوية أو إملائية في جملتك! جرّب كلمة مستهدفة أخرى.'
                    : 'No grammar or spelling mistakes found! Try another target word.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
