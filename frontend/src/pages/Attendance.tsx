import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { Badge, Button, Card, Select, Spinner } from '../components/ui';
import { Icon } from '../components/icons';
import { EmptyState, PageHeader } from '../components/tenant/TenantUi';

type Status = 'present' | 'absent' | 'late' | 'excused';

const statusTone: Record<Status, 'green' | 'red' | 'amber' | 'blue'> = {
  present: 'green',
  absent: 'red',
  late: 'amber',
  excused: 'blue',
};

export default function Attendance() {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const classesQuery = useQuery({
    queryKey: ['attendance-classes', t.slug],
    queryFn: async () =>
      (await t.get<{ classes: { id: string; title: string }[] }>('/attendance/classes')).data.classes,
  });

  const sessionQuery = useQuery({
    queryKey: ['attendance-session', t.slug, classId, date],
    enabled: Boolean(classId),
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
    queryKey: ['attendance-summary', t.slug, classId],
    enabled: Boolean(classId),
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
    if (!sessionQuery.data) return;
    const next: Record<string, Status> = {};
    for (const row of sessionQuery.data.roster) {
      next[row.studentId] = row.status ?? 'present';
    }
    setMarks(next);
  }, [sessionQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const records = Object.entries(marks).map(([studentId, status]) => ({ studentId, status }));
      return (
        await t.post(`/classes/${classId}/attendance`, {
          sessionDate: date,
          records,
        })
      ).data;
    },
    onSuccess: () => {
      setError('');
      setSuccess('Attendance saved.');
      queryClient.invalidateQueries({ queryKey: ['attendance-session', t.slug, classId, date] });
      queryClient.invalidateQueries({ queryKey: ['attendance-summary', t.slug, classId] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function markAll(status: Status) {
    const next: Record<string, Status> = {};
    for (const id of Object.keys(marks)) next[id] = status;
    setMarks(next);
  }

  function exportCsv() {
    if (!summaryQuery.data?.length) return;
    const header = 'Name,Present,Absent,Late,Excused,Total\n';
    const body = summaryQuery.data
      .map((r) => `"${r.name}",${r.present},${r.absent},${r.late},${r.excused},${r.total}`)
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${classId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const roster = sessionQuery.data?.roster ?? [];
  const presentCount = Object.values(marks).filter((s) => s === 'present').length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="note"
        tone="amber"
        title="Attendance"
        subtitle="Across your classes — mark present, absent, late, or excused for each session"
      />

      <Card className="rounded-2xl">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Class"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSuccess('');
            }}
          >
            <option value="">Select class</option>
            {classesQuery.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Session date</span>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
      </Card>

      {!classId ? (
        <EmptyState message="Select a class to mark attendance." />
      ) : sessionQuery.isLoading ? (
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
                  <li key={row.studentId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                        {row.name.split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')}
                      </span>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-100">{row.name}</p>
                        <p className="text-xs text-slate-400">{row.email}</p>
                      </div>
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

      {classId && summaryQuery.data && summaryQuery.data.length > 0 && (
        <Card className="overflow-hidden rounded-2xl p-0">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-white/5 dark:bg-white/5">
            <div className="flex items-center gap-2">
              <Icon name="chart" width={18} height={18} className="text-brand-600" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Summary</h2>
            </div>
            <Button variant="secondary" onClick={exportCsv}>
              Export CSV
            </Button>
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
