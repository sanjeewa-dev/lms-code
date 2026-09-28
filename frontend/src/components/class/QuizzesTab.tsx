import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../../hooks/useTenantApi';
import { apiErrorMessage } from '../../api/client';
import { Badge, Button, Card, Modal, Spinner } from '../ui';
import { Icon } from '../icons';
import { QuizBuilder } from './QuizBuilder';
import { QuizLeaderboardPanel } from './QuizLeaderboard';
import { AiQuizGenerator } from './AiQuizGenerator';
import type { QuizSummary } from '../../api/types';

function hasFinishedQuiz(q: QuizSummary) {
  return Boolean(q.myAttempt?.submittedAt);
}

type QuizCompletion = {
  quiz: { id: string; title: string; totalMarks: number };
  total: number;
  completed: number;
  notCompleted: number;
  students: {
    id: string;
    name: string;
    email: string;
    completed: boolean;
    attemptId: string | null;
    submittedAt: string | null;
    score: number | null;
  }[];
};

function QuizCompletionModal({ quiz, onClose }: { quiz: QuizSummary; onClose: () => void }) {
  const t = useTenantApi();
  const [filter, setFilter] = useState<'all' | 'completed' | 'missing'>('all');
  const query = useQuery({
    queryKey: ['quiz-completion', t.slug, quiz.id],
    queryFn: async () => (await t.get<QuizCompletion>(`/quizzes/${quiz.id}/completion`)).data,
  });
  const data = query.data;
  const students = data?.students.filter((student) =>
    filter === 'all' ? true : filter === 'completed' ? student.completed : !student.completed
  ) ?? [];

  return (
    <Modal open onClose={onClose} title={`Quiz completion · ${quiz.title}`} className="max-w-3xl">
      {query.isLoading ? <Spinner label="Loading quiz progress..." /> : query.isError || !data ? (
        <p className="text-sm text-red-600">{apiErrorMessage(query.error) || 'Unable to load quiz progress.'}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-white/5"><p className="text-xs text-slate-500">Students</p><p className="text-xl font-bold">{data.total}</p></div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center text-emerald-700 dark:bg-emerald-950/30"><p className="text-xs">Completed</p><p className="text-xl font-bold">{data.completed}</p></div>
            <div className="rounded-xl bg-amber-50 p-3 text-center text-amber-700 dark:bg-amber-950/30"><p className="text-xs">Not completed</p><p className="text-xl font-bold">{data.notCompleted}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {([['all', `All (${data.total})`], ['completed', `Completed (${data.completed})`], ['missing', `Not completed (${data.notCompleted})`]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>{label}</button>
            ))}
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10">
            {students.map((student, index) => (
              <div key={student.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${index ? 'border-t border-slate-100 dark:border-white/5' : ''}`}>
                <div><p className="font-medium text-slate-800 dark:text-slate-200">{student.name}</p><p className="text-xs text-slate-400">{student.email}</p></div>
                {student.completed ? <div className="text-right"><Badge tone="green">Completed</Badge><p className="mt-1 text-xs text-slate-500">{student.score ?? 0} / {data.quiz.totalMarks} · {student.submittedAt ? new Date(student.submittedAt).toLocaleString() : ''}</p></div> : <Badge tone="amber">Not completed</Badge>}
              </div>
            ))}
            {students.length === 0 && <p className="p-5 text-sm text-slate-500">No students match this filter.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
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
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [building, setBuilding] = useState(false);
  const [aiOpen, setAiOpen] = useState(() => searchParams.get('ai') === '1');
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [resultsQuiz, setResultsQuiz] = useState<QuizSummary | null>(null);
  const [completionQuiz, setCompletionQuiz] = useState<QuizSummary | null>(null);
  const [actionError, setActionError] = useState('');
  const appBase = `/${t.slug}`;

  const closeAi = () => {
    setAiOpen(false);
    if (searchParams.get('ai')) {
      const next = new URLSearchParams(searchParams);
      next.delete('ai');
      setSearchParams(next, { replace: true });
    }
  };

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
      {canManage && !editorOpen && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            to={`${appBase}/quiz-analytics`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          >
            Quiz analytics
          </Link>
          <button
            type="button"
            onClick={() => {
              setBuilding(false);
              setEditingQuizId(null);
              setAiOpen(true);
            }}
            title="Generate quiz with AI"
            aria-label="Generate quiz with AI"
            className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-100 dark:border-brand-900/50 dark:bg-brand-950/40 dark:text-brand-200 dark:hover:bg-brand-950/60"
          >
            <Icon name="spark" width={16} height={16} />
            AI generate
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingQuizId(null);
              setAiOpen(false);
              setBuilding(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <Icon name="quiz" width={16} height={16} />
            Create MCQ quiz
          </button>
        </div>
      )}

      {aiOpen && (
        <Card className="border-brand-100 bg-gradient-to-b from-brand-50/80 to-white dark:border-brand-900/30 dark:from-brand-950/20 dark:to-ink-850">
          <AiQuizGenerator
            classId={classId}
            classTitle={classTitle}
            embedded
            onClose={closeAi}
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
      {completionQuiz && <QuizCompletionModal quiz={completionQuiz} onClose={() => setCompletionQuiz(null)} />}

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
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
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
                        <Button variant="secondary" onClick={() => setCompletionQuiz(q)}>
                          Completion
                        </Button>
                        <Button
                          variant="danger"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            const typed = window.prompt(
                              `Type DELETE to permanently remove “${q.title}” and all student attempts.`
                            );
                            if (typed?.trim().toUpperCase() === 'DELETE') {
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
          <p className="p-5 text-sm text-slate-500">
            No quizzes yet.
            {canManage && (
              <>
                {' '}
                <button
                  type="button"
                  className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
                  onClick={() => {
                    setEditingQuizId(null);
                    setAiOpen(false);
                    setBuilding(true);
                  }}
                >
                  Create MCQ quiz
                </button>
              </>
            )}
          </p>
        )}
      </Card>
    </div>
  );
}
