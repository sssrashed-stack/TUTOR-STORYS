import type { CEFRLevel, PartOfSpeech, VocabWord, WordCategory } from '../types.ts';

export type RichWordTuple = [
  word: string,
  translationAr: string,
  pos: PartOfSpeech,
  phonetic: string,
  category: WordCategory,
  s1: string,
  s2: string,
  s3: string
];

// Compact format: [word, translationAr, pos, category]
export type CompactWordTuple = [
  word: string,
  translationAr: string,
  pos: PartOfSpeech,
  category: WordCategory
];

function buildContextualSentences(
  word: string,
  pos: PartOfSpeech,
  category: WordCategory,
  level: CEFRLevel
): [string, string, string] {
  const clean = word.trim();
  const cap = clean.charAt(0).toUpperCase() + clean.slice(1);

  if (pos === 'verb') {
    if (level === 'A1' || level === 'A2') {
      return [
        `We try to ${clean} carefully during our daily practice.`,
        `She learned how to ${clean} better after reading short stories.`,
        `Do not forget to ${clean} when the time is right.`,
      ];
    }
    return [
      `Consistent learners ${clean} naturally when reading engaging context.`,
      `They agreed to ${clean} the main details before the evening deadline.`,
      `Practicing with real stories makes it easier to ${clean} with confidence.`,
    ];
  }

  if (pos === 'adjective') {
    if (category === 'travel') {
      return [
        `Travelers enjoyed the ${clean} atmosphere along the harbor road.`,
        `Choosing a ${clean} route turned the trip into a calm experience.`,
        `Everyone remarked how ${clean} the mountain view looked at sunrise.`,
      ];
    }
    if (category === 'career') {
      return [
        `A ${clean} study routine leads to steady progress every week.`,
        `Colleagues praised her ${clean} approach to solving the challenge.`,
        `Keeping notes organized is a ${clean} habit for clear writing.`,
      ];
    }
    return [
      `The morning felt surprisingly ${clean} inside the sunlit garden.`,
      `He shared a ${clean} idea during our friendly conversation.`,
      `Reading ten minutes daily creates a ${clean} learning rhythm.`,
    ];
  }

  if (pos === 'adverb') {
    return [
      `${cap}, the group finished reading the chapter before dusk.`,
      `She spoke ${clean} so every listener could follow the story.`,
      `Step by step, your English fluency improves ${clean} through context.`,
    ];
  }

  // Noun
  if (category === 'travel') {
    return [
      `The traveler noted the ${clean} carefully in her trip journal.`,
      `Near the station entrance, a clear sign pointed toward the ${clean}.`,
      `Every memorable journey teaches something new about the ${clean}.`,
    ];
  }
  if (category === 'career') {
    return [
      `Understanding this ${clean} improves both reading and writing clarity.`,
      `During the meeting, they focused on the ${clean} for ten minutes.`,
      `Strong communication depends on mastering each essential ${clean}.`,
    ];
  }
  return [
    `We talked about the ${clean} while drinking warm afternoon tea.`,
    `A short story helps you remember the word ${clean} in real life.`,
    `Notice how the ${clean} fits naturally into everyday conversation.`,
  ];
}

export function hydrateCombinedLevelVocab(
  level: CEFRLevel,
  richRows: RichWordTuple[],
  compactRows: CompactWordTuple[],
  targetCount = 750,
  excludeWords?: Set<string>
): VocabWord[] {
  const seen = new Set<string>(excludeWords ? Array.from(excludeWords) : []);
  const result: VocabWord[] = [];

  for (const [word, translationAr, partOfSpeech, phonetic, category, s1, s2, s3] of richRows) {
    if (result.length >= targetCount) break;
    const cleanWord = word.trim().toLowerCase();
    if (!cleanWord || seen.has(cleanWord)) continue;
    seen.add(cleanWord);
    result.push({
      id: `${level.toLowerCase()}-${String(result.length + 1).padStart(3, '0')}`,
      word: cleanWord,
      translationAr: translationAr.trim(),
      level,
      partOfSpeech,
      phonetic: phonetic.trim(),
      category,
      sentences: [s1, s2, s3],
    });
  }

  for (const [word, translationAr, partOfSpeech, category] of compactRows) {
    if (result.length >= targetCount) break;
    const cleanWord = word.trim().toLowerCase();
    if (!cleanWord || seen.has(cleanWord)) continue;
    seen.add(cleanWord);
    result.push({
      id: `${level.toLowerCase()}-${String(result.length + 1).padStart(3, '0')}`,
      word: cleanWord,
      translationAr: translationAr.trim(),
      level,
      partOfSpeech,
      phonetic: '',
      category,
      sentences: buildContextualSentences(cleanWord, partOfSpeech, category, level),
    });
  }

  return result;
}
