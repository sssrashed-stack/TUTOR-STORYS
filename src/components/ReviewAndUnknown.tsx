import React, { useMemo, useState } from 'react';
import { Bell, BookOpen, Check, Download, Play, Sparkles, Volume2 } from 'lucide-react';
import type {
  AccentType,
  CEFRLevel,
  UILanguage,
  UserWordProgress,
  VocabWord,
} from '../types.ts';
import { escapeRegExp } from '../data/curriculum.ts';
import { speechEngine } from '../utils/speech.ts';
import { FlashcardDeck } from './FlashcardDeck.tsx';

interface ReviewAndUnknownProps {
  lang: UILanguage;
  userLevel: CEFRLevel;
  wordsById: Record<string, VocabWord>;
  wordProgress: Record<string, UserWordProgress>;
  accent: AccentType;
  speechRate: number;
  authToken: string;
  onWordOutcome: (wordId: string, outcome: 'known' | 'unknown') => void;
}

export const ReviewAndUnknown: React.FC<ReviewAndUnknownProps> = ({
  lang,
  userLevel,
  wordsById,
  wordProgress,
  accent,
  speechRate,
  authToken,
  onWordOutcome,
}) => {
  const isAr = lang === 'ar';
  const [tab, setTab] = useState<'due' | 'unknown'>('due');
  const [reviewingDeck, setReviewingDeck] = useState(false);
  const [exportTarget, setExportTarget] = useState<'unknown' | 'mastered'>('unknown');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Unknown words writing drill state
  const [practiceIdx, setPracticeIdx] = useState(0);
  const [typedSpelling, setTypedSpelling] = useState('');
  const [spellingState, setSpellingState] = useState<'idle' | 'ok' | 'bad'>('idle');

  // Ephemeral AI story state (never saved)
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [ephemeralStory, setEphemeralStory] = useState<{
    title: string;
    titleAr: string;
    text: string;
  } | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);

  const dueWords = useMemo(() => {
    const now = Date.now();
    return Object.values(wordProgress)
      .filter((p) => p.status !== 'mastered' && new Date(p.nextReviewAt).getTime() <= now)
      .map((p) => wordsById[p.wordId])
      .filter(Boolean);
  }, [wordProgress, wordsById]);

  const unknownWords = useMemo(() => {
    return Object.values(wordProgress)
      .filter((p) => p.isUnknown)
      .map((p) => wordsById[p.wordId])
      .filter(Boolean);
  }, [wordProgress, wordsById]);

  const masteredWords = useMemo(() => {
    return Object.values(wordProgress)
      .filter((p) => p.status === 'mastered')
      .map((p) => wordsById[p.wordId])
      .filter(Boolean);
  }, [wordProgress, wordsById]);

  const selectedExportWords = exportTarget === 'unknown' ? unknownWords : masteredWords;

  const handleExportCsv = () => {
    if (selectedExportWords.length === 0) return;

    const escapeCsvCell = (value: string) => {
      const sanitized = value.replace(/\r?\n/g, ' ');
      if (/[",]/.test(sanitized)) {
        return `"${sanitized.replace(/"/g, '""')}"`;
      }
      return sanitized;
    };

    const headers = [
      'Word',
      'Arabic Translation',
      'Level',
      'Part of Speech',
      'Phonetic',
      'Category',
      'Status',
      'Example Sentence',
    ];

    const rows = selectedExportWords.map((w) => [
      w.word,
      w.translationAr,
      w.level,
      w.partOfSpeech,
      w.phonetic || '',
      w.category,
      exportTarget === 'unknown' ? 'Unknown' : 'Mastered',
      w.sentences[0] || '',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(','))
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `tutor-story-${exportTarget}-words-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    setExportNotice(
      isAr
        ? `تم تصدير ${selectedExportWords.length} كلمة إلى ملف CSV.`
        : `Exported ${selectedExportWords.length} words to CSV.`
    );
  };

  const handleToggleReminder = async () => {
    if (typeof Notification === 'undefined') return;
    if (!reminderEnabled) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setReminderEnabled(true);
        new Notification('Tutor Story', {
          body: isAr
            ? `لديك ${dueWords.length} كلمة مستحقة لمراجعة اليوم.`
            : `You have ${dueWords.length} words due for today’s review.`,
        });
      }
    } else {
      setReminderEnabled(false);
    }
  };

  const handleGenerateEphemeralStory = async () => {
    if (!unknownWords.length) return;
    setAiLoading(true);
    setAiError(null);
    setEphemeralStory(null);
    try {
      const sample = unknownWords.slice(0, 12).map((w) => ({
        word: w.word,
        translationAr: w.translationAr,
      }));
      const res = await fetch('/api/ai/ephemeral-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ words: sample, level: userLevel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || (isAr ? 'تعذر إنشاء القصة حاليًا.' : 'Failed to generate story.'));
        return;
      }
      setEphemeralStory(data.story);
    } catch {
      setAiError(isAr ? 'تعذر الاتصال بالخادم.' : 'Network error.');
    } finally {
      setAiLoading(false);
    }
  };

  const renderHighlightedEphemeral = (text: string) => {
    const wordsList = unknownWords.slice(0, 12);
    if (!wordsList.length) return text;
    const map = new Map(wordsList.map((w) => [w.word.toLowerCase(), w]));
    const regex = new RegExp(
      `\\b(${wordsList.map((w) => escapeRegExp(w.word)).join('|')})\\b`,
      'gi'
    );
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const matched = map.get(m[0].toLowerCase());
      parts.push(
        <button
          key={`${m.index}-${m[0]}`}
          type="button"
          onClick={() => matched && speechEngine.speakText(matched.word, accent, speechRate)}
          title={matched?.translationAr}
          className="font-bold text-red-700 dark:text-red-400 underline decoration-red-300 underline-offset-4 px-0.5 cursor-pointer"
        >
          {m[0]}
        </button>
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  const activeUnknown = unknownWords[practiceIdx % Math.max(1, unknownWords.length)];

  const handleCheckUnknownSpelling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUnknown) return;
    if (typedSpelling.trim().toLowerCase() === activeUnknown.word.toLowerCase()) {
      setSpellingState('ok');
      speechEngine.speakText(activeUnknown.word, accent, speechRate);
    } else {
      setSpellingState('bad');
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setTab('due');
              setReviewingDeck(false);
            }}
            className={`min-h-[44px] px-4 text-xs sm:text-sm font-semibold rounded-lg cursor-pointer tabular-nums ${
              tab === 'due'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {isAr ? `مراجعة اليوم (${dueWords.length})` : `Today’s Review (${dueWords.length})`}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('unknown');
              setReviewingDeck(false);
            }}
            className={`min-h-[44px] px-4 text-xs sm:text-sm font-semibold rounded-lg cursor-pointer tabular-nums ${
              tab === 'unknown'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {isAr ? `الكلمات التي لا أعرفها (${unknownWords.length})` : `Unknown Words (${unknownWords.length})`}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export Unknown or Mastered Vocabulary List as CSV */}
          <div className="flex items-center gap-1.5">
            <select
              aria-label={isAr ? 'اختر القائمة للتصدير' : 'Select vocabulary list to export'}
              value={exportTarget}
              onChange={(e) => {
                setExportTarget(e.target.value as 'unknown' | 'mastered');
                setExportNotice(null);
              }}
              className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              <option value="unknown">
                {isAr
                  ? `غير المعروفة (${unknownWords.length})`
                  : `Unknown (${unknownWords.length})`}
              </option>
              <option value="mastered">
                {isAr
                  ? `المتقنة (${masteredWords.length})`
                  : `Mastered (${masteredWords.length})`}
              </option>
            </select>

            <button
              type="button"
              disabled={selectedExportWords.length === 0}
              onClick={handleExportCsv}
              className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span>{isAr ? 'تصدير CSV' : 'Export CSV'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleToggleReminder}
            className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 cursor-pointer ${
              reminderEnabled
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300'
                : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>
              {reminderEnabled
                ? isAr
                  ? 'التذكير مفعّل'
                  : 'Reminder On'
                : isAr
                ? 'تفعيل تذكير المراجعة'
                : 'Enable Review Reminder'}
            </span>
          </button>
        </div>
      </div>

      {exportNotice && (
        <div
          role="status"
          className="px-4 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-medium text-emerald-800 dark:text-emerald-300"
        >
          {exportNotice}
        </div>
      )}

      {tab === 'due' ? (
        reviewingDeck ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setReviewingDeck(false)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              {isAr ? 'العودة لقائمة المراجعة' : 'Back to Review List'}
            </button>
            <FlashcardDeck
              lang={lang}
              words={dueWords}
              accent={accent}
              speechRate={speechRate}
              onEvaluate={onWordOutcome}
              onFinish={() => setReviewingDeck(false)}
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">
                  {isAr ? 'جلسة التكرار المتباعد اليومية' : 'Daily Spaced Repetition Session'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {isAr
                    ? 'جدول التباعد: اليوم ← غدًا ← 3 أيام ← أسبوع ← أسبوعان ← شهر'
                    : 'Schedule: Today → Tomorrow → 3 days → 7 days → 14 days → 30 days'}
                </p>
              </div>
              {dueWords.length > 0 && (
                <button
                  type="button"
                  onClick={() => setReviewingDeck(true)}
                  className="min-h-[44px] px-5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold cursor-pointer"
                >
                  {isAr ? `ابدأ مراجعة ${dueWords.length} كلمة` : `Review ${dueWords.length} Due Words`}
                </button>
              )}
            </div>

            {dueWords.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  {isAr
                    ? 'لا توجد كلمات مستحقة الآن! اقرأ قصة جديدة أو راجع البطاقات التعليمية.'
                    : 'You are all caught up for today! Read a new story or practice flashcards.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {dueWords.map((w) => {
                  const p = wordProgress[w.id];
                  return (
                    <div
                      key={w.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p dir="ltr" className="font-bold text-red-700 dark:text-red-400 text-left">
                          {w.word}
                        </p>
                        <p className="text-sm text-slate-700 dark:text-slate-300">{w.translationAr}</p>
                        <p className="text-xs text-slate-500 mt-1 tabular-nums">
                          {p.status === 'learning'
                            ? isAr
                              ? 'قيد التعلّم'
                              : 'Learning'
                            : isAr
                            ? 'جديدة'
                            : 'New'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => speechEngine.speakText(w.word, accent, speechRate)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )
      ) : (
        /* Unknown Words Vault + Writing Practice + Ephemeral AI Story */
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">
                  {isAr ? 'الكلمات التي لا أعرفها' : 'Words I Don’t Know Yet'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {isAr
                    ? 'تُحفظ هنا تلقائيًا لكي تتدرّب على كتابتها أو تنشئ بها قصة ذكاء اصطناعي مؤقتة.'
                    : 'Saved per user for focused spelling practice or generating a temporary AI story.'}
                </p>
              </div>

              {unknownWords.length > 0 && (
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={handleGenerateEphemeralStory}
                  className="min-h-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {aiLoading
                      ? isAr
                        ? 'جاري تأليف القصة...'
                        : 'Generating Story...'
                      : isAr
                      ? 'إنشاء قصة قصيرة بالذكاء الاصطناعي'
                      : 'Generate AI Practice Story'}
                  </span>
                </button>
              )}
            </div>

            {aiError && (
              <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-800 dark:text-red-300">
                {aiError}
              </div>
            )}

            {/* Ephemeral AI Story Output (NOT saved to DB) */}
            {ephemeralStory && (
              <div className="p-5 sm:p-6 rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                      {isAr
                        ? 'قصة مؤقتة مولّدة بالذكاء الاصطناعي (لا يتم حفظها)'
                        : 'Temporary AI Practice Story (Not Saved)'}
                    </p>
                    <h3 dir="ltr" className="text-lg font-bold text-slate-900 dark:text-white text-left mt-1">
                      {ephemeralStory.title}
                    </h3>
                    {isAr && (
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {ephemeralStory.titleAr}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => speechEngine.speakText(ephemeralStory.text, accent, speechRate)}
                    className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>{isAr ? 'استمع للقصة' : 'Listen'}</span>
                  </button>
                </div>

                <p dir="ltr" className="text-left text-base leading-8 text-slate-800 dark:text-slate-200">
                  {renderHighlightedEphemeral(ephemeralStory.text)}
                </p>
              </div>
            )}

            {unknownWords.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {isAr
                    ? 'لم تضف أي كلمات غير معروفة بعد. اضغط «لا أعرفها» على أي كلمة داخل القصة أو البطاقات.'
                    : 'No unknown words saved yet. Tap "Don’t Know" on any word inside a story or flashcard.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {unknownWords.map((w) => (
                  <div
                    key={w.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p dir="ltr" className="font-bold text-red-700 dark:text-red-400 text-left">
                        {w.word}
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{w.translationAr}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => speechEngine.speakText(w.word, accent, speechRate)}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onWordOutcome(w.id, 'known')}
                        title={isAr ? 'أعرفها الآن' : 'Mark Known'}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-emerald-700 text-white cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Writing Practice specifically for Unknown Words */}
          {activeUnknown && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">
                  {isAr ? 'تدريب كتابة الكلمات التي لا أعرفها' : 'Spelling Drill for Unknown Words'}
                </h3>
                <span className="text-xs font-mono-nums text-slate-500">
                  {(practiceIdx % unknownWords.length) + 1} / {unknownWords.length}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500">{isAr ? 'اكتب الإملاء الإنجليزي للكلمة:' : 'Spell the word for:'}</p>
                  <p className="text-lg font-bold mt-0.5">{activeUnknown.translationAr}</p>
                </div>
                <button
                  type="button"
                  onClick={() => speechEngine.speakText(activeUnknown.word, accent, speechRate)}
                  className="min-h-[44px] px-4 rounded-xl bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{isAr ? 'نطق الكلمة' : 'Hear Word'}</span>
                </button>
              </div>

              <form onSubmit={handleCheckUnknownSpelling} className="flex gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={typedSpelling}
                  onChange={(e) => {
                    setTypedSpelling(e.target.value);
                    setSpellingState('idle');
                  }}
                  placeholder="Type English spelling..."
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-left text-sm"
                />
                <button
                  type="submit"
                  className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                >
                  {isAr ? 'تحقق' : 'Check'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPracticeIdx((i) => i + 1);
                    setTypedSpelling('');
                    setSpellingState('idle');
                  }}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  {isAr ? 'التالي' : 'Next'}
                </button>
              </form>

              {spellingState === 'ok' && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {isAr ? 'أحسنت! كتابة صحيحة.' : 'Correct spelling!'}
                </p>
              )}
              {spellingState === 'bad' && (
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                  {isAr ? `الإجابة الصحيحة: ${activeUnknown.word}` : `Expected: ${activeUnknown.word}`}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
