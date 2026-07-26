import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '../api/client';
import { useTenantApi } from '../hooks/useTenantApi';
import { Button, Card, Spinner } from '../components/ui';
import type { AttemptStart } from '../api/types';

export default function QuizRunner() {
  const { quizId, slug } = useParams<{ quizId: string; slug: string }>();
  const navigate = useNavigate();
  const t = useTenantApi();
  const [data, setData] = useState<AttemptStart | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expiredOnLoad, setExpiredOnLoad] = useState(false);
  const submittedRef = useRef(false);
  /** Only auto-submit when the timer counted down during this session. */
  const timerArmedRef = useRef(false);

  useEffect(() => {
    let active = true;
    t.post<AttemptStart>(`/quizzes/${quizId}/attempts`)
      .then(({ data: payload }) => {
        if (!active) return;
        setData(payload);
        if (payload.quiz.timeLimitSec > 0) {
          const startedMs = new Date(payload.attempt.startedAt).getTime();
          const elapsed = Math.floor((Date.now() - startedMs) / 1000);
          const left = Math.max(0, payload.quiz.timeLimitSec - elapsed);
          setRemaining(left);
          if (left > 0) {
            timerArmedRef.current = true;
          } else {
            // Time already over from a previous visit — do not silently auto-submit.
            setExpiredOnLoad(true);
          }
        }
      })
      .catch((err) => setError(apiErrorMessage(err)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const submit = useMemo(
    () => async () => {
      if (submittedRef.current || !data) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        const payload = {
          answers: Object.entries(answers).map(([questionId, selectedIndex]) => ({
            questionId,
            selectedIndex,
          })),
        };
        await t.post(`/attempts/${data.attempt.id}/submit`, payload);
        navigate(`/${slug}/attempts/${data.attempt.id}/result`, { replace: true });
      } catch (err) {
        setError(apiErrorMessage(err));
        submittedRef.current = false;
        setSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answers, data, navigate, slug]
  );

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      if (timerArmedRef.current && !expiredOnLoad) {
        submit();
      }
      return;
    }
    const id = setTimeout(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(id);
  }, [remaining, submit, expiredOnLoad]);

  if (error && !data) return <Card className="text-red-600">{error}</Card>;
  if (!data) return <Spinner label="Starting quiz..." />;

  const answeredCount = Object.keys(answers).length;
  const total = data.quiz.questions.length;

  if (expiredOnLoad) {
    return (
      <Card className="space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{data.quiz.title}</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            The time limit for this quiz has already ended, so it was not finished. Submit now with
            any answers you select, or go back without completing.
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit as incomplete'}
          </Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-ink-850">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{data.quiz.title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {answeredCount} of {total} answered
          </p>
        </div>
        {remaining !== null && (
          <div
            className={`rounded-lg px-3 py-1.5 font-mono text-sm font-semibold ${
              remaining < 30
                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200'
            }`}
          >
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </div>
        )}
      </div>

      {data.quiz.questions.map((q, idx) => (
        <Card key={q.id}>
          <p className="mb-3 font-medium text-slate-800 dark:text-slate-200">
            {idx + 1}. {q.text} <span className="text-xs text-slate-400">({q.marks} marks)</span>
          </p>
          <div className="space-y-2">
            {q.options.map((opt, oIdx) => (
              <label
                key={oIdx}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                  answers[q.id] === oIdx
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5'
                }`}
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === oIdx}
                  onChange={() => setAnswers({ ...answers, [q.id]: oIdx })}
                />
                {opt}
              </label>
            ))}
          </div>
        </Card>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit quiz'}
        </Button>
      </div>
    </div>
  );
}
