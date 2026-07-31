import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useTenantApi } from '../../hooks/useTenantApi';
import { apiErrorMessage } from '../../api/client';
import { Badge, Button, Card, Spinner } from '../ui';
import { Icon } from '../icons';
import { QuizBuilder } from './QuizBuilder';
import { QuizLeaderboardPanel } from './QuizLeaderboard';
import { AiQuizGenerator } from './AiQuizGenerator';
import type { QuizSummary } from '../../api/types';

function hasFinishedQuiz(q: QuizSummary) {
  return Boolean(q.myAttempt?.submittedAt);
}

export function QuizzesTab({
  classId,
  classTitle,
  canManage,
  isStudent,
}: {
  classId: string;
  classTitle?: string;
  canManage: boolean;
  isStudent: boolean;
}) {
  const t = useTenantApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [building, setBuilding] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [resultsQuiz, setResultsQuiz] = useState<QuizSummary | null>(null);
  const [actionError, setActionError] = useState('');
  const appBase = `/${t.slug}`;

  const quizzesQuery = useQuery({
    queryKey: ['quizzes', t.slug, classId],
    queryFn: async () => (await t.get<{ quizzes: QuizSummary[] }>(`/classes/${classId}/quizzes`)).data.quizzes,
  });

  const deleteMutation = useMutation({
    mutationFn: async (quizId: string) => {
      await t.del(`/quizzes/${quizId}`);
    },
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['quizzes', t.slug, classId] });
      if (editingQuizId) setEditingQuizId(null);
    },
    onError: (err) => setActionError(apiErrorMessage(err)),
  });

  const publishMutation = useMutation({
    mutationFn: async ({ quizId, isPublished }: { quizId: string; isPublished: boolean }) =>
      (await t.patch(`/quizzes/${quizId}/publish`, { isPublished })).data,
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['quizzes', t.slug, classId] });
    },
    onError: (err) => setActionError(apiErrorMessage(err)),
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

  const editorOpen = building || Boolean(editingQuizId) || aiOpen;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-white/5 dark:bg-ink-850">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Quizzes</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Online MCQ exams — leaderboard unlocks after you finish a quiz
          </p>
        </div>
        {canManage && !editorOpen && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setBuilding(false);
                setEditingQuizId(null);
                setAiOpen(true);
              }}
              title="Generate quiz with AI"
              aria-label="Generate quiz with AI"
              className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-950/60"
            >
              <Icon name="spark" width={16} height={16} />
              AI generate
            </button>
            <button
              onClick={() => {
                setEditingQuizId(null);
                setAiOpen(false);
                setBuilding(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              <span className="text-lg leading-none">+</span> New quiz
            </button>
          </div>
        )}
      </div>

      {aiOpen && (
        <Card className="border-violet-100 bg-gradient-to-b from-violet-50/80 to-white dark:border-violet-900/30 dark:from-violet-950/20 dark:to-ink-850">
          <AiQuizGenerator
            classId={classId}
            classTitle={classTitle}
            embedded
            onClose={() => setAiOpen(false)}
            onPublished={() => {
              void queryClient.invalidateQueries({ queryKey: ['quizzes', t.slug, classId] });
            }}
          />
        </Card>
      )}

      {building && (
        <QuizBuilder
          classId={classId}
          onDone={() => {
            setBuilding(false);
            setActionError('');
          }}
        />
      )}
      {editingQuizId && (
        <QuizBuilder
          classId={classId}
          quizId={editingQuizId}
          onDone={() => {
            setEditingQuizId(null);
            setActionError('');
          }}
        />
      )}

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <Card className="overflow-hidden rounded-2xl p-0">
        {quizzesQuery.isLoading ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : quizzesQuery.data && quizzesQuery.data.length > 0 ? (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {quizzesQuery.data.map((q) => {
              const finished = hasFinishedQuiz(q);
              return (
                <li
                  key={q.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50/80 dark:hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-600">
                        <Icon name="quiz" width={18} height={18} />
                      </span>
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
                        <Badge tone="slate">{q.isPublished ? 'published' : 'draft'}</Badge>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            publishMutation.mutate({ quizId: q.id, isPublished: !q.isPublished })
                          }
                          disabled={publishMutation.isPending}
                        >
                          {q.isPublished ? 'Unpublish' : 'Publish'}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setBuilding(false);
                            setAiOpen(false);
                            setEditingQuizId(q.id);
                            setActionError('');
                          }}
                        >
                          Edit
                        </Button>
                        <Button onClick={() => setResultsQuiz(q)}>Results</Button>
                        <Button
                          variant="danger"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete “${q.title}”? This removes the quiz and all student attempts.`
                              )
                            ) {
                              deleteMutation.mutate(q.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="p-5 text-sm text-slate-500">No quizzes yet.</p>
        )}
      </Card>
    </div>
  );
}
