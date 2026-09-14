import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Spinner } from '../components/ui';

interface ParentReport {
  student: { id: string; name: string; email: string; guardianName: string | null };
  classes: { id: string; title: string }[];
  attendanceSummary: {
    classId: string;
    className: string;
    sessions: number;
    present: number;
    rate: number | null;
  }[];
  quizPerformance: {
    quizTitle: string;
    className: string;
    score: number;
    totalMarks: number;
    percentage: number;
    submittedAt: string;
  }[];
  paymentSummary: {
    id: string;
    type: string;
    amount: number;
    status: string;
    month: string | null;
    createdAt: string;
  }[];
  pendingPayments: number;
}

function AttendanceBar({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-xs text-slate-400">Not enough data</span>;
  const color = rate >= 80 ? 'bg-emerald-500' : rate >= 60 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${rate}%` }} />
      </div>
      <span className="w-12 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">{rate}%</span>
    </div>
  );
}

const shell = 'min-h-screen bg-slate-50 dark:bg-ink-900';
const panel =
  'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink-850';
const stat =
  'rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-white/10 dark:bg-ink-850';

export default function ParentTrustCenter() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const { data, isLoading, error } = useQuery<ParentReport>({
    queryKey: ['parent-report', token],
    queryFn: () =>
      axios
        .get(`/api/t/${slug}/public/parent-report?token=${encodeURIComponent(token)}`)
        .then((r) => r.data),
    enabled: !!token && !!slug,
    retry: false,
  });

  if (!token) {
    return (
      <div className={`${shell} flex items-center justify-center`}>
        <div className="max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg dark:bg-ink-850 dark:shadow-none dark:ring-1 dark:ring-white/10">
          <p className="text-slate-600 dark:text-slate-300">
            No access token provided. Please use the link sent to your email.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`${shell} flex items-center justify-center`}>
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    const msg =
      (error as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ??
      (error as { message?: string })?.message ??
      'Failed to load report.';
    return (
      <div className={`${shell} flex items-center justify-center p-4`}>
        <div className="max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg dark:bg-ink-850 dark:shadow-none dark:ring-1 dark:ring-white/10">
          <div className="mb-3 text-4xl">⚠️</div>
          <h2 className="mb-2 font-bold text-slate-900 dark:text-white">Unable to load report</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{msg}</p>
        </div>
      </div>
    );
  }

  const avgQuiz =
    data.quizPerformance.length > 0
      ? Math.round(data.quizPerformance.reduce((s, q) => s + q.percentage, 0) / data.quizPerformance.length)
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-slate-50 py-8 px-4 dark:from-ink-900 dark:to-ink-950">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-cyan-600 p-7 text-white shadow-lg">
          <p className="mb-1 text-sm text-brand-100">Parent Progress Report</p>
          <h1 className="text-2xl font-black">{data.student.name}</h1>
          <p className="mt-1 text-sm text-brand-100">{slug?.toUpperCase()} Learning Institute</p>
          {data.pendingPayments > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-red-500/30 px-3 py-1 text-xs font-semibold text-white">
              ⚠️ {data.pendingPayments} pending payment{data.pendingPayments > 1 ? 's' : ''}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className={stat}>
            <p className="text-3xl font-black text-brand-600 dark:text-brand-400">{data.classes.length}</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Enrolled Classes</p>
          </div>
          <div className={stat}>
            <p
              className={`text-3xl font-black ${
                avgQuiz !== null
                  ? avgQuiz >= 70
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : avgQuiz >= 50
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                  : 'text-slate-400'
              }`}
            >
              {avgQuiz !== null ? `${avgQuiz}%` : '—'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Quiz Average</p>
          </div>
          <div
            className={`rounded-2xl border p-4 text-center shadow-sm ${
              data.pendingPayments > 0
                ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30'
                : 'border-slate-200 bg-white dark:border-white/10 dark:bg-ink-850'
            }`}
          >
            <p
              className={`text-3xl font-black ${
                data.pendingPayments > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {data.pendingPayments > 0 ? data.pendingPayments : '✓'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Pending Fees</p>
          </div>
        </div>

        <div className={panel}>
          <h2 className="mb-4 font-bold text-slate-900 dark:text-white">Attendance (Last 60 Days)</h2>
          {data.attendanceSummary.length === 0 ? (
            <p className="text-sm text-slate-400">No attendance records found.</p>
          ) : (
            <div className="space-y-4">
              {data.attendanceSummary.map((a) => (
                <div key={a.classId}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{a.className}</p>
                    <span className="text-xs text-slate-400">
                      {a.present}/{a.sessions} sessions
                    </span>
                  </div>
                  <AttendanceBar rate={a.rate} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={panel}>
          <h2 className="mb-4 font-bold text-slate-900 dark:text-white">Recent Quiz Results</h2>
          {data.quizPerformance.length === 0 ? (
            <p className="text-sm text-slate-400">No quiz results yet.</p>
          ) : (
            <div className="space-y-3">
              {data.quizPerformance.map((q, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{q.quizTitle}</p>
                    <p className="text-xs text-slate-400">
                      {q.className} · {new Date(q.submittedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-bold ${
                        q.percentage >= 70
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : q.percentage >= 50
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {q.score}/{q.totalMarks}
                    </p>
                    <p className="text-xs text-slate-400">{q.percentage}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={panel}>
          <h2 className="mb-4 font-bold text-slate-900 dark:text-white">Recent Payments</h2>
          {data.paymentSummary.length === 0 ? (
            <p className="text-sm text-slate-400">No payment records found.</p>
          ) : (
            <div className="space-y-2">
              {data.paymentSummary.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium capitalize text-slate-700 dark:text-slate-300">{p.type}</span>
                    {p.month && <span className="ml-1 text-slate-400">· {p.month}</span>}
                    <p className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">
                      Rs. {p.amount.toLocaleString()}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : p.status === 'pending'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="pb-6 text-center text-xs text-slate-400">
          This report was prepared by {slug} institute. Link expires after 48 hours.
        </p>
      </div>
    </div>
  );
}
