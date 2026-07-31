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
  if (rate === null) return <span className="text-slate-400 text-xs">Not enough data</span>;
  const color = rate >= 80 ? 'bg-emerald-500' : rate >= 60 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-ink-700 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 w-12 text-right">{rate}%</span>
    </div>
  );
}

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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white p-8 shadow-lg text-center max-w-sm">
          <p className="text-slate-600">No access token provided. Please use the link sent to your email.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    const msg =
      (error as any)?.response?.data?.error ??
      (error as any)?.message ??
      'Failed to load report.';
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="rounded-2xl bg-white p-8 shadow-lg text-center max-w-sm">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="font-bold text-slate-900 mb-2">Unable to load report</h2>
          <p className="text-slate-500 text-sm">{msg}</p>
        </div>
      </div>
    );
  }

  const avgQuiz =
    data.quizPerformance.length > 0
      ? Math.round(data.quizPerformance.reduce((s, q) => s + q.percentage, 0) / data.quizPerformance.length)
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 p-7 text-white shadow-lg">
          <p className="text-indigo-200 text-sm mb-1">Parent Progress Report</p>
          <h1 className="text-2xl font-black">{data.student.name}</h1>
          <p className="text-indigo-200 text-sm mt-1">{slug?.toUpperCase()} Learning Institute</p>
          {data.pendingPayments > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-red-500/30 px-3 py-1 text-xs font-semibold text-white">
              ⚠️ {data.pendingPayments} pending payment{data.pendingPayments > 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-black text-indigo-600">{data.classes.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Enrolled Classes</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <p className={`text-3xl font-black ${avgQuiz !== null ? (avgQuiz >= 70 ? 'text-emerald-600' : avgQuiz >= 50 ? 'text-amber-600' : 'text-red-600') : 'text-slate-400'}`}>
              {avgQuiz !== null ? `${avgQuiz}%` : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Quiz Average</p>
          </div>
          <div className={`rounded-2xl border p-4 text-center shadow-sm ${data.pendingPayments > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
            <p className={`text-3xl font-black ${data.pendingPayments > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {data.pendingPayments > 0 ? data.pendingPayments : '✓'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Pending Fees</p>
          </div>
        </div>

        {/* Attendance */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900 mb-4">Attendance (Last 60 Days)</h2>
          {data.attendanceSummary.length === 0 ? (
            <p className="text-slate-400 text-sm">No attendance records found.</p>
          ) : (
            <div className="space-y-4">
              {data.attendanceSummary.map((a) => (
                <div key={a.classId}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-slate-700">{a.className}</p>
                    <span className="text-xs text-slate-400">{a.present}/{a.sessions} sessions</span>
                  </div>
                  <AttendanceBar rate={a.rate} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quiz Performance */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900 mb-4">Recent Quiz Results</h2>
          {data.quizPerformance.length === 0 ? (
            <p className="text-slate-400 text-sm">No quiz results yet.</p>
          ) : (
            <div className="space-y-3">
              {data.quizPerformance.map((q, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{q.quizTitle}</p>
                    <p className="text-xs text-slate-400">{q.className} · {new Date(q.submittedAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${q.percentage >= 70 ? 'text-emerald-600' : q.percentage >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {q.score}/{q.totalMarks}
                    </p>
                    <p className="text-xs text-slate-400">{q.percentage}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payments */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900 mb-4">Recent Payments</h2>
          {data.paymentSummary.length === 0 ? (
            <p className="text-slate-400 text-sm">No payment records found.</p>
          ) : (
            <div className="space-y-2">
              {data.paymentSummary.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-slate-700 capitalize">{p.type}</span>
                    {p.month && <span className="text-slate-400 ml-1">· {p.month}</span>}
                    <p className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-800">Rs. {p.amount.toLocaleString()}</p>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                      p.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                      : p.status === 'pending' ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                    }`}>
                      {p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 pb-6">
          This report was prepared by {slug} institute. Link expires after 48 hours.
        </p>
      </div>
    </div>
  );
}
