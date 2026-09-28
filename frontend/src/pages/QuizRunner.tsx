import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '../api/client';
import { useTenantApi } from '../hooks/useTenantApi';
import { Button, Spinner } from '../components/ui';
import type { AttemptStart } from '../api/types';

const LEAVE_MSG = 'You have quiz answers that are not submitted. Leave anyway?';
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function QuizRunner() {
  const { quizId, slug } = useParams<{ quizId: string; slug: string }>();
  const navigate = useNavigate();
  const t = useTenantApi();
  const [data, setData] = useState<AttemptStart | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expiredOnLoad, setExpiredOnLoad] = useState(false);
  const [reminderMsg, setReminderMsg] = useState('');
  const submittedRef = useRef(false);
  const timerArmedRef = useRef(false);
  const firedReminders = useRef<Set<number>>(new Set());
  const answersRef = useRef(answers);
  answersRef.current = answers;

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
          if (left > 0) timerArmedRef.current = true;
          else setExpiredOnLoad(true);
        }
      })
      .catch((err) => {
        if (active) setError(apiErrorMessage(err));
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const isDirty = () => Object.keys(answersRef.current).length > 0 && !submittedRef.current;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const onDocClick = (e: MouseEvent) => {
      if (!isDirty()) return;
      const el = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!el) return;
      const href = el.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (href.startsWith('http') && !href.includes(window.location.host)) return;
      if (!window.confirm(LEAVE_MSG)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onDocClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onDocClick, true);
    };
  }, []);

  useEffect(() => {
    if (remaining === null || remaining <= 0) return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r === null) return r;
        return Math.max(0, r - 1);
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [remaining !== null]);

  const questions = data?.quiz.questions ?? [];
  const unidirectional = data?.quiz.navigationMode === 'unidirectional';
  const reminders = data?.quiz.timeRemindersMinutes ?? [];

  useEffect(() => {
    if (remaining === null || !reminders.length) return;
    const minsLeft = Math.ceil(remaining / 60);
    for (const m of reminders) {
      if (minsLeft === m && !firedReminders.current.has(m)) {
        firedReminders.current.add(m);
        setReminderMsg(`${m} minute${m === 1 ? '' : 's'} remaining`);
        window.setTimeout(() => setReminderMsg(''), 6000);
      }
    }
  }, [remaining, reminders]);

  async function submitAttempt() {
    if (!data || submittedRef.current || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        answers: Object.entries(answersRef.current).map(([questionId, selectedIndex]) => ({
          questionId,
          selectedIndex,
        })),
      };
      await t.post(`/attempts/${data.attempt.id}/submit`, payload);
      submittedRef.current = true;
      navigate(`/${slug}/attempts/${data.attempt.id}/result`, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (remaining === 0 && timerArmedRef.current && data && !submittedRef.current) {
      void submitAttempt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const answeredCount = useMemo(
    () => questions.filter((q) => answers[q.id] != null).length,
    [answers, questions]
  );

  function goTo(next: number) {
    if (next < 0 || next >= questions.length) return;
    if (unidirectional && next < index) return;
    setIndex(next);
  }

  const current = questions[index];
  const timerLabel =
    remaining === null
      ? null
      : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  if (error && !data) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
        {error}
      </div>
    );
  }
  if (!data || !current) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="Loading quiz..." />
      </div>
    );
  }

  if (expiredOnLoad) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-semibold text-amber-900">Time already expired for this attempt.</p>
        <Button onClick={() => void submitAttempt()} disabled={submitting}>
          Submit blank / remaining answers
        </Button>
      </div>
    );
  }

  const selected = answers[current.id];
  const options = Array.isArray(current.options) ? current.options : [];

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-4xl flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-white/10">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{data.quiz.title}</h1>
          <p className="text-xs text-slate-500">
            Question {index + 1} of {questions.length}
            {current.topic ? ` · ${current.topic}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {timerLabel && (
            <span
              className={`rounded-lg px-3 py-1.5 font-mono text-sm font-bold tabular-nums ${
                remaining !== null && remaining <= 60
                  ? 'bg-red-100 text-red-800'
                  : 'bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-slate-100'
              }`}
            >
              {timerLabel}
            </span>
          )}
          <Button onClick={() => void submitAttempt()} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit quiz'}
          </Button>
        </div>
      </div>

      {reminderMsg && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          {reminderMsg}
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span className="font-semibold uppercase tracking-wide">Question palette</span>
          <span>
            <strong className="text-brand-700">{answeredCount}</strong> answered ·{' '}
            {questions.length - answeredCount} pending
          </span>
        </div>
        {unidirectional && (
          <p className="mb-2 rounded-lg border border-amber-100 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            Forward only — earlier questions lock after you leave them.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {questions.map((q, i) => {
            const answered = answers[q.id] != null;
            const isCurrent = i === index;
            const lockedBack = unidirectional && i < index;
            return (
              <button
                key={q.id}
                type="button"
                disabled={lockedBack}
                onClick={() => goTo(i)}
                className={`flex h-8 w-8 items-center justify-center rounded text-xs font-bold tabular-nums text-white ${
                  isCurrent
                    ? 'bg-indigo-600 ring-2 ring-indigo-300'
                    : answered
                      ? 'bg-emerald-500'
                      : lockedBack
                        ? 'bg-slate-300'
                        : 'bg-slate-400'
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <p className="text-base font-medium leading-relaxed text-slate-900 dark:text-slate-100">
          {current.text}
        </p>
        {(current.images ?? []).map((img) => (
          <img
            key={img.id}
            src={img.imageUrl}
            alt=""
            className="mt-3 max-h-64 rounded-lg border border-slate-200 object-contain"
          />
        ))}
        <div className="mt-4 space-y-2">
          {options.map((opt, oi) => {
            const active = selected === oi;
            return (
              <button
                key={oi}
                type="button"
                onClick={() => setAnswers((a) => ({ ...a, [current.id]: oi }))}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  active
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-slate-200 hover:border-slate-300 dark:border-white/10'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold dark:bg-white/10">
                  {OPTION_LABELS[oi] ?? oi + 1}
                </span>
                <span className="pt-0.5">{String(opt)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex justify-between">
        <Button
          variant="secondary"
          disabled={index === 0 || unidirectional}
          onClick={() => goTo(index - 1)}
        >
          Previous
        </Button>
        {index < questions.length - 1 ? (
          <Button onClick={() => goTo(index + 1)}>Next</Button>
        ) : (
          <Button onClick={() => void submitAttempt()} disabled={submitting}>
            Submit quiz
          </Button>
        )}
      </div>
    </div>
  );
}
