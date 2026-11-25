import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  Bookmark,
  BookOpen,
  CheckCircle2,
  Compass,
  Headphones,
  Home,
  Layers,
  LogOut,
  Moon,
  PenTool,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Sun,
} from 'lucide-react';
import type {
  AccentType,
  AppScreen,
  CEFRLevel,
  FontSizeOption,
  QuizAttempt,
  Story,
  UILanguage,
  UserProgressSnapshot,
  UserPublic,
  VocabWord,
  WritingSubmission,
} from './types.ts';
import { BUILTIN_STORIES, BUILTIN_WORDS } from './data/curriculum.ts';
import { detectBrowserLanguage, UI_TEXT } from './i18n/translations.ts';
import { CATEGORY_IMAGES } from './utils/assets.ts';
import { speechEngine } from './utils/speech.ts';
import { LandingAuthGate } from './components/LandingAuthGate.tsx';
import { PlacementModal } from './components/PlacementModal.tsx';
import { StoryReader } from './components/StoryReader.tsx';
import { FlashcardDeck } from './components/FlashcardDeck.tsx';
import { QuizEngine } from './components/QuizEngine.tsx';
import { ReviewAndUnknown } from './components/ReviewAndUnknown.tsx';
import { WritingLab } from './components/WritingLab.tsx';
import { AdminApprovals } from './components/AdminApprovals.tsx';

export default function App() {
  const [lang, setLang] = useState<UILanguage>(() => detectBrowserLanguage());
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  // Auth held strictly in React memory (never persisted to localStorage/sessionStorage)
  const [adminConfigured, setAdminConfigured] = useState(true);
  const [authUser, setAuthUser] = useState<UserPublic | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Navigation & Reader Preferences
  const [screen, setScreen] = useState<AppScreen>('home');
  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel>('A1');
  const [accent, setAccent] = useState<AccentType>('en-US');
  const [fontSize, setFontSize] = useState<FontSizeOption>('md');
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [showPlacement, setShowPlacement] = useState(false);

  // Curriculum & User Progress
  const [words, setWords] = useState<VocabWord[]>(BUILTIN_WORDS);
  const [stories, setStories] = useState<Story[]>(BUILTIN_STORIES);
  const [activeStoryId, setActiveStoryId] = useState<string>(BUILTIN_STORIES[0].id);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [playlistActive, setPlaylistActive] = useState(false);
  const [flashcardWordIds, setFlashcardWordIds] = useState<string[] | null>(null);
  const [quizContext, setQuizContext] = useState<{ wordIds: string[]; storyId?: string } | null>(
    null
  );

  const [progress, setProgress] = useState<UserProgressSnapshot>({
    completedStoryIds: [],
    bookmarks: [],
    wordProgress: {},
    quizAttempts: [],
    writingSubmissions: [],
    streakDays: 1,
    points: 0,
  });

  // Sync HTML dir/lang & dark class
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Check bootstrap status on mount
  useEffect(() => {
    fetch('/api/auth/bootstrap-status')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.adminConfigured === 'boolean') {
          setAdminConfigured(d.adminConfigured);
        }
      })
      .catch(() => {});
  }, []);

  // Load curriculum + user progress after login
  useEffect(() => {
    if (!authToken || !authUser) return;
    setSelectedLevel(authUser.level);

    Promise.all([
      fetch('/api/curriculum', { headers: { Authorization: `Bearer ${authToken}` } }).then((r) =>
        r.json()
      ),
      fetch('/api/progress', { headers: { Authorization: `Bearer ${authToken}` } }).then((r) =>
        r.json()
      ),
    ])
      .then(([curr, prog]) => {
        if (Array.isArray(curr.words)) setWords(curr.words);
        if (Array.isArray(curr.stories)) setStories(curr.stories);
        if (prog && Array.isArray(prog.completedStoryIds)) {
          setProgress({
            ...prog,
            bookmarks: Array.isArray(prog.bookmarks) ? prog.bookmarks : [],
          });
        }
        if (!authUser.placementCompleted && authUser.role !== 'admin') {
          setShowPlacement(true);
        }
      })
      .catch(() => {});
  }, [authToken, authUser?.id]);

  const isAr = lang === 'ar';
  const t = UI_TEXT[lang];

  const wordsById = useMemo(
    () => Object.fromEntries(words.map((w) => [w.id, w])),
    [words]
  );

  const levelStories = useMemo(
    () => stories.filter((s) => s.level === selectedLevel),
    [stories, selectedLevel]
  );

  const levelWords = useMemo(
    () => words.filter((w) => w.level === selectedLevel),
    [words, selectedLevel]
  );

  const activeStory = useMemo(() => {
    return (
      stories.find((s) => s.id === activeStoryId) ||
      levelStories[0] ||
      stories[0]
    );
  }, [stories, activeStoryId, levelStories]);

  const dueCount = useMemo(() => {
    const now = Date.now();
    return Object.values(progress.wordProgress).filter(
      (p) => p.status !== 'mastered' && new Date(p.nextReviewAt).getTime() <= now
    ).length;
  }, [progress.wordProgress]);

  const unknownCount = useMemo(
    () => Object.values(progress.wordProgress).filter((p) => p.isUnknown).length,
    [progress.wordProgress]
  );

  const masteredCount = useMemo(
    () => Object.values(progress.wordProgress).filter((p) => p.status === 'mastered').length,
    [progress.wordProgress]
  );

  const todayFeaturedStory = useMemo(() => {
    const unfinished = levelStories.find(
      (s) => !progress.completedStoryIds.includes(s.id)
    );
    return unfinished || levelStories[0] || stories[0];
  }, [levelStories, progress.completedStoryIds, stories]);

  const bookmarkedStories = useMemo(() => {
    const storyMap = new Map(stories.map((s) => [s.id, s]));
    return (progress.bookmarks ?? [])
      .map((id) => storyMap.get(id))
      .filter((s): s is Story => Boolean(s));
  }, [stories, progress.bookmarks]);

  const handleAuthSuccess = (user: UserPublic, token: string) => {
    setAuthUser(user);
    setAuthToken(token);
    setSelectedLevel(user.level);
    const firstLevelStory = stories.find((s) => s.level === user.level);
    if (firstLevelStory) setActiveStoryId(firstLevelStory.id);
    setScreen('home');
  };

  const handleLogout = async () => {
    speechEngine.stop();
    setPlaylistActive(false);
    if (authToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {});
    }
    setAuthUser(null);
    setAuthToken(null);
  };

  const handleSelectLevel = (lvl: CEFRLevel) => {
    setSelectedLevel(lvl);
    const first = stories.find((s) => s.level === lvl);
    if (first) setActiveStoryId(first.id);
  };

  const handlePlacementSave = async (lvl: CEFRLevel, placementCompleted: boolean) => {
    setShowPlacement(false);
    handleSelectLevel(lvl);
    if (!authToken) return;
    const res = await fetch('/api/user/level', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ level: lvl, placementCompleted }),
    });
    const data = await res.json();
    if (res.ok && data.user) {
      setAuthUser(data.user);
    }
  };

  const handleToggleStoryComplete = async (storyId: string, completed: boolean) => {
    if (!authToken) return;
    const res = await fetch('/api/progress/story', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ storyId, completed }),
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.completedStoryIds)) {
      setProgress({
        ...data,
        bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : progress.bookmarks,
      });
    }
  };

  const handleToggleBookmark = async (storyId: string, bookmarked: boolean) => {
    // Optimistically update bookmarks array in user progress
    setProgress((prev) => ({
      ...prev,
      bookmarks: bookmarked
        ? [storyId, ...prev.bookmarks.filter((id) => id !== storyId)]
        : prev.bookmarks.filter((id) => id !== storyId),
    }));
    if (!authToken) return;
    const res = await fetch('/api/progress/bookmark', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ storyId, bookmarked }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data && Array.isArray(data.bookmarks)) {
      setProgress(data);
    }
  };

  const handleWordOutcome = async (wordId: string, outcome: 'known' | 'unknown') => {
    if (!authToken) return;
    const res = await fetch('/api/progress/word', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ wordId, outcome }),
    });
    const data = await res.json();
    if (res.ok && data.wordProgress) {
      setProgress((prev) => ({
        ...prev,
        wordProgress: {
          ...prev.wordProgress,
          [wordId]: data.wordProgress,
        },
      }));
    }
  };

  const handleSaveQuizAttempt = async (attempt: Omit<QuizAttempt, 'id' | 'createdAt'>) => {
    if (!authToken) return;
    const res = await fetch('/api/progress/quiz', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(attempt),
    });
    const data = await res.json();
    if (res.ok && data.attempt) {
      setProgress((prev) => ({
        ...prev,
        quizAttempts: [data.attempt, ...prev.quizAttempts],
      }));
    }
  };

  const handleToggleLevelPlaylist = () => {
    if (playlistActive) {
      speechEngine.stop();
      setPlaylistActive(false);
      return;
    }
    const startIdx = Math.max(
      0,
      levelStories.findIndex((s) => s.id === activeStory.id)
    );
    setPlaylistActive(true);
    speechEngine.startLevelPlaylist({
      stories: levelStories,
      startIndex: startIdx,
      accent,
      rate: speechRate,
      onStoryChange: (st) => {
        setActiveStoryId(st.id);
      },
      onStop: () => {
        setPlaylistActive(false);
      },
    });
  };

  // Exclusive Gate: visitors see ONLY the Landing/Auth Gate
  if (!authUser || !authToken) {
    return (
      <LandingAuthGate
        lang={lang}
        onToggleLang={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        adminConfigured={adminConfigured}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  const canAccessAdmin =
    authUser.role === 'admin' ||
    authUser.permissions.canApproveUsers ||
    authUser.permissions.canManageWords;

  const filteredLibraryStories = levelStories.filter(
    (s) =>
      !libraryQuery.trim() ||
      s.title.toLowerCase().includes(libraryQuery.toLowerCase()) ||
      s.titleAr.includes(libraryQuery)
  );

  const activeFlashcardWords = (flashcardWordIds ?? activeStory.targetWordIds)
    .map((id) => wordsById[id])
    .filter(Boolean);

  const activeQuizWords = (quizContext?.wordIds ?? activeStory.targetWordIds)
    .map((id) => wordsById[id])
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 h-14 sm:h-16 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setScreen('home')}
            className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display cursor-pointer"
          >
            {t.brand}
          </button>

          {/* Zone 2: 4-5 Concise Single-Line Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            {(
              [
                ['home', t.nav.home],
                ['library', t.nav.stories],
                ['review', t.nav.review],
                ['writing', t.nav.writing],
                ['progress', t.nav.progress],
              ] as Array<[AppScreen, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setScreen(key)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  screen === key
                    ? 'border-blue-700 text-slate-900 dark:text-white font-semibold'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            {canAccessAdmin && (
              <button
                type="button"
                onClick={() => setScreen('admin')}
                className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold border whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                  screen === 'admin'
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden sm:inline">{t.nav.admin}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[40px] px-3.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t.auth.logout}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* HOME DASHBOARD */}
        {screen === 'home' && (
          <div className="space-y-6 pb-20 lg:pb-8">
            {/* Hero Welcome & Quick Actions */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-8 space-y-3">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                  {t.levels[selectedLevel]} · {t.journeyMotto}
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                  {isAr ? `مرحبًا، ${authUser.fullName}` : `Welcome back, ${authUser.fullName}`}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xl">
                  {isAr
                    ? 'خصص 10 دقائق الآن لقراءة قصة اليوم، ومراجعة البطاقات المستحقة، وتجربة الكتابة المصححة.'
                    : 'Take 10 minutes today to read your featured story, clear due flashcards, and practice writing.'}
                </p>

                <div className="pt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveStoryId(todayFeaturedStory.id);
                      setScreen('reader');
                    }}
                    className="min-h-[44px] px-5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold cursor-pointer"
                  >
                    {t.home.startReading}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreen('review')}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold cursor-pointer"
                  >
                    {t.home.startReview} ({dueCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPlacement(true)}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Compass className="w-4 h-4" />
                    <span>{t.home.takePlacement}</span>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-4 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-[4/3]">
                <img
                  src={CATEGORY_IMAGES[todayFeaturedStory.category]}
                  alt={todayFeaturedStory.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* 4-Column KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.home.streak}</p>
                <p className="text-2xl sm:text-3xl font-bold font-mono-nums mt-1">
                  {progress.streakDays} {isAr ? 'يوم' : 'd'}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.home.dueReview}</p>
                <p className="text-2xl sm:text-3xl font-bold font-mono-nums mt-1 text-blue-700 dark:text-blue-400">
                  {dueCount}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.home.masteredWords}</p>
                <p className="text-2xl sm:text-3xl font-bold font-mono-nums mt-1 text-emerald-700 dark:text-emerald-400">
                  {masteredCount}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.home.completedStories}</p>
                <p className="text-2xl sm:text-3xl font-bold font-mono-nums mt-1">
                  {progress.completedStoryIds.length} / 200
                </p>
              </div>
            </div>

            {/* Today's Featured Story Card + Unknown Words Quick Card */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {t.home.todayStory} · {todayFeaturedStory.level} · 15 {t.reader.wordsCount}
                  </p>
                  <h2 dir="ltr" className="text-xl font-bold text-left mt-2">
                    {todayFeaturedStory.title}
                  </h2>
                  {isAr && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                      {todayFeaturedStory.titleAr}
                    </p>
                  )}
                  <p
                    dir="ltr"
                    className="text-sm text-left text-slate-600 dark:text-slate-300 mt-3 line-clamp-3 leading-relaxed"
                  >
                    {todayFeaturedStory.text}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveStoryId(todayFeaturedStory.id);
                      setScreen('reader');
                    }}
                    className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                  >
                    {t.home.startReading}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFlashcardWordIds(todayFeaturedStory.targetWordIds);
                      setScreen('flashcards');
                    }}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    {isAr ? 'مراجعة البطاقات' : 'Flashcards'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuizContext({
                        wordIds: todayFeaturedStory.targetWordIds,
                        storyId: todayFeaturedStory.id,
                      });
                      setScreen('quiz');
                    }}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    {isAr ? 'اختبار سريع' : 'Quick Quiz'}
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                    {t.home.unknownWordsTitle} · {unknownCount} {isAr ? 'كلمة محفوظة' : 'saved'}
                  </p>
                  <h2 className="text-xl font-bold mt-2">
                    {isAr
                      ? 'درّب نفسك على الكلمات الصعبة أو ألّف بها قصة بالذكاء الاصطناعي'
                      : 'Practice Difficult Words or Generate an AI Story'}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                    {isAr
                      ? 'كل كلمة تضغط عليها «لا أعرفها» تُحفظ في قسم خاص مع تمرين كتابة إملائية وقصة مؤقتة بالذكاء الاصطناعي.'
                      : 'Words marked "Don’t Know" stay in your vault for spelling drills and temporary AI story practice.'}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setScreen('review')}
                    className="min-h-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    {isAr ? 'افتح قسم الكلمات والمراجعة' : 'Open Review & Unknown Vault'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreen('writing')}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    {isAr ? 'تدريب الكتابة الحرة' : 'Free Writing Lab'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LIBRARY SCREEN: 50 STORIES PER LEVEL (A1 - B2) + LISTEN ALL AT TOP */}
        {screen === 'library' && (
          <div className="space-y-6 pb-20 lg:pb-8">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold">
                    {isAr ? 'مكتبة القصص المتدرجة' : 'Graded Story Library'}
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {isAr
                      ? '50 قصة لكل مستوى · 750 كلمة مستهدفة لكل مستوى · 15 كلمة في كل قصة'
                      : '50 stories per level · 750 level words · 15 randomized words per story'}
                  </p>
                </div>

                {/* Listen to All Stories in Level (Lock-Screen Compatible) */}
                <button
                  type="button"
                  onClick={handleToggleLevelPlaylist}
                  className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer ${
                    playlistActive
                      ? 'bg-red-600 text-white'
                      : 'bg-blue-700 hover:bg-blue-800 text-white'
                  }`}
                >
                  {playlistActive ? <Square className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
                  <span>{playlistActive ? t.reader.stopPlaylist : t.reader.listenAllLevel}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  {(['A1', 'A2', 'B1', 'B2'] as CEFRLevel[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => handleSelectLevel(lvl)}
                      className={`min-h-[40px] px-4 text-xs font-bold rounded-lg cursor-pointer ${
                        selectedLevel === lvl
                          ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {lvl} (50)
                    </button>
                  ))}
                </div>

                <div className="relative flex-1 max-w-xs">
                  <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                  <input
                    type="text"
                    value={libraryQuery}
                    onChange={(e) => setLibraryQuery(e.target.value)}
                    placeholder={isAr ? 'ابحث بعنوان القصة...' : 'Search story title...'}
                    className="w-full min-h-[44px] ps-9 pe-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Dedicated Bookmarks Section */}
            <section
              aria-labelledby="library-bookmarks-heading"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-5 h-5 text-amber-600 dark:text-amber-400 fill-current" />
                  <h2 id="library-bookmarks-heading" className="text-base font-bold text-slate-900 dark:text-white">
                    {t.reader.bookmarksTitle} ({bookmarkedStories.length})
                  </h2>
                </div>
              </div>

              {bookmarkedStories.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.reader.noBookmarks}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {bookmarkedStories.map((st) => {
                    const done = progress.completedStoryIds.includes(st.id);
                    return (
                      <div
                        key={`bookmark-${st.id}`}
                        className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 p-4 flex items-start justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLevel(st.level);
                            setActiveStoryId(st.id);
                            setScreen('reader');
                          }}
                          className="text-start flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums mb-1">
                            <span className="font-bold text-blue-700 dark:text-blue-400">
                              {st.level}
                            </span>
                            <span>#{st.index}</span>
                            {done && (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{t.reader.completed}</span>
                              </span>
                            )}
                          </div>
                          <h3
                            dir="ltr"
                            className="text-sm font-bold text-slate-900 dark:text-white text-left truncate"
                          >
                            {st.title}
                          </h3>
                          {isAr && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                              {st.titleAr}
                            </p>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleBookmark(st.id, false)}
                          aria-label={
                            isAr ? `إزالة ${st.title} من المحفوظات` : `Remove ${st.title} bookmark`
                          }
                          title={isAr ? 'إزالة من المحفوظات' : 'Remove bookmark'}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 shrink-0 cursor-pointer"
                        >
                          <Bookmark className="w-4 h-4 fill-current" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLibraryStories.map((st) => {
                const done = progress.completedStoryIds.includes(st.id);
                const bookmarked = progress.bookmarks.includes(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setActiveStoryId(st.id);
                      setScreen('reader');
                    }}
                    className="text-start bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-600 rounded-2xl p-5 transition-colors flex flex-col justify-between cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums mb-2">
                        <span>
                          {st.level} · #{st.index} · {st.wordCount}w
                        </span>
                        <span className="inline-flex items-center gap-2">
                          {bookmarked && (
                            <Bookmark
                              aria-label={t.reader.bookmarked}
                              className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 fill-current"
                            />
                          )}
                          {done && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{t.reader.completed}</span>
                            </span>
                          )}
                        </span>
                      </div>
                      <h3 dir="ltr" className="text-base font-bold text-slate-900 dark:text-white text-left">
                        {st.title}
                      </h3>
                      {isAr && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {st.titleAr}
                        </p>
                      )}
                    </div>
                    <p dir="ltr" className="text-xs text-left text-slate-500 dark:text-slate-400 mt-3 line-clamp-2">
                      {st.text}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STORY READER SCREEN */}
        {screen === 'reader' && (
          <StoryReader
            lang={lang}
            story={activeStory}
            levelStories={levelStories}
            wordsById={wordsById}
            wordProgress={progress.wordProgress}
            isCompleted={progress.completedStoryIds.includes(activeStory.id)}
            isBookmarked={progress.bookmarks.includes(activeStory.id)}
            accent={accent}
            onChangeAccent={setAccent}
            fontSize={fontSize}
            onChangeFontSize={setFontSize}
            speechRate={speechRate}
            onChangeSpeechRate={setSpeechRate}
            playlistActive={playlistActive}
            onToggleLevelPlaylist={handleToggleLevelPlaylist}
            onSelectLevel={handleSelectLevel}
            onSelectStory={(st) => setActiveStoryId(st.id)}
            onToggleComplete={handleToggleStoryComplete}
            onToggleBookmark={handleToggleBookmark}
            onWordOutcome={handleWordOutcome}
            onOpenFlashcards={(wIds) => {
              setFlashcardWordIds(wIds);
              setScreen('flashcards');
            }}
            onOpenQuiz={(wIds, storyId) => {
              setQuizContext({ wordIds: wIds, storyId });
              setScreen('quiz');
            }}
            authToken={authToken}
            onSubmissionSaved={(sub: WritingSubmission) =>
              setProgress((prev) => ({
                ...prev,
                writingSubmissions: [sub, ...prev.writingSubmissions],
              }))
            }
          />
        )}

        {/* FLASHCARDS SCREEN */}
        {screen === 'flashcards' && (
          <div className="space-y-4 pb-20 lg:pb-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-xl font-bold">
                {isAr ? 'البطاقات التعليمية التفاعلية' : 'Interactive Flashcards'}
              </h1>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFlashcardWordIds(levelWords.slice(0, 15).map((w) => w.id))}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  {isAr ? `كلمات المستوى ${selectedLevel}` : `${selectedLevel} Words`}
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('reader')}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  {isAr ? 'عودة للقصة' : 'Back to Story'}
                </button>
              </div>
            </div>

            <FlashcardDeck
              lang={lang}
              words={activeFlashcardWords}
              accent={accent}
              speechRate={speechRate}
              onEvaluate={handleWordOutcome}
              onFinish={() => setScreen('quiz')}
            />
          </div>
        )}

        {/* QUIZ SCREEN */}
        {screen === 'quiz' && (
          <div className="space-y-4 pb-20 lg:pb-8">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">
                {isAr ? 'الاختبارات القصيرة' : 'Short Recall Quiz'}
              </h1>
              <button
                type="button"
                onClick={() => setScreen('reader')}
                className="min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                {isAr ? 'عودة للقصة' : 'Back to Story'}
              </button>
            </div>
            <QuizEngine
              lang={lang}
              level={selectedLevel}
              storyId={quizContext?.storyId}
              targetWords={activeQuizWords}
              allLevelWords={levelWords}
              accent={accent}
              speechRate={speechRate}
              onWordOutcome={handleWordOutcome}
              onSaveAttempt={handleSaveQuizAttempt}
              onExit={() => setScreen('reader')}
            />
          </div>
        )}

        {/* SPACED REPETITION REVIEW & UNKNOWN WORDS VAULT */}
        {screen === 'review' && (
          <ReviewAndUnknown
            lang={lang}
            userLevel={selectedLevel}
            wordsById={wordsById}
            wordProgress={progress.wordProgress}
            accent={accent}
            speechRate={speechRate}
            authToken={authToken}
            onWordOutcome={handleWordOutcome}
          />
        )}

        {/* FREE WRITING LAB */}
        {screen === 'writing' && (
          <WritingLab
            lang={lang}
            userLevel={selectedLevel}
            levelWords={levelWords}
            submissions={progress.writingSubmissions}
            authToken={authToken}
            onSubmissionSaved={(sub: WritingSubmission) =>
              setProgress((prev) => ({
                ...prev,
                writingSubmissions: [sub, ...prev.writingSubmissions],
              }))
            }
          />
        )}

        {/* PROGRESS, ACHIEVEMENTS & SETTINGS */}
        {(screen === 'progress' || screen === 'settings') && (
          <div className="space-y-6 pb-20 lg:pb-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Progress & Achievements */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                  <h2 className="text-lg font-bold">
                    {isAr ? 'التقدّم والإحصاءات والنقاط' : 'Progress, Stats & Points'}
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-3 tabular-nums">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500">{isAr ? 'مجموع النقاط' : 'Total Points'}</p>
                    <p className="text-2xl font-bold font-mono-nums mt-1">{progress.points}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500">{isAr ? 'الاختبارات المنجزة' : 'Quizzes Taken'}</p>
                    <p className="text-2xl font-bold font-mono-nums mt-1">
                      {progress.quizAttempts.length}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500">{isAr ? 'مقالات الكتابة' : 'Writing Logs'}</p>
                    <p className="text-2xl font-bold font-mono-nums mt-1">
                      {progress.writingSubmissions.length}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500">{isAr ? 'القصص المكتملة' : 'Stories Done'}</p>
                    <p className="text-2xl font-bold font-mono-nums mt-1">
                      {progress.completedStoryIds.length}
                    </p>
                  </div>
                </div>

                {/* Achievements & Weekly Challenge */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Award className="w-4 h-4 text-amber-500" />
                    <span>{isAr ? 'تحدّي الأسبوع والإنجازات' : 'Weekly Challenge & Milestones'}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {isAr
                      ? `أكمل 5 قصص و15 بطاقة هذا الأسبوع (${Math.min(progress.completedStoryIds.length, 5)}/5 قصص)`
                      : `Complete 5 stories and 15 flashcards this week (${Math.min(progress.completedStoryIds.length, 5)}/5 stories)`}
                  </p>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500"
                      style={{
                        width: `${Math.min(100, (progress.completedStoryIds.length / 5) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Settings: Language, Accent, Font Size, Dark Mode, Placement */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                  <h2 className="text-lg font-bold">
                    {isAr ? 'الإعدادات والتفضيلات' : 'Preferences & Settings'}
                  </h2>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium">
                      {isAr ? 'لغة الواجهة (تلقائي حسب الجهاز)' : 'Interface Language'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
                      className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      {lang === 'ar' ? 'العربية (التبديل للإنجليزية)' : 'English (Switch to Arabic)'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium">{isAr ? 'المظهر' : 'Theme'}</span>
                    <button
                      type="button"
                      onClick={() => setDarkMode((d) => !d)}
                      className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                    >
                      {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      <span>{darkMode ? (isAr ? 'الوضع الفاتح' : 'Light Mode') : isAr ? 'الوضع الداكن' : 'Dark Mode'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium">{isAr ? 'لكنة النطق' : 'Speech Accent'}</span>
                    <div className="flex gap-2">
                      {(['en-US', 'en-GB'] as AccentType[]).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAccent(a)}
                          className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                            accent === a
                              ? 'bg-blue-700 text-white border-blue-700'
                              : 'border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {a === 'en-US' ? 'American (US)' : 'British (UK)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium">
                      {isAr ? 'اختبار تحديد المستوى' : 'Level Placement'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPlacement(true)}
                      className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                    >
                      {isAr ? `تعديل المستوى (${selectedLevel})` : `Change Level (${selectedLevel})`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ADMIN APPROVALS & PERMISSIONS SCREEN (Authorized Only) */}
        {screen === 'admin' && canAccessAdmin && (
          <AdminApprovals
            lang={lang}
            authToken={authToken}
            onWordsImported={(customWords) =>
              setWords([...BUILTIN_WORDS, ...customWords])
            }
          />
        )}
      </main>

      {/* Mobile Fixed 5-Tab Bottom Navigation (<= 15% mobile height, >= 44px touch targets) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-5 h-16 items-center">
          {(
            [
              ['home', Home, t.nav.home],
              ['library', BookOpen, t.nav.stories],
              ['review', Layers, isAr ? 'المراجعة' : 'Review'],
              ['writing', PenTool, t.nav.writing],
              ['progress', BarChart3, isAr ? 'التقدّم' : 'Progress'],
            ] as const
          ).map(([key, Icon, label]) => {
            const active = screen === key || (key === 'library' && screen === 'reader');
            return (
              <button
                key={key}
                type="button"
                onClick={() => setScreen(key)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                  active
                    ? 'text-blue-700 dark:text-blue-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] leading-none truncate max-w-[64px]">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Placement Test Modal */}
      {showPlacement && (
        <PlacementModal
          lang={lang}
          currentLevel={selectedLevel}
          onSelectLevel={handlePlacementSave}
          onClose={() => setShowPlacement(false)}
        />
      )}
    </div>
  );
}
