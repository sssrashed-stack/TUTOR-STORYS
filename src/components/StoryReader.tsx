import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Headphones,
  Pause,
  Play,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import type {
  AccentType,
  CEFRLevel,
  FontSizeOption,
  Story,
  UILanguage,
  UserWordProgress,
  VocabWord,
  WritingSubmission,
} from '../types.ts';
import { escapeRegExp } from '../data/curriculum.ts';
import { POS_AR, POS_EN, UI_TEXT } from '../i18n/translations.ts';
import { speechEngine } from '../utils/speech.ts';
import { PronunciationTrainer } from './PronunciationTrainer.tsx';
import { StoryTargetWritingTrainer } from './StoryTargetWritingTrainer.tsx';

interface StoryReaderProps {
  lang: UILanguage;
  story: Story;
  levelStories: Story[];
  wordsById: Record<string, VocabWord>;
  wordProgress: Record<string, UserWordProgress>;
  isCompleted: boolean;
  isBookmarked: boolean;
  accent: AccentType;
  onChangeAccent: (a: AccentType) => void;
  fontSize: FontSizeOption;
  onChangeFontSize: (fs: FontSizeOption) => void;
  speechRate: number;
  onChangeSpeechRate: (r: number) => void;
  playlistActive: boolean;
  onToggleLevelPlaylist: () => void;
  onSelectLevel: (level: CEFRLevel) => void;
  onSelectStory: (story: Story) => void;
  onToggleComplete: (storyId: string, completed: boolean) => void;
  onToggleBookmark: (storyId: string, bookmarked: boolean) => void;
  onWordOutcome: (wordId: string, outcome: 'known' | 'unknown') => void;
  onOpenFlashcards: (wordIds: string[]) => void;
  onOpenQuiz: (wordIds: string[], storyId: string) => void;
  authToken: string;
  onSubmissionSaved?: (sub: WritingSubmission) => void;
}

const FONT_SIZE_CLASSES: Record<FontSizeOption, string> = {
  sm: 'text-base leading-7',
  md: 'text-lg leading-8',
  lg: 'text-xl leading-9',
  xl: 'text-2xl leading-10',
};

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75];

export const StoryReader: React.FC<StoryReaderProps> = ({
  lang,
  story,
  levelStories,
  wordsById,
  wordProgress,
  isCompleted,
  isBookmarked,
  accent,
  onChangeAccent,
  fontSize,
  onChangeFontSize,
  speechRate,
  onChangeSpeechRate,
  playlistActive,
  onToggleLevelPlaylist,
  onSelectLevel,
  onSelectStory,
  onToggleComplete,
  onToggleBookmark,
  onWordOutcome,
  onOpenFlashcards,
  onOpenQuiz,
  authToken,
  onSubmissionSaved,
}) => {
  const isAr = lang === 'ar';
  const t = UI_TEXT[lang];

  const [translateSpeechEnabled, setTranslateSpeechEnabled] = useState(true);
  const [selectedWord, setSelectedWord] = useState<VocabWord | null>(null);
  const [readingStory, setReadingStory] = useState(false);
  const [activeCharIdx, setActiveCharIdx] = useState(-1);
  const [sequencePlaying, setSequencePlaying] = useState<'none' | 'words' | 'words-ar'>('none');
  const [activeSeqWordId, setActiveSeqWordId] = useState<string | null>(null);

  const storyTargetWords = useMemo(
    () => story.targetWordIds.map((id) => wordsById[id]).filter(Boolean),
    [story.targetWordIds, wordsById]
  );

  const targetWordLookup = useMemo(() => {
    const map = new Map<string, VocabWord>();
    for (const w of storyTargetWords) {
      map.set(w.word.toLowerCase(), w);
    }
    return map;
  }, [storyTargetWords]);

  useEffect(() => {
    setReadingStory(false);
    setSequencePlaying('none');
    setActiveCharIdx(-1);
  }, [story.id]);

  // Tokenize story preserving punctuation while highlighting the 15 target words in bold red
  const storySegments = useMemo(() => {
    if (!storyTargetWords.length) return [{ text: story.text, word: null as VocabWord | null, start: 0 }];
    const sortedWords = [...storyTargetWords]
      .map((w) => escapeRegExp(w.word))
      .sort((a, b) => b.length - a.length);
    const regex = new RegExp(`\\b(${sortedWords.join('|')})\\b`, 'gi');
    const parts: Array<{ text: string; word: VocabWord | null; start: number }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(story.text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          text: story.text.slice(lastIndex, match.index),
          word: null,
          start: lastIndex,
        });
      }
      const matchedText = match[0];
      const matchedVocab = targetWordLookup.get(matchedText.toLowerCase()) ?? null;
      parts.push({
        text: matchedText,
        word: matchedVocab,
        start: match.index,
      });
      lastIndex = match.index + matchedText.length;
    }
    if (lastIndex < story.text.length) {
      parts.push({
        text: story.text.slice(lastIndex),
        word: null,
        start: lastIndex,
      });
    }
    return parts;
  }, [story.text, storyTargetWords, targetWordLookup]);

  const handlePlayStory = () => {
    if (readingStory) {
      speechEngine.stop();
      setReadingStory(false);
      setActiveCharIdx(-1);
      return;
    }
    setSequencePlaying('none');
    setReadingStory(true);
    speechEngine.speakStoryWithTracking(
      story.text,
      accent,
      speechRate,
      (charIdx) => setActiveCharIdx(charIdx),
      () => {
        setReadingStory(false);
        setActiveCharIdx(-1);
      }
    );
  };

  const handlePlayWords = (withTranslation: boolean) => {
    const mode = withTranslation ? 'words-ar' : 'words';
    if (sequencePlaying === mode) {
      speechEngine.stop();
      setSequencePlaying('none');
      setActiveSeqWordId(null);
      return;
    }
    setReadingStory(false);
    setSequencePlaying(mode);
    speechEngine.speakWordSequence(
      storyTargetWords,
      withTranslation,
      accent,
      speechRate,
      (wid) => setActiveSeqWordId(wid),
      () => {
        setSequencePlaying('none');
        setActiveSeqWordId(null);
      }
    );
  };

  const handleTapTargetWord = (vocab: VocabWord) => {
    if (translateSpeechEnabled) {
      speechEngine.speakText(vocab.word, accent, speechRate);
    }
    setSelectedWord(vocab);
  };

  const currentStoryIdx = levelStories.findIndex((s) => s.id === story.id);
  const prevStory = currentStoryIdx > 0 ? levelStories[currentStoryIdx - 1] : null;
  const nextStory =
    currentStoryIdx >= 0 && currentStoryIdx < levelStories.length - 1
      ? levelStories[currentStoryIdx + 1]
      : null;

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      {/* Top Reader Toolbar: Level Selector, Font Size, Speed, Accent, Listen-All-Level */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Level Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {(['A1', 'A2', 'B1', 'B2'] as CEFRLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => onSelectLevel(lvl)}
                className={`min-h-[40px] px-3 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  story.level === lvl
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Lock-screen / Continuous Level Audio Playlist */}
          <button
            type="button"
            onClick={onToggleLevelPlaylist}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              playlistActive
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-700 hover:bg-blue-800 text-white'
            }`}
          >
            {playlistActive ? <Square className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
            <span>{playlistActive ? t.reader.stopPlaylist : t.reader.listenAllLevel}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          {/* Font Size Control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {isAr ? 'حجم الخط:' : 'Font:'}
            </span>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['sm', 'md', 'lg', 'xl'] as FontSizeOption[]).map((fs) => (
                <button
                  key={fs}
                  type="button"
                  onClick={() => onChangeFontSize(fs)}
                  className={`min-h-[36px] min-w-[36px] px-2 text-xs font-semibold rounded-md cursor-pointer ${
                    fontSize === fs
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {fs.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Speed 0.5x - 1.75x + US/UK Accent + Tap-to-Translate Mode */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={isAr ? 'سرعة القراءة' : 'Reading speed'}
              value={speechRate}
              onChange={(e) => onChangeSpeechRate(parseFloat(e.target.value))}
              className="min-h-[40px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono-nums font-semibold"
            >
              {SPEED_OPTIONS.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}x
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => onChangeAccent('en-US')}
                className={`min-h-[36px] px-2.5 text-xs font-semibold rounded-md cursor-pointer ${
                  accent === 'en-US'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                US
              </button>
              <button
                type="button"
                onClick={() => onChangeAccent('en-GB')}
                className={`min-h-[36px] px-2.5 text-xs font-semibold rounded-md cursor-pointer ${
                  accent === 'en-GB'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                UK
              </button>
            </div>

            <button
              type="button"
              onClick={() => setTranslateSpeechEnabled((v) => !v)}
              className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                translateSpeechEnabled
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              {t.reader.translationSpeechMode}: {translateSpeechEnabled ? (isAr ? 'مفعّل' : 'ON') : isAr ? 'متوقف' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* Story Card */}
      <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            {/* Zero-pill unboxed metadata */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 tabular-nums">
              <span className="font-bold text-blue-700 dark:text-blue-400">{story.level}</span>
              <span aria-hidden="true">·</span>
              <span>
                {isAr ? `القصة ${story.index} من 50` : `Story ${story.index} of 50`}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                15 {t.reader.wordsCount}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {story.estimatedMinutes} {t.reader.estTime}
              </span>
            </div>
            <h1 dir="ltr" className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-left">
              {story.title}
            </h1>
            {isAr && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{story.titleAr}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePlayStory}
              className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              {readingStory ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{readingStory ? (isAr ? 'إيقاف القراءة' : 'Stop Reading') : t.reader.readStory}</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleBookmark(story.id, !isBookmarked)}
              aria-label={isBookmarked ? t.reader.bookmarked : t.reader.bookmark}
              aria-pressed={isBookmarked}
              title={isBookmarked ? t.reader.bookmarked : t.reader.bookmark}
              className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors ${
                isBookmarked
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
              <span>{isBookmarked ? t.reader.bookmarked : t.reader.bookmark}</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleComplete(story.id, !isCompleted)}
              className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold border inline-flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                isCompleted
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isCompleted ? t.reader.completed : t.reader.markCompleted}</span>
            </button>
          </div>
        </div>

        {/* Always LTR Story Body with Bold Red Target Words */}
        <div
          dir="ltr"
          className={`mt-6 text-left text-slate-800 dark:text-slate-200 max-w-3xl select-text ${FONT_SIZE_CLASSES[fontSize]}`}
        >
          {storySegments.map((seg, i) => {
            const isCurrentlySpoken =
              activeCharIdx >= 0 &&
              activeCharIdx >= seg.start &&
              activeCharIdx < seg.start + seg.text.length + 6;

            if (seg.word) {
              return (
                <button
                  key={`${seg.word.id}-${i}`}
                  type="button"
                  onClick={() => handleTapTargetWord(seg.word!)}
                  className={`font-bold text-red-700 dark:text-red-400 underline decoration-red-300 dark:decoration-red-700/70 underline-offset-4 hover:bg-red-50 dark:hover:bg-red-950/40 rounded px-0.5 transition-colors cursor-pointer ${
                    isCurrentlySpoken ? 'bg-amber-200/70 dark:bg-amber-500/30' : ''
                  }`}
                >
                  {seg.text}
                </button>
              );
            }
            return (
              <span
                key={`txt-${i}`}
                className={isCurrentlySpoken ? 'bg-amber-100/70 dark:bg-amber-500/20 rounded' : ''}
              >
                {seg.text}
              </span>
            );
          })}
        </div>

        {/* Prev / Next Story Navigation + Flashcards/Quiz Launchers */}
        <div className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!prevStory}
              onClick={() => prevStory && onSelectStory(prevStory)}
              className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              <span>{isAr ? 'القصة السابقة' : 'Previous'}</span>
            </button>
            <button
              type="button"
              disabled={!nextStory}
              onClick={() => nextStory && onSelectStory(nextStory)}
              className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>{isAr ? 'القصة التالية' : 'Next'}</span>
              {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenFlashcards(story.targetWordIds)}
              className="min-h-[44px] px-4 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold cursor-pointer"
            >
              {isAr ? 'بطاقات هذه القصة (15)' : 'Story Flashcards (15)'}
            </button>
            <button
              type="button"
              onClick={() => onOpenQuiz(story.targetWordIds, story.id)}
              className="min-h-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
            >
              {isAr ? 'اختبار سريع للكلمات' : 'Take Word Quiz'}
            </button>
          </div>
        </div>
      </article>

      {/* AI Pronunciation & Accent Trainer */}
      <PronunciationTrainer
        lang={lang}
        storyId={story.id}
        storyText={story.text}
        level={story.level}
        accent={accent}
        speechRate={speechRate}
        authToken={authToken}
      />

      {/* Strictly ONLY the 15 Target Words & Their Translations Below Story */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t.reader.targetWordsTitle} ({storyTargetWords.length})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handlePlayWords(false)}
              className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 cursor-pointer ${
                sequencePlaying === 'words'
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                  : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>{t.reader.readWordsOnly}</span>
            </button>
            <button
              type="button"
              onClick={() => handlePlayWords(true)}
              className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 cursor-pointer ${
                sequencePlaying === 'words-ar'
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                  : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>{t.reader.readWordsWithMeaning}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {storyTargetWords.map((w) => {
            const prog = wordProgress[w.id];
            const isSeqActive = activeSeqWordId === w.id;
            return (
              <div
                key={w.id}
                className={`p-3.5 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                  isSeqActive
                    ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleTapTargetWord(w)}
                  className="text-start flex-1 min-h-[44px] cursor-pointer"
                >
                  <div dir="ltr" className="text-left font-bold text-red-700 dark:text-red-400 text-base">
                    {w.word}
                  </div>
                  <div className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">
                    {w.translationAr}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {isAr ? POS_AR[w.partOfSpeech] : POS_EN[w.partOfSpeech]}
                    {prog?.status === 'mastered' && ` · ${isAr ? 'متقنة' : 'Mastered'}`}
                    {prog?.isUnknown && ` · ${isAr ? 'في قائمة المراجعة' : 'Needs Review'}`}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => speechEngine.speakText(w.word, accent, speechRate)}
                  aria-label={`Listen to ${w.word}`}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Below Target Words: Unlimited Target-Words-Only Writing Practice & Error Correction */}
      <StoryTargetWritingTrainer
        lang={lang}
        story={story}
        targetWords={storyTargetWords}
        level={story.level}
        accent={accent}
        speechRate={speechRate}
        authToken={authToken}
        onSubmissionSaved={onSubmissionSaved}
      />

      {/* Tap-to-Translate Bottom Sheet */}
      {selectedWord && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setSelectedWord(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl sm:mb-4 p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />

            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 dir="ltr" className="text-2xl font-bold text-red-700 dark:text-red-400">
                    {selectedWord.word}
                  </h3>
                  <button
                    type="button"
                    onClick={() => speechEngine.speakText(selectedWord.word, accent, speechRate)}
                    aria-label="Speak word"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 cursor-pointer"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {POS_AR[selectedWord.partOfSpeech]} · {POS_EN[selectedWord.partOfSpeech]} ·{' '}
                  <span dir="ltr">{selectedWord.phonetic}</span>
                </p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-2">
                  {selectedWord.translationAr}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedWord(null)}
                aria-label="Close"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 3 Short Sentences */}
            <div className="mt-5 space-y-2">
              {selectedWord.sentences.map((s, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                >
                  <p dir="ltr" className="text-sm text-left text-slate-800 dark:text-slate-200">
                    {s}
                  </p>
                  <button
                    type="button"
                    onClick={() => speechEngine.speakText(s, accent, speechRate)}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Action Buttons: Add to Cards (Unknown) / Know It */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  onWordOutcome(selectedWord.id, 'unknown');
                  setSelectedWord(null);
                }}
                className="min-h-[48px] px-4 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <BookmarkPlus className="w-4 h-4" />
                <span>{t.reader.addToUnknown}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onWordOutcome(selectedWord.id, 'known');
                  setSelectedWord(null);
                }}
                className="min-h-[48px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{t.reader.iKnowIt}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
