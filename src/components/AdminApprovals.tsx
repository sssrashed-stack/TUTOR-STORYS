import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  KeyRound,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  UserX,
} from 'lucide-react';
import type {
  CEFRLevel,
  PartOfSpeech,
  PasswordResetRequestPublic,
  UILanguage,
  UserPermissions,
  UserPublic,
  UserRole,
  UserStatus,
  VocabWord,
} from '../types.ts';

interface AdminApprovalsProps {
  lang: UILanguage;
  authToken: string;
  onWordsImported: (words: VocabWord[]) => void;
}

export const AdminApprovals: React.FC<AdminApprovalsProps> = ({
  lang,
  authToken,
  onWordsImported,
}) => {
  const isAr = lang === 'ar';
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequestPublic[]>([]);
  const [issuedCodes, setIssuedCodes] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Excel import preview state
  const [parsedWords, setParsedWords] = useState<VocabWord[]>([]);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const [usersRes, resetsRes] = await Promise.all([
        fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        fetch('/api/admin/password-resets', {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
      ]);
      const usersData = await usersRes.json();
      if (usersRes.ok && Array.isArray(usersData.users)) {
        setUsers(usersData.users);
      }
      const resetsData = await resetsRes.json();
      if (resetsRes.ok && Array.isArray(resetsData.requests)) {
        setResetRequests(resetsData.requests);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [authToken]);

  const handleIssueResetCode = async (requestId: string) => {
    setStatusMsg(null);
    try {
      const res = await fetch(
        `/api/admin/password-resets/${encodeURIComponent(requestId)}/issue-code`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      const data = await res.json();
      if (res.ok && data.request && data.code) {
        setResetRequests((prev) =>
          prev.map((r) => (r.id === requestId ? data.request : r))
        );
        setIssuedCodes((prev) => ({ ...prev, [requestId]: data.code }));
        setStatusMsg(
          isAr
            ? 'تم إصدار رمز استعادة مؤقت (صالح لمدة 30 دقيقة). أرسله للعضو الآن.'
            : 'Single-use recovery code issued (valid for 30 minutes).'
        );
      } else {
        setStatusMsg(
          data.error || (isAr ? 'تعذر إصدار رمز الاستعادة.' : 'Could not issue recovery code.')
        );
      }
    } catch {
      setStatusMsg(isAr ? 'تعذر الاتصال بالخادم.' : 'Network error.');
    }
  };

  const handleDismissReset = async (requestId: string) => {
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/admin/password-resets/${encodeURIComponent(requestId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        setResetRequests((prev) => prev.filter((r) => r.id !== requestId));
        setIssuedCodes((prev) => {
          const next = { ...prev };
          delete next[requestId];
          return next;
        });
      }
    } catch {
      setStatusMsg(isAr ? 'تعذر الاتصال بالخادم.' : 'Network error.');
    }
  };

  const handleCopyCode = async (requestId: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(requestId);
      window.setTimeout(() => setCopiedId((cur) => (cur === requestId ? null : cur)), 2000);
    } catch {
      // Clipboard blocked in restricted context; code remains selectable on screen
    }
  };

  const updateMember = async (
    id: string,
    payload: {
      status?: UserStatus;
      role?: UserRole;
      permissions?: UserPermissions;
      level?: CEFRLevel;
    }
  ) => {
    setStatusMsg(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.user) {
      setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
      setStatusMsg(isAr ? 'تم تحديث الصلاحيات والحالة بنجاح.' : 'Member permissions updated.');
    }
  };

  const handleDownloadSampleExcel = () => {
    const sampleRows = [
      {
        Word: 'horizon',
        'Translation (AR)': 'أفق',
        Level: 'B1',
        'Part of Speech': 'noun',
        'Story / Group': 'Travel & Discovery',
      },
      {
        Word: 'eloquent',
        'Translation (AR)': 'بليغ / فصيح',
        Level: 'B2',
        'Part of Speech': 'adjective',
        'Story / Group': 'Communication',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vocabulary');
    XLSX.writeFile(wb, 'tutor_story_vocabulary_template.xlsx');
  };

  const handleExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportSummary(null);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);

    const seen = new Set<string>();
    const clean: VocabWord[] = [];

    for (const r of rows) {
      const rawWord = String(r['Word'] ?? r['word'] ?? '').trim().toLowerCase();
      const rawAr = String(r['Translation (AR)'] ?? r['Translation'] ?? r['translation'] ?? '').trim();
      const rawLevel = String(r['Level'] ?? r['level'] ?? 'A1').trim().toUpperCase();
      const rawPos = String(r['Part of Speech'] ?? r['partOfSpeech'] ?? 'noun').trim().toLowerCase();
      const rawGroup = String(r['Story / Group'] ?? r['Group'] ?? '').trim();

      if (!rawWord || !rawAr || seen.has(rawWord)) continue;
      seen.add(rawWord);

      const lvl: CEFRLevel = ['A1', 'A2', 'B1', 'B2'].includes(rawLevel)
        ? (rawLevel as CEFRLevel)
        : 'A1';
      const pos: PartOfSpeech = ['noun', 'verb', 'adjective', 'adverb'].includes(rawPos)
        ? (rawPos as PartOfSpeech)
        : 'noun';

      clean.push({
        id: `custom-${rawWord.replace(/[^a-z0-9]/g, '-')}`,
        word: rawWord,
        translationAr: rawAr,
        level: lvl,
        partOfSpeech: pos,
        phonetic: '',
        category: 'daily',
        storyGroup: rawGroup || undefined,
        sentences: [
          `We practiced "${rawWord}" in context today.`,
          `Try writing a short sentence using "${rawWord}".`,
          `Review "${rawWord}" again to strengthen recall.`,
        ],
        isCustom: true,
      });
    }

    setParsedWords(clean);
    setImportSummary(
      isAr
        ? `تمت قراءة ${clean.length} كلمة صالحة بعد إزالة المكرر.`
        : `Validated ${clean.length} unique words ready to import.`
    );
  };

  const handleConfirmImport = async () => {
    if (!parsedWords.length) return;
    setImporting(true);
    try {
      const res = await fetch('/api/admin/import-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ words: parsedWords }),
      });
      const data = await res.json();
      if (res.ok) {
        onWordsImported(data.customWords || []);
        setParsedWords([]);
        setImportSummary(
          isAr
            ? `تم استيراد ${data.inserted} كلمة جديدة (وتخطي ${data.skipped} مكررة).`
            : `Imported ${data.inserted} new words (${data.skipped} duplicates skipped).`
        );
      }
    } finally {
      setImporting(false);
    }
  };

  const pendingUsers = users.filter((u) => u.status === 'pending');
  const otherUsers = users.filter((u) => u.status !== 'pending');

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-6 h-6 text-blue-700 dark:text-blue-400" />
          <h2 className="text-xl font-bold">
            {isAr ? 'صفحة الموافقات والصلاحيات' : 'Approvals & Member Permissions'}
          </h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {isAr
            ? 'اعتماد الأعضاء الجدد قبل السماح لهم بدخول المنصة، وإدارة صلاحيات القراءة والذكاء الاصطناعي والمفردات.'
            : 'Approve new member requests before portal access and configure granular permissions.'}
        </p>
        {statusMsg && (
          <p className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            {statusMsg}
          </p>
        )}
      </div>

      {/* Pending Approvals Queue */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-base font-bold">
          {isAr ? `طلبات الانضمام الجديدة (${pendingUsers.length})` : `Pending Requests (${pendingUsers.length})`}
        </h3>

        {loading ? (
          <p className="text-sm text-slate-500">{isAr ? 'جاري التحميل...' : 'Loading...'}</p>
        ) : pendingUsers.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isAr ? 'لا توجد طلبات بانتظار الموافقة حاليًا.' : 'No pending membership requests.'}
          </p>
        ) : (
          <div className="space-y-3">
            {pendingUsers.map((u) => (
              <div
                key={u.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-4"
              >
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{u.fullName}</p>
                  <p dir="ltr" className="text-xs text-slate-500 font-mono-nums">
                    @{u.username} · {u.email} · {u.level}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateMember(u.id, { status: 'approved' })}
                    className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>{isAr ? 'موافقة' : 'Approve'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateMember(u.id, { status: 'rejected' })}
                    className="min-h-[44px] px-4 rounded-xl border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserX className="w-4 h-4" />
                    <span>{isAr ? 'رفض' : 'Reject'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Password Reset Requests Queue */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-blue-700 dark:text-blue-400" />
          <h3 className="text-base font-bold">
            {isAr
              ? `طلبات استعادة كلمة المرور (${resetRequests.length})`
              : `Password Reset Requests (${resetRequests.length})`}
          </h3>
        </div>

        {resetRequests.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isAr
              ? 'لا توجد طلبات استعادة كلمة مرور حاليًا.'
              : 'No pending password reset requests.'}
          </p>
        ) : (
          <div className="space-y-3">
            {resetRequests.map((reqItem) => {
              const code = issuedCodes[reqItem.id];
              return (
                <div
                  key={reqItem.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {reqItem.fullName}
                      </p>
                      <p dir="ltr" className="text-xs text-slate-500 font-mono-nums">
                        @{reqItem.username} · {reqItem.email}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {reqItem.status === 'code_issued'
                          ? isAr
                            ? 'تم إصدار رمز مؤقت (صالح 30 دقيقة)'
                            : 'Temporary code issued (30 min TTL)'
                          : isAr
                          ? 'بانتظار إصدار رمز الاستعادة'
                          : 'Awaiting recovery code'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleIssueResetCode(reqItem.id)}
                        className="min-h-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <KeyRound className="w-4 h-4" />
                        <span>
                          {reqItem.status === 'code_issued'
                            ? isAr
                              ? 'إصدار رمز جديد'
                              : 'Re-issue Code'
                            : isAr
                            ? 'إصدار رمز استعادة'
                            : 'Issue Reset Code'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDismissReset(reqItem.id)}
                        aria-label={isAr ? 'حذف الطلب' : 'Dismiss request'}
                        className="min-h-[44px] px-3 rounded-xl border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{isAr ? 'حذف' : 'Dismiss'}</span>
                      </button>
                    </div>
                  </div>

                  {code && (
                    <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
                          {isAr
                            ? 'رمز الاستعادة المؤقت (يظهر مرة واحدة — أرسله للعضو):'
                            : 'One-time recovery code (share securely with member):'}
                        </p>
                        <p
                          dir="ltr"
                          className="text-base font-bold font-mono-nums tracking-widest text-slate-900 dark:text-white select-all mt-0.5"
                        >
                          {code}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyCode(reqItem.id, code)}
                        className="min-h-[40px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>
                          {copiedId === reqItem.id
                            ? isAr
                              ? 'تم النسخ'
                              : 'Copied'
                            : isAr
                            ? 'نسخ الرمز'
                            : 'Copy Code'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Active & Managed Members Permissions Table */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-base font-bold">
          {isAr ? `الأعضاء والصلاحيات (${otherUsers.length})` : `Members & Permissions (${otherUsers.length})`}
        </h3>

        {otherUsers.length === 0 ? (
          <p className="text-sm text-slate-500">
            {isAr ? 'لا يوجد أعضاء معتمدون بعد.' : 'No managed members yet.'}
          </p>
        ) : (
          <div className="space-y-3">
            {otherUsers.map((u) => (
              <div
                key={u.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm text-slate-900 dark:text-white">
                      {u.fullName}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        ({u.status === 'approved' ? (isAr ? 'مفعل' : 'Approved') : u.status})
                      </span>
                    </p>
                    <p dir="ltr" className="text-xs text-slate-500 font-mono-nums">
                      @{u.username} · {u.email}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={u.role}
                      onChange={(e) =>
                        updateMember(u.id, { role: e.target.value as UserRole })
                      }
                      className="min-h-[40px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                    >
                      <option value="member">{isAr ? 'عضو' : 'Member'}</option>
                      <option value="moderator">{isAr ? 'مشرف' : 'Moderator'}</option>
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        updateMember(u.id, {
                          status: u.status === 'approved' ? 'suspended' : 'approved',
                        })
                      }
                      className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold border cursor-pointer ${
                        u.status === 'approved'
                          ? 'border-amber-300 text-amber-800 dark:text-amber-300'
                          : 'border-emerald-300 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {u.status === 'approved'
                        ? isAr
                          ? 'إيقاف مؤقت'
                          : 'Suspend'
                        : isAr
                        ? 'تفعيل'
                        : 'Activate'}
                    </button>
                  </div>
                </div>

                {/* Granular Permissions */}
                <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                  {(
                    [
                      ['canReadStories', isAr ? 'قراءة القصص' : 'Read Stories'],
                      ['canUseAI', isAr ? 'الذكاء الاصطناعي' : 'AI Features'],
                      ['canManageWords', isAr ? 'إدارة كلمات Excel' : 'Manage Excel Words'],
                      ['canApproveUsers', isAr ? 'اعتماد الأعضاء' : 'Approve Members'],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="inline-flex items-center gap-2 min-h-[36px] px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={u.permissions[key]}
                        onChange={(e) =>
                          updateMember(u.id, {
                            permissions: {
                              ...u.permissions,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Excel Vocabulary Import Section */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
            <h3 className="text-base font-bold">
              {isAr ? 'استيراد مفردات من ملف Excel' : 'Import Vocabulary from Excel'}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleDownloadSampleExcel}
            className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{isAr ? 'تحميل نموذج Excel' : 'Download Sample .xlsx'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          {isAr
            ? 'الأعمدة المدعومة: Word, Translation (AR), Level (A1-B2), Part of Speech, Story / Group. يتم التحقق وإزالة المكرر تلقائيًا.'
            : 'Supported columns: Word, Translation (AR), Level (A1-B2), Part of Speech, Story / Group. Auto-validated and deduplicated.'}
        </p>

        <label className="min-h-[56px] px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-600 flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer">
          <Upload className="w-4 h-4" />
          <span>{isAr ? 'اختر ملف Excel (.xlsx / .csv)' : 'Choose Excel File (.xlsx / .csv)'}</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleExcelFile}
            className="hidden"
          />
        </label>

        {importSummary && (
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">{importSummary}</p>
        )}

        {parsedWords.length > 0 && (
          <div className="space-y-3">
            <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-2.5 text-start">Word</th>
                    <th className="p-2.5 text-start">Translation (AR)</th>
                    <th className="p-2.5 text-start">Level</th>
                    <th className="p-2.5 text-start">POS</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedWords.slice(0, 20).map((w) => (
                    <tr key={w.id} className="border-b border-slate-100 dark:border-slate-800/60">
                      <td dir="ltr" className="p-2.5 font-bold text-left">{w.word}</td>
                      <td className="p-2.5">{w.translationAr}</td>
                      <td className="p-2.5">{w.level}</td>
                      <td className="p-2.5">{w.partOfSpeech}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              disabled={importing}
              onClick={handleConfirmImport}
              className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>
                {importing
                  ? isAr
                    ? 'جاري الاستيراد...'
                    : 'Importing...'
                  : isAr
                  ? `تأكيد استيراد ${parsedWords.length} كلمة`
                  : `Confirm Import (${parsedWords.length})`}
              </span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
