import { useQuery } from '@tanstack/react-query';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Card, Spinner } from '../ui';
import { useAuth } from '../../context/AuthContext';

export function GradebookTab({ classId }: { classId: string }) {
  const t = useTenantApi();
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  const staffQuery = useQuery({
    queryKey: ['gradebook', t.slug, classId],
    enabled: isStaff,
    queryFn: async () =>
      (
        await t.get<{
          assessments: { id: string; title: string; maxMarks: number | null }[];
          quizzes: { id: string; title: string; totalMarks: number }[];
          rows: {
            student: { id: string; name: string; email: string };
            assignments: { assessmentId: string; grade: number | null; maxMarks: number | null }[];
            quizzes: { quizId: string; score: number | null; totalMarks: number }[];
            percent: number | null;
          }[];
        }>(`/classes/${classId}/gradebook`)
      ).data,
  });

  const mineQuery = useQuery({
    queryKey: ['gradebook-mine', t.slug, classId],
    enabled: !isStaff,
    queryFn: async () =>
      (
        await t.get<{
          assignments: {
            id: string;
            title: string;
            maxMarks: number | null;
            grade: number | null;
            feedback: string | null;
          }[];
          quizzes: { id: string; title: string; totalMarks: number; score: number | null }[];
        }>(`/classes/${classId}/gradebook/mine`)
      ).data,
  });

  function exportCsv() {
    const data = staffQuery.data;
    if (!data) return;
    const headers = [
      'Student',
      'Email',
      ...data.assessments.map((a) => a.title),
      ...data.quizzes.map((q) => q.title),
      'Percent',
    ];
    const lines = data.rows.map((row) => {
      const cells = [
        `"${row.student.name}"`,
        row.student.email,
        ...row.assignments.map((a) => (a.grade != null ? String(a.grade) : '')),
        ...row.quizzes.map((q) => (q.score != null ? String(q.score) : '')),
        row.percent != null ? String(row.percent) : '',
      ];
      return cells.join(',');
    });
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gradebook-${classId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isStaff) {
    if (staffQuery.isLoading) return <Spinner />;
    const data = staffQuery.data;
    if (!data) return <p className="text-sm text-slate-500">Unable to load gradebook.</p>;

    return (
      <Card>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Gradebook</h3>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-white/10"
          >
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase text-slate-400 dark:border-white/5">
              <tr>
                <th className="pb-2 pr-3">Student</th>
                {data.assessments.map((a) => (
                  <th key={a.id} className="pb-2 pr-3">
                    {a.title}
                    {a.maxMarks != null ? ` /${a.maxMarks}` : ''}
                  </th>
                ))}
                {data.quizzes.map((q) => (
                  <th key={q.id} className="pb-2 pr-3">
                    {q.title} /{q.totalMarks}
                  </th>
                ))}
                <th className="pb-2">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/5">
              {data.rows.map((row) => (
                <tr key={row.student.id}>
                  <td className="py-2 pr-3 font-medium">{row.student.name}</td>
                  {row.assignments.map((a) => (
                    <td key={a.assessmentId} className="py-2 pr-3">
                      {a.grade != null ? a.grade : '—'}
                    </td>
                  ))}
                  {row.quizzes.map((q) => (
                    <td key={q.quizId} className="py-2 pr-3">
                      {q.score != null ? q.score : '—'}
                    </td>
                  ))}
                  <td className="py-2">{row.percent != null ? `${row.percent}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length === 0 && (
            <p className="py-4 text-sm text-slate-500">No active students yet.</p>
          )}
        </div>
      </Card>
    );
  }

  if (mineQuery.isLoading) return <Spinner />;
  const mine = mineQuery.data;
  if (!mine) return <p className="text-sm text-slate-500">Unable to load your grades.</p>;

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">My assignments</h3>
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {mine.assignments.map((a) => (
            <li key={a.id} className="flex justify-between gap-3 py-2 text-sm">
              <span>{a.title}</span>
              <span className="text-slate-500">
                {a.grade != null ? `${a.grade}${a.maxMarks != null ? ` / ${a.maxMarks}` : ''}` : 'Not graded'}
              </span>
            </li>
          ))}
          {mine.assignments.length === 0 && <li className="py-2 text-sm text-slate-400">No assignments.</li>}
        </ul>
      </Card>
      <Card>
        <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">My quizzes</h3>
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {mine.quizzes.map((q) => (
            <li key={q.id} className="flex justify-between gap-3 py-2 text-sm">
              <span>{q.title}</span>
              <span className="text-slate-500">
                {q.score != null ? `${q.score} / ${q.totalMarks}` : 'Not taken'}
              </span>
            </li>
          ))}
          {mine.quizzes.length === 0 && <li className="py-2 text-sm text-slate-400">No quizzes.</li>}
        </ul>
      </Card>
    </div>
  );
}
