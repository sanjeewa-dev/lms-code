import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../../hooks/useTenantApi';
import { apiErrorMessage } from '../../api/client';
import { Badge, Button, Card, Spinner } from '../ui';
import { EmptyState } from '../tenant/TenantUi';

type Status = 'present' | 'absent' | 'late' | 'excused';

const statusTone: Record<Status, 'green' | 'red' | 'amber' | 'blue'> = {
  present: 'green',
  absent: 'red',
  late: 'amber',
  excused: 'blue',
};

/** Class-scoped attendance (staff). Reuses the same APIs as the tenant Attendance page. */
export function ClassAttendanceTab({ classId }: { classId: string }) {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const sessionQuery = useQuery({
    queryKey: ['class-attendance-session', t.slug, classId, date],
    queryFn: async () =>
      (
        await t.get<{
          sessionDate: string;
          roster: {
            studentId: string;
            name: string;
            email: string;
            status: Status | null;
            note: string | null;
          }[];
        }>(`/classes/${classId}/attendance?date=${date}`)
      ).data,
  });

  const summaryQuery = useQuery({
    queryKey: ['class-attendance-summary', t.slug, classId],
    queryFn: async () =>
      (
        await t.get<{
          summary: {
            studentId: string;
            name: string;
            present: number;
            absent: number;
            late: number;
            excused: number;
            total: number;
          }[];
        }>(`/classes/${classId}/attendance/summary`)
      ).data.summary,
  });

  useEffect(() => {
    const roster = sessionQuery.data?.roster ?? [];
    const next: Record<string, Status> = {};
    for (const row of roster) {
      next[row.studentId] = row.status ?? 'present';
    }
    setMarks(next);
  }, [sessionQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const records = Object.entries(marks).map(([studentId, status]) => ({
        studentId,
        status,
      }));
      return (
        await t.post(`/classes/${classId}/attendance`, {
          sessionDate: date,
          records,
        })
      ).data;
    },
    onSuccess: async () => {
      setError('');
      setSuccess('Attendance saved.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['class-attendance-session', t.slug, classId] }),
        queryClient.invalidateQueries({ queryKey: ['class-attendance-summary', t.slug, classId] }),
        queryClient.invalidateQueries({ queryKey: ['attendance-session', t.slug, classId] }),
      ]);
    },
    onError: (e) => {
      setSuccess('');
      setError(apiErrorMessage(e));
    },
  });

  function markAll(status: Status) {
    setMarks((m) => {
      const next = { ...m };
      for (const id of Object.keys(next)) next[id] = status;
      return next;
    });
  }

  const roster = sessionQuery.data?.roster ?? [];
  const presentCount = Object.values(marks).filter((s) => s === 'present').length;

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <label className="block max-w-xs">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Session date
          </span>
          <input
            type="date"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSuccess('');
            }}
          />
        </label>
      </Card>

      {sessionQuery.isLoading ? (
        <Spinner />
      ) : (
        <Card className="overflow-hidden rounded-2xl p-0">
          <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-white/5 dark:bg-white/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Session roster</h2>
                <p className="text-sm text-slate-500">
                  {roster.length} students · {presentCount} marked present
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => markAll('present')}>
                  All present
                </Button>
                <Button variant="secondary" onClick={() => markAll('absent')}>
                  All absent
                </Button>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving...' : 'Save attendance'}
                </Button>
              </div>
            </div>
          </div>

          {roster.length === 0 ? (
            <EmptyState message="No active students in this class." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {roster.map((row) => {
                const status = marks[row.studentId] ?? 'present';
                return (
                  <li
                    key={row.studentId}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{row.name}</p>
                      <p className="text-xs text-slate-400">{row.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone[status]}>{status}</Badge>
                      <select
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                        value={status}
                        onChange={(e) =>
                          setMarks((m) => ({ ...m, [row.studentId]: e.target.value as Status }))
                        }
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                        <option value="excused">Excused</option>
                      </select>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {error && <p className="px-5 pb-4 text-sm text-red-600">{error}</p>}
          {success && <p className="px-5 pb-4 text-sm text-emerald-600">{success}</p>}
        </Card>
      )}

      {summaryQuery.data && summaryQuery.data.length > 0 && (
        <Card className="overflow-hidden rounded-2xl p-0">
          <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-white/5 dark:bg-white/5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Summary</h2>
          </div>
          <div className="overflow-x-auto p-5">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase text-slate-400 dark:border-white/5">
                <tr>
                  <th className="pb-2">Student</th>
                  <th className="pb-2">Present</th>
                  <th className="pb-2">Absent</th>
                  <th className="pb-2">Late</th>
                  <th className="pb-2">Excused</th>
                  <th className="pb-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                {summaryQuery.data.map((r) => (
                  <tr key={r.studentId}>
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2">{r.present}</td>
                    <td className="py-2">{r.absent}</td>
                    <td className="py-2">{r.late}</td>
                    <td className="py-2">{r.excused}</td>
                    <td className="py-2">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
