import React, { useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Volume2,
  X,
} from 'lucide-react';
import type { AccentType, UILanguage, VocabWord } from '../types.ts';
import { POS_AR, POS_EN } from '../i18n/translations.ts';
import { CATEGORY_IMAGES } from '../utils/assets.ts';
import { speechEngine } from '../utils/speech.ts';

interface FlashcardDeckProps {
  lang: UILanguage;
  words: VocabWord[];
  accent: AccentType;
  speechRate: number;
  onEvaluate: (wordId: string, outcome: 'known' | 'unknown') => void;
  onFinish?: () => void;
}

export const FlashcardDeck: React.FC<FlashcardDeckProps> = ({
  lang,
  words,
  accent,
  speechRate,
  onEvaluate,
  onFinish,
}) => {
  const isAr = lang === 'ar';
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [brokenImg, setBrokenImg] = useState<Record<string, boolean>>({});
  const [knownCount, setKnownCount] = useState(0);
  const [unknownCount, setUnknownCount] = useState(0);
  const touchStartX = useRef<number | null>(null);

  if (!words.length) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {isAr ? 'لا توجد بطاقات متاحة حاليًا.' : 'No flashcards available right now.'}
        </p>
      </div>
    );
  }

  const safeIdx = Math.min(index, words.length - 1);
  const card = words[safeIdx];
  const imgSrc = CATEGORY_IMAGES[card.category];

  const goNext = () => {
    setFlipped(false);
    if (safeIdx < words.length - 1) {
      setIndex(safeIdx + 1);
    } else {
      onFinish?.();
    }
  };

  const goPrev = () => {
    setFlipped(false);
    setIndex(Math.max(0, safeIdx - 1));
  };

  const handleAssess = (outcome: 'known' | 'unknown') => {
    onEvaluate(card.id, outcome);
    if (outcome === 'known') setKnownCount((c) => c + 1);
    else setUnknownCount((c) => c + 1);
    goNext();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(diff) > 48) {
      if (diff < 0) goNext();
      else goPrev();
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Carousel Progress Bar */}
      <div className="flex items-center justify-between gap-4 text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
        <span>
          {isAr ? 'البطاقة' : 'Card'} {safeIdx + 1} / {words.length}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-emerald-700 dark:text-emerald-400">
            {isAr ? 'أعرفها:' : 'Known:'} {knownCount}
          </span>
          <span className="text-red-700 dark:text-red-400">
            {isAr ? 'للمراجعة:' : 'Review:'} {unknownCount}
          </span>
        </div>
      </div>

      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-700 dark:bg-blue-500 transition-all duration-200"
          style={{ width: `${((safeIdx + 1) / words.length) * 100}%` }}
        />
      </div>

      {/* Swipeable Flip Card */}
      <div
        className="perspective-1000 select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          onClick={() => setFlipped((f) => !f)}
          className={`relative w-full min-h-[430px] transition-transform duration-300 preserve-3d cursor-pointer ${
            flipped ? 'rotate-y-180' : ''
          }`}
        >
          {/* Front Face */}
          <div className="absolute inset-0 backface-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden flex flex-col">
            <div className="h-52 bg-slate-100 dark:bg-slate-950 relative overflow-hidden">
              {!brokenImg[card.id] ? (
                <img
                  src={imgSrc}
                  alt={card.word}
                  referrerPolicy="no-referrer"
                  onError={() => setBrokenImg((p) => ({ ...p, [card.id]: true }))}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
                  <span className="text-3xl font-bold text-blue-700 dark:text-blue-400">
                    {card.word}
                  </span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-5 py-3 flex items-center justify-between text-white text-xs">
                <span>{card.level} · {isAr ? POS_AR[card.partOfSpeech] : POS_EN[card.partOfSpeech]}</span>
                <span className="inline-flex items-center gap-1">
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>{isAr ? 'اضغط للقلب' : 'Tap to flip'}</span>
                </span>
              </div>
            </div>

            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center gap-3">
              <h3 dir="ltr" className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
                {card.word}
              </h3>
              <p dir="ltr" className="text-sm text-slate-500 dark:text-slate-400 font-mono-nums">
                {card.phonetic}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  speechEngine.speakText(card.word, accent, speechRate);
                }}
                className="min-h-[44px] px-4 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
                <span>{isAr ? 'نطق الكلمة' : 'Pronounce'}</span>
              </button>
            </div>
          </div>

          {/* Back Face: Translation + 3 Short Sentences with Audio */}
          <div className="absolute inset-0 backface-hidden rotate-y-180 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 dir="ltr" className="text-xl font-bold text-red-700 dark:text-red-400 text-left">
                    {card.word}
                  </h3>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                    {card.translationAr}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speechEngine.speakText(card.word, accent, speechRate);
                  }}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 cursor-pointer"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-4 mb-2">
                {isAr ? 'ثلاث جمل قصيرة توضّح الاستخدام:' : 'Three usage sentences:'}
              </p>

              <div className="space-y-2.5">
                {card.sentences.map((s, idx) => (
                  <div
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      speechEngine.speakText(s, accent, speechRate);
                    }}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 hover:border-blue-500 cursor-pointer"
                  >
                    <p dir="ltr" className="text-sm text-left text-slate-800 dark:text-slate-200">
                      {s}
                    </p>
                    <Volume2 className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                  </div>
                ))}
              </div>
            </div>

            <p className="text-center text-xs text-slate-400 mt-3">
              {isAr ? 'اضغط للعودة أو اسحب للتنقل' : 'Tap to flip back or swipe to navigate'}
            </p>
          </div>
        </div>
      </div>

      {/* Carousel Nav + Self-Assessment */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={safeIdx === 0}
          aria-label="Previous card"
          className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
        >
          {isAr ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>

        <div className="flex-1 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleAssess('unknown')}
            className="min-h-[48px] px-4 rounded-2xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>{isAr ? 'لا أعرفها' : 'Don’t Know'}</span>
          </button>
          <button
            type="button"
            onClick={() => handleAssess('known')}
            className="min-h-[48px] px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{isAr ? 'أعرفها' : 'I Know It'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={goNext}
          aria-label="Next card"
          className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
        >
          {isAr ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};
