import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  CEFRLevel,
  PasswordResetRequestPublic,
  QuizAttempt,
  UserPermissions,
  UserPublic,
  UserRole,
  UserStatus,
  UserWordProgress,
  VocabWord,
  WordLearningStatus,
  WritingSubmission,
} from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'tutor_story.db');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'pending',
    level TEXT NOT NULL DEFAULT 'A1',
    placement_completed INTEGER NOT NULL DEFAULT 0,
    permissions_json TEXT NOT NULL,
    streak_days INTEGER NOT NULL DEFAULT 1,
    last_active_date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_completed_stories (
    user_id TEXT NOT NULL,
    story_id TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, story_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_bookmarked_stories (
    user_id TEXT NOT NULL,
    story_id TEXT NOT NULL,
    bookmarked_at TEXT NOT NULL,
    PRIMARY KEY (user_id, story_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_word_progress (
    user_id TEXT NOT NULL,
    word_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    is_unknown INTEGER NOT NULL DEFAULT 0,
    interval_days INTEGER NOT NULL DEFAULT 0,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    repetitions INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at TEXT,
    next_review_at TEXT NOT NULL,
    PRIMARY KEY (user_id, word_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    level TEXT NOT NULL,
    story_id TEXT,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    mastered_json TEXT NOT NULL,
    review_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS writing_submissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    level TEXT NOT NULL,
    topic_en TEXT NOT NULL,
    topic_ar TEXT NOT NULL,
    original_text TEXT NOT NULL,
    corrected_text TEXT NOT NULL,
    errors_json TEXT NOT NULL,
    frequent_patterns_json TEXT NOT NULL,
    suggested_words_json TEXT NOT NULL,
    overall_feedback_ar TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS custom_words (
    id TEXT PRIMARY KEY,
    word TEXT NOT NULL UNIQUE,
    translation_ar TEXT NOT NULL,
    level TEXT NOT NULL,
    part_of_speech TEXT NOT NULL,
    phonetic TEXT NOT NULL,
    category TEXT NOT NULL,
    story_group TEXT,
    sentences_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    code_hash TEXT,
    expires_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

export const DEFAULT_MEMBER_PERMISSIONS: UserPermissions = {
  canReadStories: true,
  canUseAI: true,
  canManageWords: false,
  canApproveUsers: false,
};

export const ADMIN_PERMISSIONS: UserPermissions = {
  canReadStories: true,
  canUseAI: true,
  canManageWords: true,
  canApproveUsers: true,
};

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface UserRow {
  id: string;
  username: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: string;
  status: string;
  level: string;
  placement_completed: number;
  permissions_json: string;
  streak_days: number;
  last_active_date: string;
  created_at: string;
}

export function rowToUserPublic(row: UserRow): UserPublic {
  let perms = DEFAULT_MEMBER_PERMISSIONS;
  try {
    perms = { ...DEFAULT_MEMBER_PERMISSIONS, ...JSON.parse(row.permissions_json) };
  } catch {
    // fallback
  }
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    email: row.email,
    role: row.role as UserRole,
    status: row.status as UserStatus,
    level: row.level as CEFRLevel,
    placementCompleted: Boolean(row.placement_completed),
    permissions: perms,
    streakDays: row.streak_days,
    lastActiveDate: row.last_active_date,
    createdAt: row.created_at,
  };
}

export function hasAdminConfigured(): boolean {
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    return true;
  }
  const row = db
    .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'")
    .get() as { cnt: number };
  return row.cnt > 0;
}

export function getUserByUsername(username: string): UserRow | undefined {
  return db
    .prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)')
    .get(username.trim()) as UserRow | undefined;
}

export function getUserById(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function createAdminUser(username: string, email: string, password: string): UserPublic {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const today = todayISO();
  const hash = hashPassword(password);
  db.prepare(
    `INSERT INTO users (
      id, username, full_name, email, password_hash, role, status, level,
      placement_completed, permissions_json, streak_days, last_active_date, created_at
    ) VALUES (?, ?, ?, ?, ?, 'admin', 'approved', 'B2', 1, ?, 1, ?, ?)`
  ).run(
    id,
    username.trim().toLowerCase(),
    'System Administrator',
    email.trim().toLowerCase(),
    hash,
    JSON.stringify(ADMIN_PERMISSIONS),
    today,
    now
  );
  return rowToUserPublic(getUserById(id)!);
}

export function syncEnvAdmin(): void {
  const envUser = process.env.ADMIN_USERNAME?.trim();
  const envPass = process.env.ADMIN_PASSWORD;
  const envEmail = process.env.ADMIN_EMAIL?.trim() || 'admin@local';
  if (!envUser || !envPass) return;

  const existing = getUserByUsername(envUser);
  const hash = hashPassword(envPass);
  if (existing) {
    db.prepare(
      `UPDATE users SET password_hash = ?, email = ?, role = 'admin', status = 'approved', permissions_json = ? WHERE id = ?`
    ).run(hash, envEmail.toLowerCase(), JSON.stringify(ADMIN_PERMISSIONS), existing.id);
  } else {
    createAdminUser(envUser, envEmail, envPass);
  }
}

export function createPendingMember(params: {
  username: string;
  fullName: string;
  email: string;
  password: string;
  level: CEFRLevel;
}): UserPublic {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const today = todayISO();
  const hash = hashPassword(params.password);
  db.prepare(
    `INSERT INTO users (
      id, username, full_name, email, password_hash, role, status, level,
      placement_completed, permissions_json, streak_days, last_active_date, created_at
    ) VALUES (?, ?, ?, ?, ?, 'member', 'pending', ?, 0, ?, 1, ?, ?)`
  ).run(
    id,
    params.username.trim().toLowerCase(),
    params.fullName.trim(),
    params.email.trim().toLowerCase(),
    hash,
    params.level,
    JSON.stringify(DEFAULT_MEMBER_PERMISSIONS),
    today,
    now
  );
  return rowToUserPublic(getUserById(id)!);
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, expiresAt, new Date().toISOString());
  return token;
}

export function getSessionUser(token: string): UserPublic | null {
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, Date.now()) as UserRow | undefined;
  if (!row) return null;
  return rowToUserPublic(row);
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function touchUserStreak(userId: string): void {
  const user = getUserById(userId);
  if (!user) return;
  const today = todayISO();
  if (user.last_active_date === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nextStreak = user.last_active_date === yesterday ? user.streak_days + 1 : 1;
  db.prepare('UPDATE users SET streak_days = ?, last_active_date = ? WHERE id = ?').run(
    nextStreak,
    today,
    userId
  );
}

export function listNonAdminUsers(): UserPublic[] {
  const rows = db
    .prepare("SELECT * FROM users WHERE role != 'admin' ORDER BY created_at DESC")
    .all() as unknown as UserRow[];
  return rows.map(rowToUserPublic);
}

export function updateUserApproval(
  targetUserId: string,
  updates: {
    status?: UserStatus;
    role?: UserRole;
    permissions?: UserPermissions;
    level?: CEFRLevel;
  }
): UserPublic | null {
  const existing = getUserById(targetUserId);
  if (!existing || existing.role === 'admin') return null;

  const status = updates.status ?? (existing.status as UserStatus);
  const role = updates.role === 'admin' ? existing.role : updates.role ?? existing.role;
  const level = updates.level ?? existing.level;
  const permissionsJson = updates.permissions
    ? JSON.stringify(updates.permissions)
    : existing.permissions_json;

  db.prepare(
    'UPDATE users SET status = ?, role = ?, level = ?, permissions_json = ? WHERE id = ?'
  ).run(status, role, level, permissionsJson, targetUserId);

  if (status !== 'approved') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUserId);
  }

  return rowToUserPublic(getUserById(targetUserId)!);
}

export function getUserProgressSnapshot(userId: string) {
  const user = getUserById(userId);
  const completedRows = db
    .prepare('SELECT story_id FROM user_completed_stories WHERE user_id = ?')
    .all(userId) as Array<{ story_id: string }>;

  const bookmarkedRows = db
    .prepare('SELECT story_id FROM user_bookmarked_stories WHERE user_id = ? ORDER BY bookmarked_at DESC')
    .all(userId) as Array<{ story_id: string }>;

  const wordRows = db
    .prepare('SELECT * FROM user_word_progress WHERE user_id = ?')
    .all(userId) as Array<{
    word_id: string;
    status: string;
    is_unknown: number;
    interval_days: number;
    ease_factor: number;
    repetitions: number;
    correct_count: number;
    wrong_count: number;
    last_reviewed_at: string | null;
    next_review_at: string;
  }>;

  const wordProgress: Record<string, UserWordProgress> = {};
  for (const r of wordRows) {
    wordProgress[r.word_id] = {
      wordId: r.word_id,
      status: r.status as WordLearningStatus,
      isUnknown: Boolean(r.is_unknown),
      intervalDays: r.interval_days,
      easeFactor: r.ease_factor,
      repetitions: r.repetitions,
      correctCount: r.correct_count,
      wrongCount: r.wrong_count,
      lastReviewedAt: r.last_reviewed_at,
      nextReviewAt: r.next_review_at,
    };
  }

  const quizRows = db
    .prepare('SELECT * FROM quiz_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 40')
    .all(userId) as Array<{
    id: string;
    mode: string;
    level: string;
    story_id: string | null;
    score: number;
    total: number;
    mastered_json: string;
    review_json: string;
    created_at: string;
  }>;

  const quizAttempts: QuizAttempt[] = quizRows.map((q) => ({
    id: q.id,
    mode: q.mode as 'multiple-choice' | 'fill-blank',
    level: q.level as CEFRLevel,
    storyId: q.story_id ?? undefined,
    score: q.score,
    total: q.total,
    masteredWordIds: JSON.parse(q.mastered_json),
    reviewWordIds: JSON.parse(q.review_json),
    createdAt: q.created_at,
  }));

  const writingRows = db
    .prepare('SELECT * FROM writing_submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(userId) as Array<{
    id: string;
    level: string;
    topic_en: string;
    topic_ar: string;
    original_text: string;
    corrected_text: string;
    errors_json: string;
    frequent_patterns_json: string;
    suggested_words_json: string;
    overall_feedback_ar: string;
    created_at: string;
  }>;

  const writingSubmissions: WritingSubmission[] = writingRows.map((w) => ({
    id: w.id,
    level: w.level as CEFRLevel,
    topicEn: w.topic_en,
    topicAr: w.topic_ar,
    originalText: w.original_text,
    correctedText: w.corrected_text,
    errors: JSON.parse(w.errors_json),
    frequentPatternsAr: JSON.parse(w.frequent_patterns_json),
    suggestedWordsUsed: JSON.parse(w.suggested_words_json),
    overallFeedbackAr: w.overall_feedback_ar,
    createdAt: w.created_at,
  }));

  const masteredCount = Object.values(wordProgress).filter((w) => w.status === 'mastered').length;
  const points =
    completedRows.length * 25 +
    masteredCount * 10 +
    quizAttempts.reduce((acc, q) => acc + q.score * 5, 0) +
    writingSubmissions.length * 20;

  return {
    completedStoryIds: completedRows.map((r) => r.story_id),
    bookmarks: bookmarkedRows.map((r) => r.story_id),
    wordProgress,
    quizAttempts,
    writingSubmissions,
    streakDays: user?.streak_days ?? 1,
    points,
  };
}

export function toggleStoryCompleted(userId: string, storyId: string, completed: boolean): void {
  if (completed) {
    db.prepare(
      'INSERT OR REPLACE INTO user_completed_stories (user_id, story_id, completed_at) VALUES (?, ?, ?)'
    ).run(userId, storyId, new Date().toISOString());
  } else {
    db.prepare('DELETE FROM user_completed_stories WHERE user_id = ? AND story_id = ?').run(
      userId,
      storyId
    );
  }
  touchUserStreak(userId);
}

export function toggleStoryBookmark(userId: string, storyId: string, bookmarked: boolean): void {
  if (bookmarked) {
    db.prepare(
      'INSERT OR REPLACE INTO user_bookmarked_stories (user_id, story_id, bookmarked_at) VALUES (?, ?, ?)'
    ).run(userId, storyId, new Date().toISOString());
  } else {
    db.prepare('DELETE FROM user_bookmarked_stories WHERE user_id = ? AND story_id = ?').run(
      userId,
      storyId
    );
  }
}

/**
 * Simplified Leitner / SM-2 Spaced Repetition update:
 * Intervals when known: Today (0) -> Tomorrow (1) -> 3 days -> 7 days -> 14 days -> 30 days
 * When unknown/wrong: resets to Today (0 -> 1d) and adds word to user's Unknown Words section.
 */
export function recordWordReview(
  userId: string,
  wordId: string,
  outcome: 'known' | 'unknown'
): UserWordProgress {
  const existing = db
    .prepare('SELECT * FROM user_word_progress WHERE user_id = ? AND word_id = ?')
    .get(userId, wordId) as
    | {
        status: string;
        is_unknown: number;
        interval_days: number;
        ease_factor: number;
        repetitions: number;
        correct_count: number;
        wrong_count: number;
      }
    | undefined;

  const now = new Date();
  const prevReps = existing?.repetitions ?? 0;
  const prevEase = existing?.ease_factor ?? 2.5;
  const prevCorrect = existing?.correct_count ?? 0;
  const prevWrong = existing?.wrong_count ?? 0;

  let status: WordLearningStatus;
  let isUnknown: boolean;
  let intervalDays: number;
  let repetitions: number;
  let easeFactor = prevEase;
  let correctCount = prevCorrect;
  let wrongCount = prevWrong;

  const LEITNER_SCHEDULE = [1, 3, 7, 14, 30];

  if (outcome === 'known') {
    repetitions = prevReps + 1;
    correctCount += 1;
    easeFactor = Math.min(3.0, prevEase + 0.1);
    const idx = Math.min(repetitions - 1, LEITNER_SCHEDULE.length - 1);
    intervalDays = LEITNER_SCHEDULE[idx];
    status = repetitions >= 3 ? 'mastered' : 'learning';
    isUnknown = false;
  } else {
    repetitions = 0;
    wrongCount += 1;
    easeFactor = Math.max(1.3, prevEase - 0.2);
    intervalDays = 0; // Due immediately / today -> tomorrow
    status = 'learning';
    isUnknown = true;
  }

  const nextReview = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString();
  const lastReviewedAt = now.toISOString();

  db.prepare(
    `INSERT OR REPLACE INTO user_word_progress (
      user_id, word_id, status, is_unknown, interval_days, ease_factor,
      repetitions, correct_count, wrong_count, last_reviewed_at, next_review_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    wordId,
    status,
    isUnknown ? 1 : 0,
    intervalDays,
    easeFactor,
    repetitions,
    correctCount,
    wrongCount,
    lastReviewedAt,
    nextReview
  );

  touchUserStreak(userId);

  return {
    wordId,
    status,
    isUnknown,
    intervalDays,
    easeFactor,
    repetitions,
    correctCount,
    wrongCount,
    lastReviewedAt,
    nextReviewAt: nextReview,
  };
}

export function saveQuizAttempt(userId: string, attempt: Omit<QuizAttempt, 'id' | 'createdAt'>): QuizAttempt {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO quiz_attempts (
      id, user_id, mode, level, story_id, score, total, mastered_json, review_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    attempt.mode,
    attempt.level,
    attempt.storyId ?? null,
    attempt.score,
    attempt.total,
    JSON.stringify(attempt.masteredWordIds),
    JSON.stringify(attempt.reviewWordIds),
    createdAt
  );
  touchUserStreak(userId);
  return { id, createdAt, ...attempt };
}

export function saveWritingSubmission(
  userId: string,
  sub: Omit<WritingSubmission, 'id' | 'createdAt'>
): WritingSubmission {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO writing_submissions (
      id, user_id, level, topic_en, topic_ar, original_text, corrected_text,
      errors_json, frequent_patterns_json, suggested_words_json, overall_feedback_ar, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    sub.level,
    sub.topicEn,
    sub.topicAr,
    sub.originalText,
    sub.correctedText,
    JSON.stringify(sub.errors),
    JSON.stringify(sub.frequentPatternsAr),
    JSON.stringify(sub.suggestedWordsUsed),
    sub.overallFeedbackAr,
    createdAt
  );
  touchUserStreak(userId);
  return { id, createdAt, ...sub };
}

export function listCustomWords(): VocabWord[] {
  const rows = db
    .prepare('SELECT * FROM custom_words ORDER BY created_at DESC')
    .all() as Array<{
    id: string;
    word: string;
    translation_ar: string;
    level: string;
    part_of_speech: string;
    phonetic: string;
    category: string;
    story_group: string | null;
    sentences_json: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    word: r.word,
    translationAr: r.translation_ar,
    level: r.level as CEFRLevel,
    partOfSpeech: r.part_of_speech as VocabWord['partOfSpeech'],
    phonetic: r.phonetic,
    category: r.category as VocabWord['category'],
    storyGroup: r.story_group ?? undefined,
    sentences: JSON.parse(r.sentences_json),
    isCustom: true,
  }));
}

export function upsertCustomWords(words: VocabWord[]): { inserted: number; skipped: number } {
  let inserted = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO custom_words (
      id, word, translation_ar, level, part_of_speech, phonetic, category, story_group, sentences_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const w of words) {
    const cleanWord = w.word.trim().toLowerCase();
    if (!cleanWord || !w.translationAr.trim()) {
      skipped++;
      continue;
    }
    const res = stmt.run(
      w.id || `custom-${crypto.randomUUID().slice(0, 8)}`,
      cleanWord,
      w.translationAr.trim(),
      w.level,
      w.partOfSpeech || 'noun',
      w.phonetic || '',
      w.category || 'daily',
      w.storyGroup ?? null,
      JSON.stringify(w.sentences),
      now
    );
    if (res.changes > 0) inserted++;
    else skipped++;
  }
  return { inserted, skipped };
}

function hashResetCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

function generateReadableResetCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

export function createPasswordResetRequest(username: string, email: string): boolean {
  const user = getUserByUsername(username);
  if (!user || user.role === 'admin') return false;
  if (user.status === 'rejected' || user.status === 'suspended') return false;
  if (user.email.trim().toLowerCase() !== email.trim().toLowerCase()) return false;

  db.prepare(
    'DELETE FROM password_reset_requests WHERE user_id = ? AND used_at IS NULL'
  ).run(user.id);

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO password_reset_requests (
      id, user_id, status, code_hash, expires_at, attempts, used_at, created_at
    ) VALUES (?, ?, 'pending', NULL, NULL, 0, NULL, ?)`
  ).run(id, user.id, new Date().toISOString());
  return true;
}

export function listPendingPasswordResets(): PasswordResetRequestPublic[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.user_id, u.username, u.full_name, u.email, r.status, r.expires_at, r.created_at
       FROM password_reset_requests r
       JOIN users u ON u.id = r.user_id
       WHERE u.role != 'admin' AND r.used_at IS NULL AND r.status IN ('pending', 'code_issued')
       ORDER BY r.created_at DESC`
    )
    .all() as Array<{
    id: string;
    user_id: string;
    username: string;
    full_name: string;
    email: string;
    status: string;
    expires_at: number | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    fullName: r.full_name,
    email: r.email,
    status: r.status === 'code_issued' ? 'code_issued' : 'pending',
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}

export function issuePasswordResetCode(
  requestId: string
): { request: PasswordResetRequestPublic; plainCode: string } | null {
  const row = db
    .prepare(
      `SELECT r.id, r.user_id, u.username, u.full_name, u.email, u.role, r.created_at
       FROM password_reset_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = ? AND r.used_at IS NULL`
    )
    .get(requestId) as
    | {
        id: string;
        user_id: string;
        username: string;
        full_name: string;
        email: string;
        role: string;
        created_at: string;
      }
    | undefined;

  if (!row || row.role === 'admin') return null;

  const plainCode = generateReadableResetCode();
  const codeHash = hashResetCode(plainCode);
  const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes

  db.prepare(
    `UPDATE password_reset_requests
     SET status = 'code_issued', code_hash = ?, expires_at = ?, attempts = 0
     WHERE id = ?`
  ).run(codeHash, expiresAt, requestId);

  return {
    plainCode,
    request: {
      id: row.id,
      userId: row.user_id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      status: 'code_issued',
      expiresAt,
      createdAt: row.created_at,
    },
  };
}

export function dismissPasswordResetRequest(requestId: string): boolean {
  const res = db
    .prepare('DELETE FROM password_reset_requests WHERE id = ?')
    .run(requestId);
  return Number(res.changes) > 0;
}

export function redeemPasswordResetCode(
  username: string,
  resetCode: string,
  newPassword: string
): { ok: true } | { ok: false; reason: 'invalid' | 'locked' } {
  const user = getUserByUsername(username);
  if (!user || user.role === 'admin') {
    return { ok: false, reason: 'invalid' };
  }

  const reqRow = db
    .prepare(
      `SELECT * FROM password_reset_requests
       WHERE user_id = ? AND status = 'code_issued' AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(user.id) as
    | {
        id: string;
        code_hash: string | null;
        expires_at: number | null;
        attempts: number;
      }
    | undefined;

  if (!reqRow || !reqRow.code_hash || !reqRow.expires_at || reqRow.expires_at <= Date.now()) {
    return { ok: false, reason: 'invalid' };
  }

  if (reqRow.attempts >= 5) {
    return { ok: false, reason: 'locked' };
  }

  const candidateHash = hashResetCode(resetCode);
  const expectedBuf = Buffer.from(reqRow.code_hash, 'hex');
  const candidateBuf = Buffer.from(candidateHash, 'hex');
  const matches =
    expectedBuf.length === candidateBuf.length &&
    crypto.timingSafeEqual(expectedBuf, candidateBuf);

  if (!matches) {
    const nextAttempts = reqRow.attempts + 1;
    db.prepare(
      `UPDATE password_reset_requests
       SET attempts = ?, status = CASE WHEN ? >= 5 THEN 'locked' ELSE status END
       WHERE id = ?`
    ).run(nextAttempts, nextAttempts, reqRow.id);
    return { ok: false, reason: nextAttempts >= 5 ? 'locked' : 'invalid' };
  }

  const nextPasswordHash = hashPassword(newPassword);
  const nowIso = new Date().toISOString();

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(nextPasswordHash, user.id);
  db.prepare(
    `UPDATE password_reset_requests SET status = 'used', used_at = ? WHERE id = ?`
  ).run(nowIso, reqRow.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

  return { ok: true };
}
