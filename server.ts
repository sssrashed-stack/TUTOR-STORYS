import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  BUILTIN_STORIES,
  BUILTIN_WORDS,
} from './src/data/curriculum.ts';
import type {
  AccentType,
  CEFRLevel,
  UserPermissions,
  UserPublic,
  UserRole,
  UserStatus,
  VocabWord,
} from './src/types.ts';
import {
  correctWritingWithAI,
  evaluatePronunciationWithAI,
  generateEphemeralStory,
} from './server/ai.ts';
import {
  createAdminUser,
  createPasswordResetRequest,
  createPendingMember,
  createSession,
  db,
  deleteSession,
  dismissPasswordResetRequest,
  getSessionUser,
  getUserById,
  getUserByUsername,
  getUserProgressSnapshot,
  hasAdminConfigured,
  issuePasswordResetCode,
  listCustomWords,
  listNonAdminUsers,
  listPendingPasswordResets,
  recordWordReview,
  redeemPasswordResetCode,
  rowToUserPublic,
  saveQuizAttempt,
  saveWritingSubmission,
  syncEnvAdmin,
  toggleStoryBookmark,
  toggleStoryCompleted,
  touchUserStreak,
  updateUserApproval,
  upsertCustomWords,
  verifyPassword,
} from './server/db.ts';

// Sync optional env-configured admin on startup
syncEnvAdmin();

interface AuthenticatedRequest extends Request {
  user?: UserPublic;
  token?: string;
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const user = getSessionUser(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  if (user.status !== 'approved') {
    res.status(403).json({
      error:
        user.status === 'pending'
          ? 'Your account is awaiting administrator approval.'
          : 'Your account access is not active.',
      status: user.status,
    });
    return;
  }
  req.user = user;
  req.token = token;
  next();
}

function requireApprovalAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'admin' && !req.user.permissions.canApproveUsers) {
    res.status(403).json({ error: 'Administrator approval permission required' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Health & bootstrap status (never exposes admin credentials/email)
  app.get('/api/auth/bootstrap-status', (_req, res) => {
    res.json({
      adminConfigured: hasAdminConfigured(),
    });
  });

  // One-time first-run admin setup (locks permanently once any admin exists or env admin is set)
  app.post('/api/auth/admin-claim', (req, res) => {
    if (hasAdminConfigured()) {
      res.status(403).json({ error: 'Admin account is already configured.' });
      return;
    }
    const { username, email, password } = req.body ?? {};
    if (
      typeof username !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      username.trim().length < 3 ||
      password.length < 8
    ) {
      res.status(400).json({ error: 'Valid username, email, and password (8+ chars) required.' });
      return;
    }
    const existing = getUserByUsername(username);
    if (existing) {
      res.status(409).json({ error: 'Username is already taken.' });
      return;
    }
    const admin = createAdminUser(username, email, password);
    const token = createSession(admin.id);
    res.status(201).json({ user: admin, token });
  });

  // Member registration (defaults to pending approval)
  app.post('/api/auth/register', (req, res) => {
    const { username, fullName, email, password, level } = req.body ?? {};
    if (
      typeof username !== 'string' ||
      typeof fullName !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      res.status(400).json({ error: 'All registration fields are required.' });
      return;
    }
    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,32}$/.test(cleanUsername)) {
      res.status(400).json({
        error: 'Username must be 3–32 characters (English letters, numbers, _, ., -).',
      });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (getUserByUsername(cleanUsername)) {
      res.status(409).json({ error: 'Username is already registered.' });
      return;
    }
    const validLevel: CEFRLevel = ['A1', 'A2', 'B1', 'B2'].includes(level) ? level : 'A1';
    const user = createPendingMember({
      username: cleanUsername,
      fullName: fullName.trim().slice(0, 80),
      email: email.trim(),
      password,
      level: validLevel,
    });
    res.status(201).json({
      message: 'Account created and awaiting administrator approval.',
      user: {
        id: user.id,
        username: user.username,
        status: user.status,
      },
    });
  });

  // Login (username + password)
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    const row = getUserByUsername(username);
    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    if (row.status === 'pending') {
      res.status(403).json({
        error: 'حسابك بانتظار موافقة مدير النظام. يرجى المحاولة بعد الموافقة.',
        status: 'pending',
      });
      return;
    }
    if (row.status === 'rejected' || row.status === 'suspended') {
      res.status(403).json({
        error: 'تم إيقاف أو رفض هذا الحساب من قبل الإدارة.',
        status: row.status,
      });
      return;
    }

    touchUserStreak(row.id);
    const updatedUser = rowToUserPublic(getUserById(row.id)!);
    const token = createSession(row.id);
    res.json({ user: updatedUser, token });
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
    const token = extractBearerToken(req);
    if (token) deleteSession(token);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // Public member password reset request (never exposes account existence or admin info)
  app.post('/api/auth/forgot-password', (req, res) => {
    const { username, email } = req.body ?? {};
    if (
      typeof username !== 'string' ||
      typeof email !== 'string' ||
      username.trim().length < 3 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      res.status(400).json({ error: 'Valid username and email address are required.' });
      return;
    }

    createPasswordResetRequest(username, email);
    res.json({
      ok: true,
      message:
        'If the details match an active member account, a reset request has been sent to the administrator to issue a recovery code.',
    });
  });

  // Complete password reset with admin-issued single-use recovery code
  app.post('/api/auth/reset-password', (req, res) => {
    const { username, resetCode, newPassword } = req.body ?? {};
    if (
      typeof username !== 'string' ||
      typeof resetCode !== 'string' ||
      typeof newPassword !== 'string' ||
      username.trim().length < 3 ||
      resetCode.trim().length < 6
    ) {
      res.status(400).json({ error: 'Username, recovery code, and new password are required.' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    const result = redeemPasswordResetCode(username, resetCode, newPassword);
    if (!result.ok) {
      res.status(400).json({
        error:
          result.reason === 'locked'
            ? 'Too many incorrect attempts. Please request a new recovery code.'
            : 'Invalid or expired recovery code.',
      });
      return;
    }
    res.json({ ok: true });
  });

  // Update user's CEFR level or placement completion
  app.patch('/api/user/level', requireAuth, (req: AuthenticatedRequest, res) => {
    const { level, placementCompleted } = req.body ?? {};
    if (!['A1', 'A2', 'B1', 'B2'].includes(level)) {
      res.status(400).json({ error: 'Invalid CEFR level.' });
      return;
    }
    db.prepare('UPDATE users SET level = ?, placement_completed = ? WHERE id = ?').run(
      level,
      placementCompleted ? 1 : 0,
      req.user!.id
    );
    const updated = rowToUserPublic(getUserById(req.user!.id)!);
    res.json({ user: updated });
  });

  // Curriculum: built-in 3,000 words + custom Excel words + 200 stories
  app.get('/api/curriculum', requireAuth, (_req, res) => {
    const customWords = listCustomWords();
    res.json({
      words: [...BUILTIN_WORDS, ...customWords],
      stories: BUILTIN_STORIES,
    });
  });

  // User progress snapshot
  app.get('/api/progress', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json(getUserProgressSnapshot(req.user!.id));
  });

  app.post('/api/progress/story', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storyId, completed } = req.body ?? {};
    if (typeof storyId !== 'string') {
      res.status(400).json({ error: 'storyId is required' });
      return;
    }
    toggleStoryCompleted(req.user!.id, storyId, Boolean(completed));
    res.json(getUserProgressSnapshot(req.user!.id));
  });

  app.post('/api/progress/bookmark', requireAuth, (req: AuthenticatedRequest, res) => {
    const { storyId, bookmarked } = req.body ?? {};
    if (typeof storyId !== 'string' || !storyId.trim() || typeof bookmarked !== 'boolean') {
      res.status(400).json({ error: 'Valid storyId and boolean bookmarked are required' });
      return;
    }
    toggleStoryBookmark(req.user!.id, storyId.trim(), bookmarked);
    res.json(getUserProgressSnapshot(req.user!.id));
  });

  app.post('/api/progress/word', requireAuth, (req: AuthenticatedRequest, res) => {
    const { wordId, outcome } = req.body ?? {};
    if (typeof wordId !== 'string' || (outcome !== 'known' && outcome !== 'unknown')) {
      res.status(400).json({ error: 'Valid wordId and outcome (known|unknown) required' });
      return;
    }
    const updated = recordWordReview(req.user!.id, wordId, outcome);
    res.json({ wordProgress: updated });
  });

  app.post('/api/progress/quiz', requireAuth, (req: AuthenticatedRequest, res) => {
    const { mode, level, storyId, score, total, masteredWordIds, reviewWordIds } = req.body ?? {};
    if (
      (mode !== 'multiple-choice' && mode !== 'fill-blank') ||
      !['A1', 'A2', 'B1', 'B2'].includes(level) ||
      typeof score !== 'number' ||
      typeof total !== 'number'
    ) {
      res.status(400).json({ error: 'Invalid quiz payload' });
      return;
    }
    const saved = saveQuizAttempt(req.user!.id, {
      mode,
      level,
      storyId: typeof storyId === 'string' ? storyId : undefined,
      score,
      total,
      masteredWordIds: Array.isArray(masteredWordIds) ? masteredWordIds : [],
      reviewWordIds: Array.isArray(reviewWordIds) ? reviewWordIds : [],
    });
    res.status(201).json({ attempt: saved });
  });

  // Gemini AI: Ephemeral short story from Unknown Words (NOT saved in DB)
  app.post('/api/ai/ephemeral-story', requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!req.user!.permissions.canUseAI) {
      res.status(403).json({ error: 'AI features are disabled for your account.' });
      return;
    }
    const { words, level } = req.body ?? {};
    if (!Array.isArray(words) || words.length === 0) {
      res.status(400).json({ error: 'Please provide at least 1 unknown word.' });
      return;
    }
    const safeLevel: CEFRLevel = ['A1', 'A2', 'B1', 'B2'].includes(level) ? level : req.user!.level;
    const cleanWords = words
      .slice(0, 15)
      .filter((w) => w && typeof w.word === 'string')
      .map((w) => ({ word: String(w.word).trim(), translationAr: String(w.translationAr || '') }));

    try {
      const story = await generateEphemeralStory({ words: cleanWords, level: safeLevel });
      res.json({ story, ephemeral: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate AI story.';
      res.status(502).json({ error: message });
    }
  });

  // Gemini AI: Free Writing correction with Arabic explanations + saved history
  app.post('/api/ai/correct-writing', requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!req.user!.permissions.canUseAI) {
      res.status(403).json({ error: 'AI features are disabled for your account.' });
      return;
    }
    const { text, level, topicEn, topicAr, suggestedWords, saveHistory } = req.body ?? {};
    if (typeof text !== 'string' || text.trim().length < 5) {
      res.status(400).json({ error: 'Please write at least a short sentence before checking.' });
      return;
    }
    const safeLevel: CEFRLevel = ['A1', 'A2', 'B1', 'B2'].includes(level) ? level : req.user!.level;
    const snapshot = getUserProgressSnapshot(req.user!.id);
    const previousPatterns = snapshot.writingSubmissions
      .slice(0, 5)
      .flatMap((s) => s.frequentPatternsAr)
      .slice(0, 6);

    try {
      const result = await correctWritingWithAI({
        text: text.trim().slice(0, 4000),
        level: safeLevel,
        topicEn: typeof topicEn === 'string' ? topicEn : 'Free English Practice',
        suggestedWords: Array.isArray(suggestedWords) ? suggestedWords.map(String).slice(0, 20) : [],
        previousPatterns,
      });

      if (saveHistory !== false) {
        const saved = saveWritingSubmission(req.user!.id, {
          level: safeLevel,
          topicEn: typeof topicEn === 'string' ? topicEn : 'Free English Practice',
          topicAr: typeof topicAr === 'string' ? topicAr : 'تدريب كتابة حرّة',
          originalText: text.trim(),
          correctedText: result.correctedText,
          errors: result.errors,
          frequentPatternsAr: result.frequentPatternsAr,
          suggestedWordsUsed: result.suggestedWordsUsed,
          overallFeedbackAr: result.overallFeedbackAr,
        });
        res.json({ submission: saved });
      } else {
        res.json({
          submission: {
            id: 'ephemeral-check',
            level: safeLevel,
            topicEn: typeof topicEn === 'string' ? topicEn : 'Story Practice',
            topicAr: typeof topicAr === 'string' ? topicAr : 'تدريب القصة',
            originalText: text.trim(),
            createdAt: new Date().toISOString(),
            ...result,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze writing.';
      res.status(502).json({ error: message });
    }
  });

  // Gemini AI: Pronunciation & Accent Trainer scoring from recorded microphone audio
  app.post('/api/ai/pronunciation-score', requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!req.user!.permissions.canUseAI) {
      res.status(403).json({ error: 'AI features are disabled for your account.' });
      return;
    }
    const { audioBase64, mimeType, expectedSentence, accent, level } = req.body ?? {};
    if (
      typeof audioBase64 !== 'string' ||
      audioBase64.length < 100 ||
      audioBase64.length > 8_000_000 ||
      typeof expectedSentence !== 'string' ||
      expectedSentence.trim().length < 2
    ) {
      res.status(400).json({ error: 'Valid audio recording and target sentence are required.' });
      return;
    }
    const safeMime =
      typeof mimeType === 'string' && mimeType.startsWith('audio/')
        ? mimeType
        : 'audio/webm';
    const safeAccent: AccentType = accent === 'en-GB' ? 'en-GB' : 'en-US';
    const safeLevel: CEFRLevel = ['A1', 'A2', 'B1', 'B2'].includes(level)
      ? level
      : req.user!.level;

    try {
      const evaluation = await evaluatePronunciationWithAI({
        audioBase64,
        mimeType: safeMime,
        expectedSentence: expectedSentence.trim().slice(0, 600),
        accent: safeAccent,
        level: safeLevel,
      });
      res.json({ evaluation });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to score pronunciation.';
      res.status(502).json({ error: message });
    }
  });

  // Admin: Approvals & Permissions
  app.get('/api/admin/users', requireAuth, requireApprovalAccess, (_req, res) => {
    // Only returns non-admin accounts; admin's own username & email remain private
    res.json({ users: listNonAdminUsers() });
  });

  app.patch(
    '/api/admin/users/:id',
    requireAuth,
    requireApprovalAccess,
    (req: AuthenticatedRequest, res) => {
      const targetId = String(req.params.id);
      const { status, role, permissions, level } = req.body ?? {};
      const allowedStatuses: UserStatus[] = ['pending', 'approved', 'rejected', 'suspended'];
      const allowedRoles: UserRole[] = ['member', 'moderator'];
      const allowedLevels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];

      const safeStatus = allowedStatuses.includes(status) ? status : undefined;
      const safeRole = allowedRoles.includes(role) ? role : undefined;
      const safeLevel = allowedLevels.includes(level) ? level : undefined;
      let safePerms: UserPermissions | undefined;
      if (permissions && typeof permissions === 'object') {
        safePerms = {
          canReadStories: Boolean(permissions.canReadStories),
          canUseAI: Boolean(permissions.canUseAI),
          canManageWords: Boolean(permissions.canManageWords),
          canApproveUsers: Boolean(permissions.canApproveUsers),
        };
      }

      const updated = updateUserApproval(targetId, {
        status: safeStatus,
        role: safeRole,
        permissions: safePerms,
        level: safeLevel,
      });
      if (!updated) {
        res.status(404).json({ error: 'Member not found or cannot modify root admin.' });
        return;
      }
      res.json({ user: updated });
    }
  );

  // Admin: Password Reset Requests Queue & Single-Use Code Issuance
  app.get('/api/admin/password-resets', requireAuth, requireApprovalAccess, (_req, res) => {
    res.json({ requests: listPendingPasswordResets() });
  });

  app.post(
    '/api/admin/password-resets/:id/issue-code',
    requireAuth,
    requireApprovalAccess,
    (req, res) => {
      const issued = issuePasswordResetCode(String(req.params.id));
      if (!issued) {
        res.status(404).json({ error: 'Password reset request not found.' });
        return;
      }
      res.json({ request: issued.request, code: issued.plainCode });
    }
  );

  app.delete(
    '/api/admin/password-resets/:id',
    requireAuth,
    requireApprovalAccess,
    (req, res) => {
      const deleted = dismissPasswordResetRequest(String(req.params.id));
      if (!deleted) {
        res.status(404).json({ error: 'Password reset request not found.' });
        return;
      }
      res.json({ ok: true });
    }
  );

  // Admin / Word Manager: Import validated words from Excel
  app.post('/api/admin/import-words', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.user!.role !== 'admin' && !req.user!.permissions.canManageWords) {
      res.status(403).json({ error: 'Word management permission required.' });
      return;
    }
    const { words } = req.body ?? {};
    if (!Array.isArray(words) || words.length === 0) {
      res.status(400).json({ error: 'No valid vocabulary rows provided.' });
      return;
    }

    const existingBuiltIn = new Set(BUILTIN_WORDS.map((w) => w.word.toLowerCase()));
    const validRows: VocabWord[] = [];
    for (const item of words.slice(0, 3000)) {
      if (!item || typeof item.word !== 'string' || typeof item.translationAr !== 'string') continue;
      const wLower = item.word.trim().toLowerCase();
      if (!wLower || existingBuiltIn.has(wLower)) continue;
      const lvl: CEFRLevel = ['A1', 'A2', 'B1', 'B2'].includes(item.level) ? item.level : 'A1';
      const pos = ['noun', 'verb', 'adjective', 'adverb'].includes(item.partOfSpeech)
        ? item.partOfSpeech
        : 'noun';
      const cat = ['daily', 'travel', 'career'].includes(item.category) ? item.category : 'daily';
      validRows.push({
        id: `custom-${wLower.replace(/[^a-z0-9]/g, '-')}`,
        word: wLower,
        translationAr: item.translationAr.trim(),
        level: lvl,
        partOfSpeech: pos,
        phonetic: typeof item.phonetic === 'string' ? item.phonetic : '',
        category: cat,
        storyGroup: typeof item.storyGroup === 'string' ? item.storyGroup : undefined,
        sentences: [
          item.sentences?.[0] || `We practiced the word "${wLower}" in today's story.`,
          item.sentences?.[1] || `Try using "${wLower}" inside a short sentence.`,
          item.sentences?.[2] || `Review "${wLower}" again tomorrow for better memory.`,
        ],
        isCustom: true,
      });
    }

    const result = upsertCustomWords(validRows);
    res.json({
      ...result,
      customWords: listCustomWords(),
    });
  });

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    // Serve /index.php identically to / so PHP-format home entry URLs resolve smoothly
    app.get('/index.php', async (req, res, next) => {
      try {
        const htmlPath = path.resolve(process.cwd(), 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf-8');
        html = await vite.transformIndexHtml('/index.php', html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get(['/', '/index.php', '*'], (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Tutor Story server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Tutor Story server:', err);
  process.exit(1);
});
