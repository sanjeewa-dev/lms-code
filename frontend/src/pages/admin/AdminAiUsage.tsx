import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, Spinner } from '../../components/ui';
import { PageHeading } from '../../components/admin/AdminUi';

export default function AdminAiUsage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-ai-usage'],
    queryFn: async () => (await api.get('/admin/ai/usage')).data,
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading title="AI Usage" subtitle={`Token consumption for ${data.forMonth}`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">By institute</h2>
          <ul className="space-y-2 text-sm">
            {(data.byTenant ?? []).map((row: any) => (
              <li key={row.tenant.id} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                <Link to={`/admin/tenants/${row.tenant.id}`} className="font-medium text-brand-600 hover:underline">
                  {row.tenant.name ?? row.tenant.id}
                </Link>
                <span className="font-bold text-slate-900 dark:text-white">{row.used} tokens</span>
              </li>
            ))}
            {(data.byTenant ?? []).length === 0 && <p className="text-slate-400">No AI usage this month.</p>}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">By tool</h2>
          <ul className="space-y-2 text-sm">
            {(data.byTool ?? []).map((row: any) => (
              <li key={row.tool} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                <span className="capitalize text-slate-700 dark:text-slate-300">{row.tool}</span>
                <span className="font-bold text-slate-900 dark:text-white">{row.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
