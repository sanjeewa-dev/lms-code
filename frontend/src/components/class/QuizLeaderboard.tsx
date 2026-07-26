import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '../../api/client';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Badge, Button, Card, Spinner } from '../ui';
import { Icon } from '../icons';
import type { QuizLeaderboard as QuizLeaderboardData } from '../../api/types';

function medalClass(rank: number) {
  if (rank === 1) return 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-800';
  if (rank === 2) return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10';
  if (rank === 3) return 'bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-800';
  return 'bg-slate-50 text-slate-500 ring-slate-100 dark:bg-white/5 dark:text-slate-400 dark:ring-white/5';
}

export function QuizLeaderboardPanel({
  quizId,
  quizTitle,
  canManage,
  onClose,
  showReviewLink = true,
}: {
  quizId: string;
  quizTitle?: string;
  canManage?: boolean;
  onClose?: () => void;
  /** Hide when answer review is already on the same page. */
  showReviewLink?: boolean;
}) {
  const t = useTenantApi();

  const query = useQuery({
    queryKey: ['quiz-leaderboard', t.slug, quizId],
    queryFn: async () =>
      (await t.get<QuizLeaderboardData>(`/quizzes/${quizId}/leaderboard`)).data,
  });

  if (query.isLoading) {
    return (
      <Card>
        <Spinner label="Loading results..." />
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card>
        <p className="text-sm text-red-600">
          {apiErrorMessage(query.error) || 'Unable to load quiz results.'}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Finish and submit the quiz to unlock the leaderboard.
        </p>
        {onClose && (
          <Button variant="secondary" className="mt-3" onClick={onClose}>
            ← Back
          </Button>
        )}
      </Card>
    );
  }

  const { quiz, leaderboard, myPlace } = query.data;
  const title = quizTitle ?? quiz.title;

  return (
    <div className="space-y-4">
      {onClose && (
        <div>
          <Button variant="secondary" onClick={onClose}>
            ← Back
          </Button>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Results &amp; leaderboard
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {title} · {quiz.attemptCount} attempt{quiz.attemptCount === 1 ? '' : 's'} · {quiz.totalMarks} marks
        </p>
      </div>

      {myPlace && (
        <div className="rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 to-white p-4 dark:border-brand-800 dark:from-brand-950/40 dark:to-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-lg font-extrabold text-white shadow-sm">
                #{myPlace.rank}
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Your place</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  Rank {myPlace.rank} of {quiz.attemptCount}
                </p>
                <p className="text-sm text-slate-500">
                  Score {myPlace.score} / {myPlace.totalMarks} ({myPlace.percentage}%)
                </p>
              </div>
            </div>
            {showReviewLink && (
              <Link to={`/${t.slug}/attempts/${myPlace.attemptId}/result`}>
                <Button variant="secondary">Review answers</Button>
              </Link>
            )}
          </div>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        {leaderboard.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {canManage
              ? 'No students have finished this quiz yet. The leaderboard will appear after submissions.'
              : 'No submissions yet for this quiz.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-400 dark:border-white/5 dark:bg-white/5">
                <tr>
                  <th className="px-5 py-3 font-semibold">Rank</th>
                  <th className="px-5 py-3 font-semibold">Student</th>
                  <th className="px-5 py-3 font-semibold">Score</th>
                  <th className="px-5 py-3 font-semibold">%</th>
                  <th className="px-5 py-3 font-semibold">Submitted</th>
                  {canManage && <th className="px-5 py-3 text-right font-semibold">Review</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {leaderboard.map((entry) => (
                  <tr
                    key={entry.attemptId}
                    className={`transition ${
                      entry.isMe
                        ? 'bg-brand-50/70 dark:bg-brand-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-1 ${medalClass(entry.rank)}`}
                      >
                        {entry.rank}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {entry.studentName}
                        </span>
                        {entry.isMe && <Badge tone="blue">You</Badge>}
                      </div>
                      {canManage && entry.studentEmail && (
                        <p className="text-xs text-slate-400">{entry.studentEmail}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-200">
                      {entry.score}
                      <span className="font-normal text-slate-400"> / {entry.totalMarks}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          entry.percentage >= 70
                            ? 'bg-emerald-100 text-emerald-700'
                            : entry.percentage >= 40
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {entry.percentage}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {entry.submittedAt
                        ? new Date(entry.submittedAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                    {canManage && (
                      <td className="px-5 py-3 text-right">
                        <Link to={`/${t.slug}/attempts/${entry.attemptId}/result`}>
                          <Button variant="secondary">View</Button>
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {leaderboard.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {leaderboard.slice(0, 3).map((entry) => (
            <div
              key={entry.attemptId}
              className={`rounded-2xl border p-4 ${
                entry.rank === 1
                  ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20'
                  : 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-800'
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <Icon name="star" width={16} height={16} className="text-amber-500" />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {entry.rank === 1 ? '1st place' : entry.rank === 2 ? '2nd place' : '3rd place'}
                </span>
              </div>
              <p className="font-semibold text-slate-900 dark:text-white">{entry.studentName}</p>
              <p className="mt-1 text-sm text-slate-500">
                {entry.score} / {entry.totalMarks} · {entry.percentage}%
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
