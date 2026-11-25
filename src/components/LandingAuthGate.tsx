import React, { useState } from 'react';
import { BookOpen, CheckCircle2, Globe, KeyRound, Lock, Moon, Sun, UserPlus } from 'lucide-react';
import type { CEFRLevel, UILanguage, UserPublic } from '../types.ts';
import { UI_TEXT } from '../i18n/translations.ts';
import { HERO_BANNER_IMAGE } from '../utils/assets.ts';

interface LandingAuthGateProps {
  lang: UILanguage;
  onToggleLang: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  adminConfigured: boolean;
  onAuthSuccess: (user: UserPublic, token: string) => void;
}

export const LandingAuthGate: React.FC<LandingAuthGateProps> = ({
  lang,
  onToggleLang,
  darkMode,
  onToggleDark,
  adminConfigured,
  onAuthSuccess,
}) => {
  const t = UI_TEXT[lang];
  const isAr = lang === 'ar';

  const [mode, setMode] = useState<'login' | 'register' | 'admin-claim' | 'forgot'>('login');
  const [forgotStep, setForgotStep] = useState<'request' | 'verify'>('request');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<CEFRLevel>('A1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPendingNotice(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || (isAr ? 'بيانات الدخول غير صحيحة.' : 'Invalid credentials.'));
          return;
        }
        onAuthSuccess(data.user, data.token);
      } else if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, fullName, email, password, level }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || (isAr ? 'تعذر إنشاء الحساب.' : 'Registration failed.'));
          return;
        }
        setPendingNotice(
          isAr
            ? 'تم استلام طلب تسجيلك بنجاح! حسابك الآن بانتظار موافقة مدير النظام من صفحة الموافقات والصلاحيات.'
            : 'Registration received! Your account is now awaiting administrator approval.'
        );
        setPassword('');
      } else if (mode === 'forgot') {
        if (forgotStep === 'request') {
          const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(
              data.error || (isAr ? 'يرجى التحقق من اسم المستخدم والبريد الإلكتروني.' : 'Please enter valid account details.')
            );
            return;
          }
          setPendingNotice(
            isAr
              ? 'إذا تطابقت البيانات مع حساب عضو نشط، تم إرسال الطلب إلى الإدارة لإصدار رمز استعادة مؤقت. أدخل الرمز أدناه فور استلامه.'
              : 'If the details match an active member account, a request was sent to an administrator. Enter your recovery code below once received.'
          );
          setForgotStep('verify');
        } else {
          if (password.length < 6) {
            setError(
              isAr
                ? 'يجب أن تكون كلمة المرور 6 أحرف على الأقل.'
                : 'New password must be at least 6 characters.'
            );
            return;
          }
          if (password !== confirmPassword) {
            setError(isAr ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.');
            return;
          }
          const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, resetCode, newPassword: password }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(
              data.error || (isAr ? 'رمز الاستعادة غير صحيح أو منتهي الصلاحية.' : 'Invalid or expired recovery code.')
            );
            return;
          }
          setMode('login');
          setForgotStep('request');
          setPassword('');
          setConfirmPassword('');
          setResetCode('');
          setPendingNotice(
            isAr
              ? 'تم تحديث كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.'
              : 'Password updated successfully! You can now sign in with your new password.'
          );
        }
      } else if (mode === 'admin-claim') {
        const res = await fetch('/api/auth/admin-claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || (isAr ? 'تعذر تفعيل حساب الإدارة.' : 'Admin setup failed.'));
          return;
        }
        onAuthSuccess(data.user, data.token);
      }
    } catch {
      setError(isAr ? 'تعذر الاتصال بالخادم.' : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            className="text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display"
          >
            {t.brand}
          </a>

          {/* Zone 2: 4 Concise Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#method"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {isAr ? 'آلية التعلّم' : 'Method'}
            </a>
            <a
              href="#levels"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {isAr ? 'المستويات A1–B2' : 'Levels A1–B2'}
            </a>
            <a
              href="#features"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {isAr ? 'المميزات' : 'Features'}
            </a>
            <button
              type="button"
              onClick={onToggleLang}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Globe className="w-4 h-4" />
              <span>{isAr ? 'English' : 'العربية'}</span>
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onToggleDark}
              aria-label={isAr ? 'تبديل المظهر' : 'Toggle theme'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <a
              href="#auth-gate"
              onClick={() => setMode('login')}
              className="min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-xl transition-colors whitespace-nowrap shrink-0 inline-flex items-center"
            >
              {t.auth.signIn}
            </a>
          </div>
        </div>
      </header>

      {/* Hero Split + Exclusive Members Gate */}
      <main id="top" className="flex-1">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            {/* Editorial Story Visual + Value Proposition */}
            <div className="lg:col-span-7 flex flex-col justify-between gap-6">
              <div>
                <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-3 tracking-wide">
                  {isAr
                    ? 'A1 إلى B2 · 200 قصة قصيرة · بوابة الأعضاء المسجلين فقط'
                    : 'A1 to B2 · 200 Short Stories · Members-Only Access'}
                </p>
                <h1
                  className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight max-w-2xl"
                  style={{ textWrap: 'balance' }}
                >
                  {t.tagline}
                </h1>
                <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                  {isAr
                    ? 'اكتسب المفردات الإنجليزية داخل قصص مشوّقة متدرجة، مع تمييز بصري للكلمات المستهدفة، ونطق فوري، وبطاقات تكرار متباعد، وتصحيح كتابة بالذكاء الاصطناعي.'
                    : 'Acquire English vocabulary naturally inside engaging graded stories, featuring highlighted target words, instant pronunciation, spaced-repetition flashcards, and AI writing feedback.'}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span>{t.journeyMotto}</span>
                </div>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 aspect-video">
                {!imgFailed ? (
                  <img
                    src={HERO_BANNER_IMAGE}
                    alt={isAr ? 'كتاب قصص إنجليزية مفتوح على مكتب خشبي' : 'Open English storybook on oak study desk'}
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-100 to-blue-50 dark:from-slate-900 dark:to-slate-800">
                    <BookOpen className="w-12 h-12 text-blue-700 dark:text-blue-400 mb-3" />
                    <p className="text-sm font-semibold">{t.brand}</p>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-5 text-white">
                  <p className="text-sm font-semibold">
                    {isAr
                      ? '50 قصة لكل مستوى · 750 كلمة مستهدفة · 5–15 دقيقة يوميًا'
                      : '50 stories per level · 750 target words · 5–15 minutes daily'}
                  </p>
                </div>
              </div>
            </div>

            {/* Exclusive Member Login / Registration Gate */}
            <div
              id="auth-gate"
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-6">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                    {mode === 'forgot' ? (
                      <KeyRound className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                    ) : (
                      <Lock className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                    )}
                    <h2 className="text-xl font-bold">
                      {mode === 'login'
                        ? t.auth.signIn
                        : mode === 'register'
                        ? t.auth.register
                        : mode === 'forgot'
                        ? t.auth.forgotTitle
                        : t.auth.adminSetupTitle}
                    </h2>
                  </div>

                  {/* Mobile language toggle */}
                  <button
                    type="button"
                    onClick={onToggleLang}
                    className="md:hidden min-h-[44px] px-3 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg whitespace-nowrap"
                  >
                    {isAr ? 'EN' : 'عربي'}
                  </button>
                </div>

                {/* Segmented Mode Switcher */}
                {(mode === 'login' || mode === 'register') && (
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setError(null);
                        setPendingNotice(null);
                        setResetCode('');
                        setConfirmPassword('');
                      }}
                      className={`min-h-[44px] text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                        mode === 'login'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {t.auth.signIn}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('register');
                        setError(null);
                        setPendingNotice(null);
                        setResetCode('');
                        setConfirmPassword('');
                      }}
                      className={`min-h-[44px] text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                        mode === 'register'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {t.auth.register}
                    </button>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="mb-4 p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 text-sm"
                  >
                    {error}
                  </div>
                )}

                {pendingNotice && (
                  <div
                    role="status"
                    className="mb-4 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 text-sm flex items-start gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{pendingNotice}</span>
                  </div>
                )}

                {mode === 'admin-claim' && (
                  <p className="mb-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t.auth.adminSetupDesc}
                  </p>
                )}

                {mode === 'forgot' && (
                  <p className="mb-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t.auth.forgotDesc}
                  </p>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === 'register' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {t.auth.fullName}
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={isAr ? 'مثال: سارة المنصور' : 'e.g. Sara Al-Mansour'}
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t.auth.username}
                    </label>
                    <input
                      type="text"
                      required
                      dir="ltr"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {(mode === 'register' ||
                    mode === 'admin-claim' ||
                    (mode === 'forgot' && forgotStep === 'request')) && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {t.auth.email}
                      </label>
                      <input
                        type="email"
                        required
                        dir="ltr"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}

                  {mode === 'forgot' && forgotStep === 'verify' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {t.auth.resetCode}
                      </label>
                      <input
                        type="text"
                        required
                        dir="ltr"
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.toUpperCase())}
                        placeholder="ABCD1234"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-nums tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}

                  {(mode !== 'forgot' || forgotStep === 'verify') && (
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {mode === 'forgot' ? t.auth.newPassword : t.auth.password}
                        </label>
                        {mode === 'login' && (
                          <button
                            type="button"
                            onClick={() => {
                              setMode('forgot');
                              setForgotStep('request');
                              setError(null);
                              setPendingNotice(null);
                              setPassword('');
                              setConfirmPassword('');
                            }}
                            className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            {t.auth.forgotPassword}
                          </button>
                        )}
                      </div>
                      <input
                        type="password"
                        required
                        dir="ltr"
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}

                  {mode === 'forgot' && forgotStep === 'verify' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {t.auth.confirmPassword}
                      </label>
                      <input
                        type="password"
                        required
                        dir="ltr"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}

                  {mode === 'register' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {t.auth.initialLevel}
                      </label>
                      <select
                        value={level}
                        onChange={(e) => setLevel(e.target.value as CEFRLevel)}
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="A1">{t.levels.A1}</option>
                        <option value="A2">{t.levels.A2}</option>
                        <option value="B1">{t.levels.B1}</option>
                        <option value="B2">{t.levels.B2}</option>
                      </select>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-semibold text-sm transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {mode === 'register' && <UserPlus className="w-4 h-4" />}
                    {mode === 'forgot' && <KeyRound className="w-4 h-4" />}
                    <span>
                      {loading
                        ? isAr
                          ? 'جاري المعالجة...'
                          : 'Processing...'
                        : mode === 'login'
                        ? t.auth.submitLogin
                        : mode === 'register'
                        ? t.auth.submitRegister
                        : mode === 'forgot'
                        ? forgotStep === 'request'
                          ? t.auth.submitResetRequest
                          : t.auth.submitNewPassword
                        : t.auth.adminSetupBtn}
                    </span>
                  </button>

                  {mode === 'forgot' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setForgotStep(forgotStep === 'request' ? 'verify' : 'request');
                          setError(null);
                          setPendingNotice(null);
                        }}
                        className="font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        {forgotStep === 'request' ? t.auth.haveResetCode : t.auth.needResetCode}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setForgotStep('request');
                          setError(null);
                          setPendingNotice(null);
                        }}
                        className="font-medium text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
                      >
                        {t.auth.backToLogin}
                      </button>
                    </div>
                  )}
                </form>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {t.auth.pendingNotice}
                </p>
                {!adminConfigured && mode !== 'admin-claim' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('admin-claim');
                      setError(null);
                      setPendingNotice(null);
                    }}
                    className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    {t.auth.adminSetupBtn}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Below-the-fold Curriculum Overview */}
        <section
          id="method"
          className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-14"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {isAr ? 'مسار تعلّم منظم من 5 خطوات' : 'A 5-Step Contextual Learning Loop'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
              {isAr
                ? 'صُمّم المنهج ليتناسب مع جلسات قصيرة من 5 إلى 15 دقيقة يوميًا من الهاتف أو الحاسوب.'
                : 'Built for focused 5–15 minute daily sessions across mobile and desktop.'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              {[
                {
                  num: '01',
                  title: isAr ? 'اقرأ القصة' : 'Read Stories',
                  desc: isAr
                    ? 'قصص مشوّقة من 100 كلمة مع تمييز 15 كلمة مستهدفة باللون الأحمر العريض.'
                    : 'Engaging 100-word stories highlighting 15 target words in bold red.',
                },
                {
                  num: '02',
                  title: isAr ? 'افهم باللمس' : 'Tap & Listen',
                  desc: isAr
                    ? 'ورقة سفلية فورية بالترجمة ونوع الكلمة والنطق الأمريكي أو البريطاني.'
                    : 'Bottom sheet translation, part of speech, and US/UK audio.',
                },
                {
                  num: '03',
                  title: isAr ? 'راجع بالبطاقات' : 'Flashcard Review',
                  desc: isAr
                    ? 'بطاقات تفاعلية بالصور وثلاث جمل تطبيقية تغذي التكرار المتباعد.'
                    : 'Illustrated flashcards with 3 sentences feeding spaced repetition.',
                },
                {
                  num: '04',
                  title: isAr ? 'اختبر تذكّرك' : 'Quick Quizzes',
                  desc: isAr
                    ? 'اختيار من متعدد أو كتابة في الفراغ مع مرونة للأخطاء الإملائية البسيطة.'
                    : 'Multiple choice or fill-in-the-blank with gentle typo coaching.',
                },
                {
                  num: '05',
                  title: isAr ? 'اكتب وصحّح' : 'AI Writing Lab',
                  desc: isAr
                    ? 'كتابة حرة بموضوعات متجددة وتصحيح فوري وشرح قواعدي مبسّط بالعربية.'
                    : 'Level-matched prompts with AI corrections and Arabic explanations.',
                },
              ].map((step) => (
                <div
                  key={step.num}
                  className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60"
                >
                  <span className="text-xs font-mono-nums font-semibold text-blue-700 dark:text-blue-400">
                    {step.num}
                  </span>
                  <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="levels" className="py-14 max-w-7xl mx-auto px-4 sm:px-6">
          <div id="features" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {(['A1', 'A2', 'B1', 'B2'] as CEFRLevel[]).map((lvl) => (
              <div
                key={lvl}
                className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              >
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-2xl font-bold font-display text-blue-700 dark:text-blue-400">
                    {lvl}
                  </span>
                  <span className="text-xs font-mono-nums text-slate-500 dark:text-slate-400">
                    50 {isAr ? 'قصة' : 'stories'} · 750 {isAr ? 'كلمة' : 'words'}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t.levels[lvl]}
                </p>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {lvl === 'A1' &&
                    (isAr
                      ? 'جمل قصيرة ومواقف الحياة اليومية الأساسية للمبتدئين.'
                      : 'Short sentences and essential everyday life scenes.')}
                  {lvl === 'A2' &&
                    (isAr
                      ? 'قصص السفر والمحادثات الاجتماعية وتوسيع التراكيب.'
                      : 'Travel situations, social moments, and richer phrasing.')}
                  {lvl === 'B1' &&
                    (isAr
                      ? 'موضوعات العمل والإبداع والتحديات الشخصية بربط متماسك.'
                      : 'Work, creativity, and problem-solving narratives.')}
                  {lvl === 'B2' &&
                    (isAr
                      ? 'نصوص فكرية متقدمة ومفردات دقيقة للكتابة والحوار الاحترافي.'
                      : 'Nuanced ideas and precise vocabulary for fluent expression.')}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 px-4 sm:px-6 text-center text-xs text-slate-500 dark:text-slate-400">
        {t.brand} · {t.tagline}
      </footer>
    </div>
  );
};
