import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  missingAssignments: number;
  quizAveragePct: number | null;
  whatsappUrl: string | null;
}

const reasonLabel: Record<string, string> = {
  low_attendance: 'Low attendance',
  missing_assignments: 'Missing work',
  low_quiz_scores: 'Low quiz scores',
};

export function AtRiskPanel() {
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

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">At-risk students</h2>
          <p className="text-sm text-slate-400">Low attendance, missing work, or weak quiz scores (30 days)</p>
        </div>
        <Badge tone={query.data?.length ? 'amber' : 'green'}>
          {query.isLoading ? '…' : `${query.data?.length ?? 0} flagged`}
        </Badge>
      </div>

      {query.isLoading ? (
        <Spinner />
      ) : !query.data?.length ? (
        <p className="text-sm text-slate-500">No students currently flagged. Nice work.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {query.data.slice(0, 8).map((s) => (
            <li key={s.studentId} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-800 dark:text-slate-100">{s.name}</p>
                <p className="text-xs text-slate-400">{s.classTitles.join(' · ')}</p>
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
              <div className="flex flex-wrap gap-2">
                {s.whatsappUrl && (
                  <a
                    href={s.whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200"
                  >
                    WhatsApp
                  </a>
                )}
                <Button
                  variant="secondary"
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
          ))}
        </ul>
      )}

      {msg && <p className="mt-2 text-sm text-emerald-600">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </Card>
  );
}
