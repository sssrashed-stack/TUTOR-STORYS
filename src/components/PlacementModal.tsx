import React, { useState } from 'react';
import { CheckCircle2, Compass, X } from 'lucide-react';
import type { CEFRLevel, UILanguage } from '../types.ts';
import { PLACEMENT_QUESTIONS } from '../data/curriculum.ts';

interface PlacementModalProps {
  lang: UILanguage;
  currentLevel: CEFRLevel;
  onSelectLevel: (level: CEFRLevel, placementCompleted: boolean) => void;
  onClose: () => void;
}

export const PlacementModal: React.FC<PlacementModalProps> = ({
  lang,
  currentLevel,
  onSelectLevel,
  onClose,
}) => {
  const isAr = lang === 'ar';
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [recommended, setRecommended] = useState<CEFRLevel>(currentLevel);

  const handleEvaluate = () => {
    let score = 0;
    for (const q of PLACEMENT_QUESTIONS) {
      if (answers[q.id] === q.correctIndex) {
        score += 1;
      }
    }
    let rec: CEFRLevel = 'A1';
    if (score >= 6) rec = 'B2';
    else if (score >= 4) rec = 'B1';
    else if (score >= 2) rec = 'A2';
    setRecommended(rec);
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <h2 className="text-lg font-bold">
              {isAr ? 'تحديد المستوى (اختبار مختصر أو اختيار يدوي)' : 'Level Placement (Quick Test or Manual Choice)'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Manual Direct Pick */}
        <div className="mt-4">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {isAr ? 'اختر مستواك يدويًا مباشرة:' : 'Or choose your starting level manually:'}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {(['A1', 'A2', 'B1', 'B2'] as CEFRLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => onSelectLevel(lvl, true)}
                className={`min-h-[44px] rounded-xl font-bold text-sm border transition-colors cursor-pointer ${
                  currentLevel === lvl
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 hover:border-blue-500'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="my-6 border-t border-slate-200 dark:border-slate-800" />

        {!submitted ? (
          <div className="space-y-5">
            <p className="text-sm font-semibold">
              {isAr ? 'أو أجب عن 6 جمل قصيرة لتحديد مستواك:' : 'Or answer 6 quick sentences for placement:'}
            </p>
            {PLACEMENT_QUESTIONS.map((q, idx) => (
              <div
                key={q.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
              >
                <p dir="ltr" className="text-sm font-medium text-slate-900 dark:text-white mb-3 text-left">
                  {idx + 1}. {q.prompt}
                </p>
                <div dir="ltr" className="grid grid-cols-2 gap-2">
                  {q.options.map((opt, optIdx) => {
                    const selected = answers[q.id] === optIdx;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: optIdx }))}
                        className={`min-h-[44px] px-3 rounded-lg text-sm font-medium border text-left transition-colors cursor-pointer ${
                          selected
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-500'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={handleEvaluate}
              className="w-full min-h-[48px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm cursor-pointer"
            >
              {isAr ? 'احسب المستوى المناسب' : 'Calculate Recommended Level'}
            </button>
          </div>
        ) : (
          <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center space-y-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto" />
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {isAr ? 'المستوى المقترح لك:' : 'Recommended starting level:'}
              </p>
              <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                {recommended}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectLevel(recommended, true)}
              className="min-h-[44px] px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm cursor-pointer"
            >
              {isAr ? `ابدأ في المستوى ${recommended}` : `Start Level ${recommended}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
