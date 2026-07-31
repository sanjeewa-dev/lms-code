import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { Badge, Button, Card, Spinner } from '../components/ui';
import { QuizLeaderboardPanel } from '../components/class/QuizLeaderboard';
import type { AttemptResult } from '../api/types';

function CoachSteps({ steps }: { steps: string[] }) {
  return (
    <div className="rounded-lg bg-brand-50/80 p-3 text-sm text-slate-700 dark:bg-brand-900/20 dark:text-slate-200">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">AI coach</p>
      <ol className="space-y-3">
        {steps.map((step, stepIdx) => (
          <li key={stepIdx} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
              {stepIdx + 1}
            </span>
            <p className="leading-relaxed">{step}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function QuizResult() {
  const { attemptId, slug } = useParams<{ attemptId: string; slug: string }>();
  const navigate = useNavigate();
  const t = useTenantApi();
  const [explanations, setExplanations] = useState<
    Record<string, { explanation: string; steps: string[] }>
  >({});
  const [explainErr, setExplainErr] = useState<Record<string, string>>({});
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['attempt-result', t.slug, attemptId],
    queryFn: async () => (await t.get<{ result: AttemptResult }>(`/attempts/${attemptId}/result`)).data.result,
  });

  useEffect(() => {
    if (!query.data?.questions) return;
    const saved: Record<string, { explanation: string; steps: string[] }> = {};
    for (const q of query.data.questions) {
      if (q.explanationSteps?.length) {
        saved[q.id] = { explanation: q.explanation ?? q.explanationSteps.join(' '), steps: q.explanationSteps };
      } else if (q.explanation) {
        saved[q.id] = { explanation: q.explanation, steps: [q.explanation] };
      }
    }
    if (Object.keys(saved).length) setExplanations((prev) => ({ ...saved, ...prev }));
  }, [query.data]);

  const explainMutation = useMutation({
    mutationFn: async (questionId: string) =>
      (
        await t.post<{ explanation: string; steps?: string[]; provider: string }>(
          `/smart/ai/attempts/${attemptId}/explain`,
          { questionId }
        )
      ).data,
    onSuccess: (data, questionId) => {
      setExplanations((e) => ({
        ...e,
        [questionId]: {
          explanation: data.explanation,
          steps: data.steps?.length ? data.steps : [data.explanation],
        },
      }));
      setExplainErr((e) => {
        const next = { ...e };
        delete next[questionId];
        return next;
      });
      setPendingQuestionId(null);
    },
    onError: (err, questionId) => {
      setExplainErr((e) => ({ ...e, [questionId]: apiErrorMessage(err) }));
      setPendingQuestionId(null);
    },
  });

  if (query.isLoading) return <Spinner label="Loading results..." />;
  if (!query.data) return <p>Result not found.</p>;

  const result = query.data;
  const pct = result.totalMarks ? Math.round(((result.score ?? 0) / result.totalMarks) * 100) : 0;
  const backToClass = result.classId
    ? `/${slug}/classes/${result.classId}?tab=quizzes`
    : `/${slug}/classes`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => navigate(backToClass)}>
          ← Back
        </Button>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Quiz result</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {result.quizTitle ?? 'Your score'}
          </h1>
          <p className="mt-1 text-slate-500">
            Score: {result.score} / {result.totalMarks} ({pct}%)
          </p>
        </div>
        <div
          className={`grid h-16 w-16 place-items-center rounded-full text-lg font-bold ${
            pct >= 50 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {pct}%
        </div>
      </Card>

      {result.quizId && (
        <QuizLeaderboardPanel
          quizId={result.quizId}
          quizTitle={result.quizTitle}
          showReviewLink={false}
        />
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Answer review</h2>
        <div className="space-y-3">
          {result.questions?.map((q, idx) => {
            const wrong = q.selectedIndex !== q.correctIndex;
            const saved = explanations[q.id];
            return (
              <Card key={q.id}>
                <p className="mb-3 font-medium text-slate-800 dark:text-slate-200">
                  {idx + 1}. {q.text}
                </p>
                <div className="space-y-2">
                  {q.options.map((opt, oIdx) => {
                    const isCorrect = oIdx === q.correctIndex;
                    const isSelected = oIdx === q.selectedIndex;
                    return (
                      <div
                        key={oIdx}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                          isCorrect
                            ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                            : isSelected
                              ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                              : 'border-slate-200 dark:border-white/10'
                        }`}
                      >
                        <span>{opt}</span>
                        {isCorrect && <Badge tone="green">Correct</Badge>}
                        {isSelected && !isCorrect && <Badge tone="red">Your answer</Badge>}
                      </div>
                    );
                  })}
                </div>

                {wrong && (
                  <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/5">
                    {saved ? (
                      <CoachSteps steps={saved.steps} />
                    ) : (
                      <Button
                        variant="secondary"
                        className="!text-xs"
                        disabled={explainMutation.isPending}
                        onClick={() => {
                          setPendingQuestionId(q.id);
                          explainMutation.mutate(q.id);
                        }}
                      >
                        {pendingQuestionId === q.id && explainMutation.isPending
                          ? 'Thinking…'
                          : 'Explain with AI coach'}
                      </Button>
                    )}
                    {explainErr[q.id] && (
                      <p className="mt-2 text-xs text-red-600">{explainErr[q.id]}</p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => navigate(backToClass)}>
          ← Back
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/${slug}/dashboard`)}>
          Dashboard
        </Button>
      </div>
    </div>
  );
}
