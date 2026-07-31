import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../api/client';
import { Badge, Button, Card, Spinner } from '../../components/ui';
import { AdminStatCard, PageHeading } from '../../components/admin/AdminUi';
import { useState } from 'react';

export default function AdminMonitoring() {
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const healthQuery = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => (await api.get('/admin/health/deep')).data.health,
    refetchInterval: 30_000,
  });

  const jobsQuery = useQuery({
    queryKey: ['admin-jobs'],
    queryFn: async () => (await api.get('/admin/jobs')).data.jobs as any[],
  });

  const emailsQuery = useQuery({
    queryKey: ['admin-emails'],
    queryFn: async () => (await api.get('/admin/emails?take=40')).data.emails as any[],
  });

  const runJob = useMutation({
    mutationFn: async (name: string) => (await api.post(`/admin/jobs/${name}/run`)).data,
    onSuccess: () => {
      setMsg('Job started');
      setErr('');
      qc.invalidateQueries({ queryKey: ['admin-jobs'] });
      qc.invalidateQueries({ queryKey: ['admin-health'] });
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  const health = healthQuery.data;

  return (
    <div className="space-y-6">
      <PageHeading title="Monitoring" subtitle="Platform health, scheduled jobs, and email delivery" />

      {(msg || err) && <p className={`text-sm ${err ? 'text-red-600' : 'text-emerald-600'}`}>{err || msg}</p>}

      {healthQuery.isLoading || !health ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminStatCard
            label="Status"
            value={String(health.status).toUpperCase()}
            icon="chart"
            tone={health.status === 'ok' ? 'green' : 'amber'}
            highlight={health.status === 'ok'}
          />
          <AdminStatCard
            label="Database"
            value={health.db.ok ? `OK (${health.db.latencyMs}ms)` : 'DOWN'}
            icon="building"
            tone={health.db.ok ? 'green' : 'amber'}
          />
          <AdminStatCard
            label="SMTP"
            value={health.smtpConfigured ? 'Configured' : 'Console'}
            icon="notices"
            tone={health.smtpConfigured ? 'blue' : 'amber'}
          />
          <AdminStatCard
            label="AI / Scheduler"
            value={`${health.anthropicConfigured ? 'AI on' : 'AI off'} · ${health.schedulerArmed ? 'armed' : 'off'}`}
            icon="spark"
            tone="purple"
          />
        </div>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Jobs</h2>
          <div className="flex gap-2">
            <Button className="!px-3 !py-1.5 !text-xs" disabled={runJob.isPending} onClick={() => runJob.mutate('fee_reminders')}>
              Run fee reminders
            </Button>
            <Button
              className="!px-3 !py-1.5 !text-xs"
              variant="secondary"
              disabled={runJob.isPending}
              onClick={() => runJob.mutate('parent_digests')}
            >
              Run parent digests
            </Button>
          </div>
        </div>
        {jobsQuery.isLoading ? (
          <Spinner />
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-2 font-medium">Job</th>
                  <th className="font-medium">Status</th>
                  <th className="font-medium">Started</th>
                  <th className="font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {(jobsQuery.data ?? []).map((j) => (
                  <tr key={j.id} className="border-t border-slate-100 dark:border-white/5">
                    <td className="py-2.5 font-medium">{j.job}</td>
                    <td>
                      <Badge tone={j.status === 'success' ? 'green' : j.status === 'failed' ? 'red' : 'amber'}>
                        {j.status}
                      </Badge>
                    </td>
                    <td className="text-slate-500">{new Date(j.startedAt).toLocaleString()}</td>
                    <td className="max-w-xs truncate text-red-500">{j.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Recent emails</h2>
        {emailsQuery.isLoading ? (
          <Spinner />
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-2 font-medium">To</th>
                  <th className="font-medium">Subject</th>
                  <th className="font-medium">Status</th>
                  <th className="font-medium">Tenant</th>
                  <th className="font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {(emailsQuery.data ?? []).map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 dark:border-white/5">
                    <td className="py-2.5">{e.to}</td>
                    <td className="max-w-xs truncate">{e.subject}</td>
                    <td>
                      <Badge tone={e.status === 'sent' ? 'green' : e.status === 'failed' ? 'red' : 'amber'}>
                        {e.status}
                      </Badge>
                    </td>
                    <td className="text-slate-500">{e.tenant?.slug ?? '—'}</td>
                    <td className="text-slate-500">{new Date(e.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
