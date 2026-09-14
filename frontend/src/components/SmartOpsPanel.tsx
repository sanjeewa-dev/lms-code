import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { Button, Card } from './ui';
import { Icon } from './icons';
import { useState } from 'react';

export function SmartOpsPanel() {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const feeMutation = useMutation({
    mutationFn: async () => (await t.post<{ sent: number; forMonth?: string }>('/smart/fee-reminders/run')).data,
    onSuccess: (data) => {
      setErr('');
      setMsg(`Fee reminders sent: ${data.sent}${data.forMonth ? ` (${data.forMonth})` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['notifications-unread', t.slug] });
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  const digestMutation = useMutation({
    mutationFn: async () => (await t.post<{ sent: number }>('/smart/parent-digests/run')).data,
    onSuccess: (data) => {
      setErr('');
      setMsg(`Parent digests emailed: ${data.sent}`);
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  return (
    <Card>
      <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">Smart ops · Fee reminders</h2>
      <p className="mb-4 text-sm text-slate-400">
        Fee reminders auto-send in the last week of each month. You can also run them now.
      </p>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 dark:border-white/5 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">₹</span>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Pending fee reminders</p>
              <p className="text-xs text-slate-400">Email students with overdue monthly fees</p>
            </div>
          </div>
          <Button
            variant="outlineBrand"
            disabled={feeMutation.isPending}
            onClick={() => feeMutation.mutate()}
          >
            {feeMutation.isPending ? 'Sending…' : 'Send reminders'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 dark:border-white/5 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">@</span>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Parent digests</p>
              <p className="text-xs text-slate-400">Progress summaries for guardians</p>
            </div>
          </div>
          <Button
            variant="outlineBrand"
            disabled={digestMutation.isPending}
            onClick={() => digestMutation.mutate()}
          >
            {digestMutation.isPending ? 'Sending…' : 'Send digests'}
          </Button>
        </div>
      </div>
      {msg && <p className="mt-3 text-sm text-emerald-600">{msg}</p>}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </Card>
  );
}

/** Student weak-topic coach card for dashboard */
export function WeakTopicsCard() {
  const t = useTenantApi();
  const query = useQuery({
    queryKey: ['weak-topics', t.slug],
    queryFn: async () =>
      (
        await t.get<{
          summary: string;
          weakTopics: { term: string; missCount: number }[];
          wrongCount: number;
        }>('/smart/ai/weak-topics')
      ).data,
  });

  if (query.isLoading) return null;

  return (
    <Card className="border-brand-100 bg-brand-50/50 dark:border-brand-900/40 dark:bg-brand-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-white">
              <Icon name="spark" width={16} height={16} />
            </span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">AI study coach</h2>
            <span className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">
              Beta
            </span>
          </div>
          <p className="rounded-2xl bg-white/80 px-3 py-2 text-sm text-slate-600 shadow-sm dark:bg-ink-850/80 dark:text-slate-300">
            {query.data?.summary ?? 'Keep practising — open AI study tools when you need a boost.'}
          </p>
          {query.data && query.data.weakTopics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {query.data.weakTopics.map((tpc) => (
                <span
                  key={tpc.term}
                  className="rounded-xl border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-800 dark:border-brand-800 dark:bg-ink-850 dark:text-brand-200"
                >
                  {tpc.term} · {tpc.missCount}
                </span>
              ))}
            </div>
          )}
        </div>
        <Link
          to={`/${t.slug}/ai`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Open AI study tools
        </Link>
      </div>
    </Card>
  );
}
