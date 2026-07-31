import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { Button, Card } from './ui';
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
      <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Smart fee & parent alerts</h2>
      <p className="mb-4 text-sm text-slate-400">
        Fee reminders auto-send in the last week of each month. You can also run them now.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={feeMutation.isPending}
          onClick={() => feeMutation.mutate()}
        >
          {feeMutation.isPending ? 'Sending…' : 'Send fee reminders'}
        </Button>
        <Button
          variant="secondary"
          disabled={digestMutation.isPending}
          onClick={() => digestMutation.mutate()}
        >
          {digestMutation.isPending ? 'Sending…' : 'Send parent digests'}
        </Button>
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
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">AI study coach</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {query.data?.summary ?? 'Keep practising — open AI study tools when you need a boost.'}
          </p>
          {query.data && query.data.weakTopics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {query.data.weakTopics.map((tpc) => (
                <span
                  key={tpc.term}
                  className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                >
                  {tpc.term} · {tpc.missCount}
                </span>
              ))}
            </div>
          )}
        </div>
        <Link
          to={`/${t.slug}/ai`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Open AI study tools
        </Link>
      </div>
    </Card>
  );
}
