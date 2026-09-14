import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { Badge, Button, Card, Spinner } from './ui';
import { useState } from 'react';

interface AtRiskStudent {
  studentId: string;
  name: string;
  email: string;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  classTitles: string[];
  reasons: ('low_attendance' | 'missing_assignments' | 'low_quiz_scores')[];
  attendanceRate: number | null;
  attendancePresent?: number;
  attendanceSessions?: number;
  missingAssignments: number;
  missingAssignmentTitles?: string[];
  quizAveragePct: number | null;
  quizAttemptCount?: number;
  whatsappUrl: string | null;
}

const reasonLabel: Record<string, string> = {
  low_attendance: 'Low attendance',
  missing_assignments: 'Missing work',
  low_quiz_scores: 'Low quiz scores',
};

function buildInterventionReason(s: AtRiskStudent) {
  const classes = s.classTitles.length ? s.classTitles.join(', ') : 'their enrolled classes';
  const parts: string[] = [
    `${s.name} was flagged as at-risk in the last 30 days for ${classes}.`,
  ];

  for (const r of s.reasons) {
    if (r === 'low_attendance') {
      const rate = s.attendanceRate != null ? `${s.attendanceRate}%` : 'below 70%';
      const detail =
        s.attendanceSessions != null && s.attendancePresent != null
          ? ` Present/late in ${s.attendancePresent} of ${s.attendanceSessions} recorded sessions.`
          : '';
      parts.push(
        `Low attendance: attendance rate is ${rate} (threshold under 70%).${detail}`
      );
    }
    if (r === 'missing_assignments') {
      const titles = (s.missingAssignmentTitles ?? []).filter(Boolean);
      const titleText =
        titles.length > 0
          ? ` Overdue without submission: ${titles.join('; ')}${
              s.missingAssignments > titles.length
                ? ` (+${s.missingAssignments - titles.length} more)`
                : ''
            }.`
          : '';
      parts.push(
        `Missing work: ${s.missingAssignments} overdue assessment(s) have no submission (flagged when 2 or more are missing).${titleText}`
      );
    }
    if (r === 'low_quiz_scores') {
      const avg = s.quizAveragePct != null ? `${s.quizAveragePct}%` : 'under 50%';
      const attempts =
        s.quizAttemptCount != null && s.quizAttemptCount > 0
          ? ` across ${s.quizAttemptCount} submitted quiz attempt(s)`
          : '';
      parts.push(
        `Low quiz scores: average score is ${avg}${attempts} (threshold under 50%).`
      );
    }
  }

  parts.push('Follow up with the student/guardian and record the action taken below.');
  return parts.join('\n\n');
}

export function AtRiskPanel({ compact = false }: { compact?: boolean }) {
  const { slug } = useParams<{ slug: string }>();
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const query = useQuery({
    queryKey: ['at-risk', t.slug],
    queryFn: async () =>
      (await t.get<{ students: AtRiskStudent[] }>('/smart/at-risk')).data.students,
  });

  const nudgeMutation = useMutation({
    mutationFn: async (studentId: string) =>
      (await t.post<{ emailed: string; whatsappUrl: string | null }>(`/smart/at-risk/${studentId}/nudge`)).data,
    onSuccess: (data) => {
      setErr('');
      setMsg(`Nudge emailed to ${data.emailed}`);
      queryClient.invalidateQueries({ queryKey: ['at-risk', t.slug] });
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  const parentLinkMutation = useMutation({
    mutationFn: async (studentId: string) =>
      (await t.post<{ sent: boolean; to: string }>(`/parent-trust/send-link/${studentId}`)).data,
    onSuccess: (data) => {
      setErr('');
      setMsg(`Parent report link sent to ${data.to}`);
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  const students = query.data ?? [];

  function riskLevel(s: AtRiskStudent): { label: string; tone: 'red' | 'amber' | 'green'; score: number } {
    const score = s.reasons.length * 28 + (s.quizAveragePct != null && s.quizAveragePct < 40 ? 15 : 0);
    if (score >= 70 || s.reasons.length >= 3) return { label: 'High', tone: 'red', score: Math.min(99, score) };
    if (score >= 40 || s.reasons.length === 2) return { label: 'Medium', tone: 'amber', score: Math.min(85, Math.max(40, score)) };
    return { label: 'Low', tone: 'green', score: Math.max(25, score) };
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">At-risk students</h2>
          <p className="text-sm text-slate-400">Low attendance, missing work, or weak quiz scores (30 days)</p>
        </div>
        <Badge tone={students.length ? 'amber' : 'green'}>
          {query.isLoading ? '…' : `${students.length} flagged`}
        </Badge>
      </div>

      {query.isLoading ? (
        <Spinner />
      ) : !students.length ? (
        <p className="text-sm text-slate-500">No students currently flagged. Nice work.</p>
      ) : (
        <ul
          className={`divide-y divide-slate-100 overflow-y-auto overscroll-contain dark:divide-white/5 ${
            compact ? 'max-h-[30rem] pr-1' : 'max-h-[36rem] pr-1'
          }`}
        >
          {students.map((s) => {
            const risk = riskLevel(s);
            const initials = s.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? '')
              .join('');
            return (
              <li key={s.studentId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                    {initials || '?'}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{s.name}</p>
                    <p className="truncate text-xs text-slate-400">{s.classTitles.join(' · ')}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.reasons.map((r) => (
                        <Badge key={r} tone="amber">
                          {reasonLabel[r]}
                          {r === 'low_attendance' && s.attendanceRate != null ? ` ${s.attendanceRate}%` : ''}
                          {r === 'missing_assignments' ? ` (${s.missingAssignments})` : ''}
                          {r === 'low_quiz_scores' && s.quizAveragePct != null ? ` ${s.quizAveragePct}%` : ''}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Risk</p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          risk.tone === 'red' ? 'bg-red-500' : risk.tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                      />
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{risk.score}</span>
                      <Badge tone={risk.tone}>{risk.label}</Badge>
                    </div>
                  </div>
                  <Link
                    to={`/${slug}/interventions?${new URLSearchParams({
                      open: '1',
                      studentId: s.studentId,
                      studentName: s.name,
                      reason: buildInterventionReason(s),
                    }).toString()}`}
                    className="rounded-full border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-900/30"
                  >
                    Intervene
                  </Link>
                  {s.whatsappUrl && (
                    <a
                      href={s.whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                    >
                      WhatsApp
                    </a>
                  )}
                  <Button
                    variant="outlineBrand"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={nudgeMutation.isPending}
                    onClick={() => nudgeMutation.mutate(s.studentId)}
                  >
                    Email nudge
                  </Button>
                  {s.guardianEmail && (
                    <Button
                      variant="secondary"
                      className="!px-3 !py-1.5 !text-xs"
                      disabled={parentLinkMutation.isPending}
                      onClick={() => parentLinkMutation.mutate(s.studentId)}
                    >
                      Parent report
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/5">
        <Link
          to={`/${slug}/interventions`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
        >
          View at-risk report
          <span aria-hidden>→</span>
        </Link>
      </div>

      {msg && <p className="mt-3 text-sm text-emerald-600">{msg}</p>}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </Card>
  );
}
