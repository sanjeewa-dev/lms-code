import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { Badge, Button, Card, Spinner } from '../components/ui';
import { QuizLeaderboardPanel } from '../components/class/QuizLeaderboard';
import type { AttemptResult } from '../api/types';

export default function QuizResult() {
  const { attemptId, slug } = useParams<{ attemptId: string; slug: string }>();
  const navigate = useNavigate();
  const t = useTenantApi();

  const query = useQuery({
    queryKey: ['attempt-result', t.slug, attemptId],
    queryFn: async () => (await t.get<{ result: AttemptResult }>(`/attempts/${attemptId}/result`)).data.result,
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
          {result.questions?.map((q, idx) => (
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
            </Card>
          ))}
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
