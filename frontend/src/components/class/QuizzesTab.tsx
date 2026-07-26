import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Badge, Button, Card, Spinner } from '../ui';
import { QuizBuilder } from './QuizBuilder';
import { QuizLeaderboardPanel } from './QuizLeaderboard';
import type { QuizSummary } from '../../api/types';

function hasFinishedQuiz(q: QuizSummary) {
  return Boolean(q.myAttempt?.submittedAt);
}

export function QuizzesTab({
  classId,
  canManage,
  isStudent,
}: {
  classId: string;
  canManage: boolean;
  isStudent: boolean;
}) {
  const t = useTenantApi();
  const navigate = useNavigate();
  const [building, setBuilding] = useState(false);
  const [resultsQuiz, setResultsQuiz] = useState<QuizSummary | null>(null);
  const appBase = `/${t.slug}`;

  const quizzesQuery = useQuery({
    queryKey: ['quizzes', t.slug, classId],
    queryFn: async () => (await t.get<{ quizzes: QuizSummary[] }>(`/classes/${classId}/quizzes`)).data.quizzes,
  });

  if (resultsQuiz) {
    return (
      <QuizLeaderboardPanel
        quizId={resultsQuiz.id}
        quizTitle={resultsQuiz.title}
        canManage={canManage}
        onClose={() => setResultsQuiz(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Quizzes</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Online MCQ exams — leaderboard unlocks after you finish a quiz
          </p>
        </div>
        {canManage && !building && (
          <button
            onClick={() => setBuilding(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <span className="text-lg leading-none">+</span> New quiz
          </button>
        )}
      </div>

      {building && <QuizBuilder classId={classId} onDone={() => setBuilding(false)} />}

      <Card>
        {quizzesQuery.isLoading ? (
          <Spinner />
        ) : quizzesQuery.data && quizzesQuery.data.length > 0 ? (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {quizzesQuery.data.map((q) => {
              const finished = hasFinishedQuiz(q);
              return (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{q.title}</span>
                      {!q.isPublished && <Badge tone="amber">draft</Badge>}
                      {isStudent && finished && (
                        <Badge tone="green">Score: {q.myAttempt!.score ?? 0}</Badge>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {q.questionCount} questions · {q.totalMarks} marks ·{' '}
                      {q.timeLimitSec > 0 ? `${Math.round(q.timeLimitSec / 60)} min` : 'no time limit'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isStudent && finished ? (
                      <>
                        <Link to={`${appBase}/attempts/${q.myAttempt!.id}/result`}>
                          <Button variant="secondary">Review</Button>
                        </Link>
                        <Button onClick={() => setResultsQuiz(q)}>Leaderboard</Button>
                      </>
                    ) : isStudent ? (
                      <Button onClick={() => navigate(`${appBase}/quizzes/${q.id}/take`)}>Start</Button>
                    ) : (
                      <>
                        <Badge tone="slate">{q.isPublished ? 'published' : 'unpublished'}</Badge>
                        <Button onClick={() => setResultsQuiz(q)}>Results</Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No quizzes yet.</p>
        )}
      </Card>
    </div>
  );
}
