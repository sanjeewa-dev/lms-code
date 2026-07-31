import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../api/client';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Button, Card, Input, Spinner } from '../ui';

interface DraftQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  marks: number;
}

interface QuizDetail {
  id: string;
  title: string;
  description: string;
  timeLimitSec: number;
  isPublished: boolean;
  attemptCount?: number;
  questions: {
    text: string;
    options: unknown;
    correctIndex: number;
    marks: number;
  }[];
}

const emptyQuestion = (): DraftQuestion => ({ text: '', options: ['', ''], correctIndex: 0, marks: 1 });

function toDraftQuestions(questions: QuizDetail['questions']): DraftQuestion[] {
  return questions.map((q) => ({
    text: q.text,
    options: Array.isArray(q.options) ? (q.options as string[]).map(String) : ['', ''],
    correctIndex: q.correctIndex,
    marks: q.marks ?? 1,
  }));
}

export function QuizBuilder({
  classId,
  quizId,
  onDone,
}: {
  classId: string;
  quizId?: string;
  onDone: () => void;
}) {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const editing = Boolean(quizId);

  const [title, setTitle] = useState('');
  const [timeLimitMin, setTimeLimitMin] = useState('5');
  const [isPublished, setIsPublished] = useState(true);
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [error, setError] = useState('');
  const [lockedQuestions, setLockedQuestions] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['quiz', t.slug, quizId],
    enabled: Boolean(quizId),
    queryFn: async () => (await t.get<{ quiz: QuizDetail }>(`/quizzes/${quizId}`)).data.quiz,
  });

  useEffect(() => {
    if (!detailQuery.data) return;
    const q = detailQuery.data;
    setTitle(q.title);
    setTimeLimitMin(String(Math.round((q.timeLimitSec || 0) / 60)));
    setIsPublished(q.isPublished);
    const drafts = toDraftQuestions(q.questions);
    setQuestions(drafts.length ? drafts : [emptyQuestion()]);
    setLockedQuestions((q.attemptCount ?? 0) > 0);
  }, [detailQuery.data]);

  function updateQuestion(idx: number, patch: Partial<DraftQuestion>) {
    if (lockedQuestions) return;
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }
  function updateOption(qIdx: number, oIdx: number, value: string) {
    if (lockedQuestions) return;
    setQuestions((qs) =>
      qs.map((q, i) => (i === qIdx ? { ...q, options: q.options.map((o, j) => (j === oIdx ? value : o)) } : q))
    );
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        title,
        timeLimitSec: Math.max(0, Math.round(Number(timeLimitMin) * 60)),
        isPublished,
        ...(lockedQuestions ? {} : { questions }),
      };
      if (editing) {
        return (await t.patch(`/quizzes/${quizId}`, body)).data;
      }
      return (
        await t.post(`/classes/${classId}/quizzes`, {
          ...body,
          questions,
        })
      ).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizzes', t.slug, classId] });
      if (quizId) queryClient.invalidateQueries({ queryKey: ['quiz', t.slug, quizId] });
      onDone();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  if (editing && detailQuery.isLoading) {
    return (
      <Card>
        <Spinner label="Loading quiz..." />
      </Card>
    );
  }

  if (editing && detailQuery.isError) {
    return (
      <Card>
        <p className="text-sm text-red-600">{apiErrorMessage(detailQuery.error)}</p>
        <Button variant="secondary" className="mt-3" onClick={onDone}>
          Close
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="mb-3 text-lg font-semibold">{editing ? 'Edit quiz' : 'Create MCQ quiz'}</h3>
      {lockedQuestions && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Students have already started this quiz, so questions are locked. You can still change the
          title, time limit, and publish status.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Quiz title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input
          label="Time limit (minutes, 0 = unlimited)"
          type="number"
          min={0}
          value={timeLimitMin}
          onChange={(e) => setTimeLimitMin(e.target.value)}
        />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => setIsPublished(e.target.checked)}
          className="rounded border-slate-300"
        />
        Published (visible to students)
      </label>

      <div className={`mt-4 space-y-4 ${lockedQuestions ? 'pointer-events-none opacity-60' : ''}`}>
        {questions.map((q, qIdx) => (
          <div key={qIdx} className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Question {qIdx + 1}</span>
              {!lockedQuestions && questions.length > 1 && (
                <button
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qIdx))}
                >
                  Remove
                </button>
              )}
            </div>
            <Input
              placeholder="Question text"
              value={q.text}
              onChange={(e) => updateQuestion(qIdx, { text: e.target.value })}
              disabled={lockedQuestions}
            />
            <div className="mt-2 space-y-2">
              {q.options.map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${qIdx}`}
                    checked={q.correctIndex === oIdx}
                    onChange={() => updateQuestion(qIdx, { correctIndex: oIdx })}
                    title="Mark as correct answer"
                    disabled={lockedQuestions}
                  />
                  <input
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                    placeholder={`Option ${oIdx + 1}`}
                    value={opt}
                    onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                    disabled={lockedQuestions}
                  />
                  {!lockedQuestions && q.options.length > 2 && (
                    <button
                      className="text-xs text-slate-400 hover:text-red-600"
                      onClick={() =>
                        updateQuestion(qIdx, {
                          options: q.options.filter((_, j) => j !== oIdx),
                          correctIndex:
                            q.correctIndex >= oIdx && q.correctIndex > 0 ? q.correctIndex - 1 : q.correctIndex,
                        })
                      }
                    >
                      X
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3">
              {!lockedQuestions && (
                <button
                  className="text-xs font-medium text-brand-600 hover:underline"
                  onClick={() => updateQuestion(qIdx, { options: [...q.options, ''] })}
                >
                  + Add option
                </button>
              )}
              <label className="flex items-center gap-1 text-xs text-slate-500">
                Marks
                <input
                  type="number"
                  min={0}
                  className="w-16 rounded border border-slate-300 px-2 py-1"
                  value={q.marks}
                  onChange={(e) => updateQuestion(qIdx, { marks: Number(e.target.value) })}
                  disabled={lockedQuestions}
                />
              </label>
              {!lockedQuestions && (
                <span className="ml-auto text-xs text-slate-400">Radio marks the correct answer</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {!lockedQuestions && (
        <button
          className="mt-3 text-sm font-medium text-brand-600 hover:underline"
          onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
        >
          + Add question
        </button>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !title.trim()}>
          {saveMutation.isPending ? 'Saving...' : editing ? 'Save changes' : 'Publish quiz'}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
