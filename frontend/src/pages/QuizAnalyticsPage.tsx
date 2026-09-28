import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Spinner } from '../components/ui';
import { downloadQuizReportPdf } from '../lib/quizReportPdf';

type TopicRow = { topic: string; correct: number; total: number; percentage: number };

function TopicBars({ rows }: { rows: TopicRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-slate-500">No topic mastery data yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.topic}>
          <div className="mb-0.5 flex justify-between text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-200">{row.topic}</span>
            <span className="tabular-nums text-slate-500">
              {row.percentage}% ({row.correct}/{row.total})
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className={`h-full rounded-full ${
                row.percentage >= 70 ? 'bg-emerald-500' : row.percentage >= 40 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, row.percentage)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function QuizAnalyticsPage() {
  const t = useTenantApi();
  const { user } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const isStaff = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'superadmin';
  const [tab, setTab] = useState<'classes' | 'quizzes' | 'students' | 'mine'>(
    isStaff ? 'classes' : 'mine'
  );
  const [classFilter, setClassFilter] = useState('');

  const classesQuery = useQuery({
    queryKey: ['quiz-analytics-classes', t.slug],
    enabled: isStaff,
    queryFn: async () =>
      (await t.get<{ classes: { classId: string; classTitle: string; attemptCount: number; averagePercentage: number | null; topicMastery: TopicRow[] }[] }>('/quiz-analytics/classes')).data.classes,
  });

  const quizzesQuery = useQuery({
    queryKey: ['quiz-analytics-quizzes', t.slug, classFilter],
    enabled: isStaff && tab === 'quizzes',
    queryFn: async () => {
      const qs = classFilter ? `?classId=${encodeURIComponent(classFilter)}` : '';
      return (
        await t.get<{
          quizzes: {
            quizId: string;
            title: string;
            classId: string;
            classTitle: string;
            attemptCount: number;
            averagePercentage: number | null;
            topicMastery: TopicRow[];
            questionPerformance: { questionId: string; topic: string; percentage: number }[];
          }[];
        }>(`/quiz-analytics/quizzes${qs}`)
      ).data.quizzes;
    },
  });

  const studentsQuery = useQuery({
    queryKey: ['quiz-analytics-students', t.slug, classFilter],
    enabled: isStaff && tab === 'students',
    queryFn: async () => {
      const qs = classFilter ? `?classId=${encodeURIComponent(classFilter)}` : '';
      return (
        await t.get<{
          students: {
            studentId: string;
            name: string;
            email: string;
            attemptCount: number;
            averagePercentage: number | null;
            topicMastery: TopicRow[];
            strengths: TopicRow[];
            weaknesses: TopicRow[];
          }[];
        }>(`/quiz-analytics/students${qs}`)
      ).data.students;
    },
  });

  const myMasteryQuery = useQuery({
    queryKey: ['quiz-analytics-mine', t.slug, classFilter],
    enabled: tab === 'mine' || user?.role === 'student',
    queryFn: async () => {
      const qs = classFilter ? `?classId=${encodeURIComponent(classFilter)}` : '';
      return (
        await t.get<{
          topicMastery: TopicRow[];
          attempts: {
            attemptId: string;
            quizTitle: string;
            percentage: number | null;
            submittedAt: string | null;
          }[];
        }>(`/quiz-analytics/my-mastery${qs}`)
      ).data;
    },
  });

  const classOptions = useMemo(() => {
    return (classesQuery.data ?? []).map((c) => ({ id: c.classId, title: c.classTitle }));
  }, [classesQuery.data]);

  async function exportPdf(quizId: string) {
    const { data } = await t.get<{ report: Parameters<typeof downloadQuizReportPdf>[0] }>(
      `/quiz-analytics/quizzes/${quizId}/report`
    );
    if (data.report) downloadQuizReportPdf(data.report);
  }

  const tabs: { id: typeof tab; label: string; staffOnly?: boolean }[] = isStaff
    ? [
        { id: 'classes', label: 'Classes' },
        { id: 'quizzes', label: 'Quizzes' },
        { id: 'students', label: 'Students' },
        { id: 'mine', label: 'My mastery' },
      ]
    : [{ id: 'mine', label: 'My mastery' }];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Quiz analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Topic mastery across classes, quizzes, and students (on-screen MCQs).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === item.id
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isStaff && (tab === 'quizzes' || tab === 'students') && (
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
        >
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      )}

      {tab === 'classes' && isStaff && (
        <div className="space-y-3">
          {classesQuery.isLoading && <Spinner label="Loading..." />}
          {(classesQuery.data ?? []).map((c) => (
            <Card key={c.classId}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link
                    to={`/${slug}/classes/${c.classId}/quizzes`}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {c.classTitle}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {c.attemptCount} attempts · avg{' '}
                    {c.averagePercentage != null ? `${c.averagePercentage}%` : '—'}
                  </p>
                </div>
              </div>
              <TopicBars rows={c.topicMastery} />
            </Card>
          ))}
        </div>
      )}

      {tab === 'quizzes' && isStaff && (
        <div className="space-y-3">
          {quizzesQuery.isLoading && <Spinner label="Loading..." />}
          {(quizzesQuery.data ?? []).map((q) => (
            <Card key={q.quizId}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{q.title}</p>
                  <p className="text-xs text-slate-500">
                    {q.classTitle} · {q.attemptCount} attempts · avg{' '}
                    {q.averagePercentage != null ? `${q.averagePercentage}%` : '—'}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => void exportPdf(q.quizId)}>
                  PDF report
                </Button>
              </div>
              <TopicBars rows={q.topicMastery} />
              {q.questionPerformance.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/5">
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                    Hardest questions
                  </p>
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {[...q.questionPerformance]
                      .sort((a, b) => a.percentage - b.percentage)
                      .slice(0, 5)
                      .map((row) => (
                        <li key={row.questionId}>
                          {row.topic}: {row.percentage}% correct
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === 'students' && isStaff && (
        <div className="space-y-3">
          {studentsQuery.isLoading && <Spinner label="Loading..." />}
          {(studentsQuery.data ?? []).map((s) => (
            <Card key={s.studentId}>
              <div className="mb-2">
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-slate-500">
                  {s.email} · {s.attemptCount} quizzes · avg{' '}
                  {s.averagePercentage != null ? `${s.averagePercentage}%` : '—'}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-emerald-700">Strengths</p>
                  <TopicBars rows={s.strengths} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-red-700">Weaknesses</p>
                  <TopicBars rows={s.weaknesses} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'mine' && (
        <div className="space-y-3">
          {myMasteryQuery.isLoading && <Spinner label="Loading..." />}
          <Card>
            <h2 className="mb-3 text-lg font-semibold">Your topic mastery</h2>
            <TopicBars rows={myMasteryQuery.data?.topicMastery ?? []} />
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-semibold">Recent quiz attempts</h2>
            <ul className="space-y-2 text-sm">
              {(myMasteryQuery.data?.attempts ?? []).map((a) => (
                <li key={a.attemptId} className="flex justify-between gap-2">
                  <Link
                    to={`/${slug}/attempts/${a.attemptId}/result`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {a.quizTitle}
                  </Link>
                  <span className="tabular-nums text-slate-500">
                    {a.percentage != null ? `${a.percentage}%` : '—'}
                  </span>
                </li>
              ))}
              {!myMasteryQuery.data?.attempts?.length && (
                <li className="text-slate-500">No submitted quizzes yet.</li>
              )}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
