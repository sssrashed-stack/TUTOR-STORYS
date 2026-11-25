export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2';

export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb';

export type WordCategory = 'daily' | 'travel' | 'career';

export type WordLearningStatus = 'new' | 'learning' | 'mastered';

export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type UserRole = 'member' | 'moderator' | 'admin';

export interface UserPermissions {
  canReadStories: boolean;
  canUseAI: boolean;
  canManageWords: boolean;
  canApproveUsers: boolean;
}

export interface UserPublic {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  level: CEFRLevel;
  placementCompleted: boolean;
  permissions: UserPermissions;
  streakDays: number;
  lastActiveDate: string;
  createdAt: string;
}

export interface PasswordResetRequestPublic {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  email: string;
  status: 'pending' | 'code_issued';
  expiresAt: number | null;
  createdAt: string;
}

export interface VocabWord {
  id: string;
  word: string;
  translationAr: string;
  level: CEFRLevel;
  partOfSpeech: PartOfSpeech;
  phonetic: string;
  category: WordCategory;
  storyGroup?: string;
  sentences: [string, string, string];
  isCustom?: boolean;
}

export interface Story {
  id: string;
  index: number;
  title: string;
  titleAr: string;
  level: CEFRLevel;
  category: WordCategory;
  text: string;
  wordCount: number;
  estimatedMinutes: number;
  targetWordIds: string[];
}

export interface UserWordProgress {
  wordId: string;
  status: WordLearningStatus;
  isUnknown: boolean;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  correctCount: number;
  wrongCount: number;
  lastReviewedAt: string | null;
  nextReviewAt: string;
}

export interface QuizAttempt {
  id: string;
  mode: 'multiple-choice' | 'fill-blank';
  level: CEFRLevel;
  storyId?: string;
  score: number;
  total: number;
  masteredWordIds: string[];
  reviewWordIds: string[];
  createdAt: string;
}

export interface WritingErrorItem {
  original: string;
  correction: string;
  errorType: string;
  explanationAr: string;
  ruleAr: string;
  exampleEn: string;
}

export interface WritingSubmission {
  id: string;
  level: CEFRLevel;
  topicEn: string;
  topicAr: string;
  originalText: string;
  correctedText: string;
  errors: WritingErrorItem[];
  frequentPatternsAr: string[];
  suggestedWordsUsed: string[];
  overallFeedbackAr: string;
  createdAt: string;
}

export interface UserProgressSnapshot {
  completedStoryIds: string[];
  bookmarks: string[];
  wordProgress: Record<string, UserWordProgress>;
  quizAttempts: QuizAttempt[];
  writingSubmissions: WritingSubmission[];
  streakDays: number;
  points: number;
}

export type AppScreen =
  | 'home'
  | 'library'
  | 'reader'
  | 'flashcards'
  | 'quiz'
  | 'review'
  | 'unknown'
  | 'writing'
  | 'progress'
  | 'settings'
  | 'admin';

export type UILanguage = 'ar' | 'en';
export type AccentType = 'en-US' | 'en-GB';
export type FontSizeOption = 'sm' | 'md' | 'lg' | 'xl';

export interface PronunciationWordFeedback {
  word: string;
  status: 'accurate' | 'needs_work' | 'missed';
  tipAr: string;
}

export interface PronunciationEvaluation {
  pronunciationScore: number;
  accentScore: number;
  overallScore: number;
  heardTranscript: string;
  wordFeedback: PronunciationWordFeedback[];
  coachSummaryAr: string;
}

