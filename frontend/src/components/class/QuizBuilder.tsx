import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../api/client';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Button, Card, Input } from '../ui';

interface DraftQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  marks: number;
}

const emptyQuestion = (): DraftQuestion => ({ text: '', options: ['', ''], correctIndex: 0, marks: 1 });

export function QuizBuilder({ classId, onDone }: { classId: string; onDone: () => void }) {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [timeLimitMin, setTimeLimitMin] = useState('5');
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [error, setError] = useState('');

  function updateQuestion(idx: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }
  function updateOption(qIdx: number, oIdx: number, value: string) {
    setQuestions((qs) =>
      qs.map((q, i) => (i === qIdx ? { ...q, options: q.options.map((o, j) => (j === oIdx ? value : o)) } : q))
    );
  }

  const createMutation = useMutation({
    mutationFn: async () =>
      (
        await t.post(`/classes/${classId}/quizzes`, {
          title,
          timeLimitSec: Math.max(0, Math.round(Number(timeLimitMin) * 60)),
          isPublished: true,
          questions,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizzes', t.slug, classId] });
      onDone();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <Card>
      <h3 className="mb-3 text-lg font-semibold">Create MCQ quiz</h3>
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

      <div className="mt-4 space-y-4">
        {questions.map((q, qIdx) => (
          <div key={qIdx} className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Question {qIdx + 1}</span>
              {questions.length > 1 && (
                <button
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qIdx))}
                >
                  Remove
                </button>
              )}
            </div>
            <Input placeholder="Question text" value={q.text} onChange={(e) => updateQuestion(qIdx, { text: e.target.value })} />
            <div className="mt-2 space-y-2">
              {q.options.map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${qIdx}`}
                    checked={q.correctIndex === oIdx}
                    onChange={() => updateQuestion(qIdx, { correctIndex: oIdx })}
                    title="Mark as correct answer"
                  />
                  <input
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                    placeholder={`Option ${oIdx + 1}`}
                    value={opt}
                    onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                  />
                  {q.options.length > 2 && (
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
              <button
                className="text-xs font-medium text-brand-600 hover:underline"
                onClick={() => updateQuestion(qIdx, { options: [...q.options, ''] })}
              >
                + Add option
              </button>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                Marks
                <input
                  type="number"
                  min={0}
                  className="w-16 rounded border border-slate-300 px-2 py-1"
                  value={q.marks}
                  onChange={(e) => updateQuestion(qIdx, { marks: Number(e.target.value) })}
                />
              </label>
              <span className="ml-auto text-xs text-slate-400">Radio marks the correct answer</span>
            </div>
          </div>
        ))}
      </div>

      <button
        className="mt-3 text-sm font-medium text-brand-600 hover:underline"
        onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
      >
        + Add question
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !title}>
          {createMutation.isPending ? 'Saving...' : 'Publish quiz'}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
