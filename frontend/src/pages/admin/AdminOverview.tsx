import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, Spinner } from '../../components/ui';
import { Icon } from '../../components/icons';
import { AdminStatCard, PageHeading } from '../../components/admin/AdminUi';

interface Overview {
  tenants: { active: number; inactive: number; pro: number; enterprise: number };
  users: Record<string, number>;
  payments: { pending: number; revenueMtd: number; forMonth: string };
  aiTokensUsed: number;
  openInterventions: number;
  emailFailedLast7d: number;
  recentJobFailures: { id: string; job: string; error: string | null; startedAt: string }[];
}

export default function AdminOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => (await api.get<{ overview: Overview }>('/admin/overview')).data.overview,
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
      <PageHeading
        title="Platform Overview"
        subtitle="Cross-tenant health, plans, payments, and AI usage"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard label="Active institutes" value={data.tenants.active} icon="building" tone="green" to="/admin/tenants" highlight />
        <AdminStatCard label="Pro plans" value={data.tenants.pro} icon="star" tone="blue" to="/admin/tenants" />
        <AdminStatCard label="Enterprise" value={data.tenants.enterprise} icon="star" tone="purple" to="/admin/tenants" />
        <AdminStatCard label="Inactive" value={data.tenants.inactive} icon="ban" tone="amber" to="/admin/tenants" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard
          label={`Revenue MTD (${data.payments.forMonth})`}
          value={`Rs. ${Math.round(data.payments.revenueMtd).toLocaleString()}`}
          icon="revenue"
          tone="green"
          to="/admin/payments"
        />
        <AdminStatCard label="Pending payments" value={data.payments.pending} icon="payments" tone="amber" to="/admin/payments" />
        <AdminStatCard label="AI tokens this month" value={data.aiTokensUsed} icon="spark" tone="purple" to="/admin/ai" />
        <AdminStatCard label="Open interventions" value={data.openInterventions} icon="bell" tone="sky" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Users by role</h2>
          <div className="space-y-2">
            {Object.entries(data.users).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
                <span className="capitalize text-slate-600 dark:text-slate-300">{role}</span>
                <span className="font-bold text-slate-900 dark:text-white">{count}</span>
              </div>
            ))}
          </div>
          <Link to="/admin/users" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
            Browse users <Icon name="chevron" width={14} height={14} />
          </Link>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent job failures</h2>
            <Link to="/admin/monitoring" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
              Monitoring
            </Link>
          </div>
          {data.recentJobFailures.length === 0 ? (
            <p className="text-sm text-emerald-600">No recent failures</p>
          ) : (
            <ul className="space-y-2">
              {data.recentJobFailures.map((j) => (
                <li key={j.id} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm dark:border-red-900/30 dark:bg-red-950/20">
                  <p className="font-medium text-red-700 dark:text-red-300">{j.job}</p>
                  <p className="truncate text-xs text-red-500">{j.error}</p>
                </li>
              ))}
            </ul>
          )}
          {data.emailFailedLast7d > 0 && (
            <p className="mt-3 text-sm text-amber-600">{data.emailFailedLast7d} failed emails in last 7 days</p>
          )}
        </Card>
      </div>
    </div>
  );
}
