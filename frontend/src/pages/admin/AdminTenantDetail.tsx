import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage, tokenStore } from '../../api/client';
import { Badge, Button, Card, Input, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { AdminStatCard } from '../../components/admin/AdminUi';
import type { IconName } from '../../components/icons';

export default function AdminTenantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const qc = useQueryClient();
  const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '' });
  const [supportReason, setSupportReason] = useState('');
  const [showSupport, setShowSupport] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const detailQuery = useQuery({
    queryKey: ['admin-tenant-detail', id],
    queryFn: async () => (await api.get(`/admin/tenants/${id}/detail`)).data,
    enabled: !!id,
  });

  const planMutation = useMutation({
    mutationFn: async (plan: 'pro' | 'enterprise') =>
      (await api.patch(`/admin/tenants/${id}`, { plan })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant-detail', id] });
      setMsg('Plan updated');
      setErr('');
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  const featureMutation = useMutation({
    mutationFn: async (planFeatures: Record<string, unknown>) =>
      (await api.patch(`/admin/tenants/${id}`, { planFeatures })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant-detail', id] });
      setMsg('Features updated');
      setErr('');
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  const addAdminMutation = useMutation({
    mutationFn: async () => (await api.post(`/admin/tenants/${id}/admins`, adminForm)).data,
    onSuccess: () => {
      setAdminForm({ name: '', email: '', password: '' });
      qc.invalidateQueries({ queryKey: ['admin-tenant-detail', id] });
      setMsg('Admin added');
      setErr('');
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  const supportMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/admin/tenants/${id}/support-session`, { reason: supportReason })
      ).data as {
        accessToken: string;
        session: { id: string; tenantId: string; tenantSlug: string; tenantName: string };
      },
    onSuccess: async (data) => {
      tokenStore.beginSupport(data.accessToken, {
        sessionId: data.session.id,
        tenantId: data.session.tenantId,
        tenantSlug: data.session.tenantSlug,
        tenantName: data.session.tenantName,
      });
      await refreshUser();
      navigate(`/${data.session.tenantSlug}/dashboard`);
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const { tenant, stats, admins, classes, students, teachers, atRisk } = detailQuery.data;
  const features = tenant.features ?? {};

  const statItems: {
    label: string;
    value: number;
    icon: IconName;
    tone: 'blue' | 'green' | 'purple' | 'amber' | 'sky' | 'pink';
  }[] = [
    { label: 'Students', value: stats.students, icon: 'users', tone: 'blue' },
    { label: 'Teachers', value: stats.teachers, icon: 'teacher', tone: 'purple' },
    { label: 'Classes', value: stats.classes, icon: 'classes', tone: 'sky' },
    { label: 'Pending payments', value: stats.pendingPayments, icon: 'payments', tone: 'amber' },
    { label: 'Enrollments', value: stats.enrollments, icon: 'idcard', tone: 'green' },
    { label: 'AI tokens', value: stats.aiTokensUsed, icon: 'spark', tone: 'purple' },
    { label: 'Open interventions', value: stats.openInterventions, icon: 'bell', tone: 'pink' },
    { label: 'At-risk', value: stats.atRiskCount, icon: 'chart', tone: 'amber' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/tenants" className="text-sm text-slate-500 hover:text-brand-600">
            ← Institutes
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <span className="brand-chip h-12 w-12 text-lg font-extrabold">
              {tenant.name[0]?.toUpperCase() ?? 'I'}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{tenant.name}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">/{tenant.slug}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tenant.isActive ? 'green' : 'red'}>{tenant.isActive ? 'active' : 'inactive'}</Badge>
          <Badge tone="blue">{String(tenant.plan).toUpperCase()}</Badge>
          <Button onClick={() => setShowSupport(true)}>Enter as support</Button>
        </div>
      </div>

      {(msg || err) && (
        <p className={`text-sm ${err ? 'text-red-600' : 'text-emerald-600'}`}>{err || msg}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statItems.map((s) => (
          <AdminStatCard key={s.label} label={s.label} value={s.value} icon={s.icon} tone={s.tone} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Plan</h2>
          <div className="mb-4 flex gap-2">
            {(['pro', 'enterprise'] as const).map((p) => (
              <button
                key={p}
                onClick={() => planMutation.mutate(p)}
                className={`rounded-lg border px-4 py-1.5 text-sm font-semibold transition ${
                  tenant.plan === p
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 text-slate-600 hover:border-brand-300 dark:border-white/10 dark:text-slate-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Feature overrides</h3>
          <div className="space-y-2">
            {(
              [
                ['aiStudent', 'AI Student Area'],
                ['aiTeacher', 'AI Teacher Copilot'],
                ['parentTrust', 'Parent Trust Center'],
                ['interventions', 'Interventions'],
                ['smartJobs', 'Smart Jobs'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/5"
              >
                <span className="text-slate-700 dark:text-slate-300">{label}</span>
                <input
                  type="checkbox"
                  className="accent-brand-600"
                  checked={Boolean(features[key])}
                  onChange={(e) =>
                    featureMutation.mutate({
                      ...features,
                      [key]: e.target.checked,
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            PayHere: {tenant.payhereEnabled ? 'enabled' : 'off'}
            {tenant.hasPayhereSecret ? ' · secret set' : ' · no secret'}
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Admins</h2>
          <ul className="mb-4 space-y-2 text-sm">
            {admins.map((a: { id: string; name: string; email: string }) => (
              <li key={a.id} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                <span className="font-medium text-slate-800 dark:text-slate-100">{a.name}</span>
                <span className="text-slate-400">{a.email}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-2">
            <Input label="Name" value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} />
            <Input label="Email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} />
            <Input
              label="Password"
              type="password"
              value={adminForm.password}
              onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
            />
            <Button
              onClick={() => addAdminMutation.mutate()}
              disabled={!adminForm.name || !adminForm.email || !adminForm.password || addAdminMutation.isPending}
            >
              Add admin
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Class health</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-2 font-medium">Class</th>
                <th className="font-medium">Teacher</th>
                <th className="font-medium">Enrollments</th>
                <th className="font-medium">Attempts</th>
                <th className="font-medium">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c: any) => (
                <tr key={c.id} className="border-t border-slate-100 dark:border-white/5">
                  <td className="py-2.5 font-medium text-slate-800 dark:text-slate-100">{c.title}</td>
                  <td className="text-slate-600 dark:text-slate-300">{c.teacher?.name ?? '—'}</td>
                  <td>{c.enrollments}</td>
                  <td>{c.quizAttempts}</td>
                  <td>{c.attendanceRate != null ? `${c.attendanceRate}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Teachers</h2>
          <ul className="space-y-2 text-sm">
            {teachers.map((t: any) => (
              <li key={t.id} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                <span className="font-medium">{t.name}</span>
                <span className="text-slate-400">{t._count.classesOwned} classes</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Students (recent)</h2>
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {students.map((s: any) => (
              <li key={s.id} className="flex justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                <span>
                  <span className="font-medium">{s.name}</span>{' '}
                  <span className="text-xs text-slate-400">
                    {s.status}
                    {s.guardianEmail ? ' · guardian' : ''}
                  </span>
                </span>
                <span className="text-slate-400">{s._count.enrollments} enr.</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {atRisk?.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">At-risk snapshot</h2>
          <ul className="space-y-2 text-sm">
            {atRisk.map((s: any) => (
              <li
                key={s.studentId}
                className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 dark:border-amber-900/30 dark:bg-amber-950/20"
              >
                <span className="font-medium text-slate-800 dark:text-slate-100">{s.name}</span>
                <span className="text-slate-500"> — {s.reasons.join(', ')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-ink-850">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Enter as support</h2>
            <p className="text-sm text-slate-500">Reason is required and will be audited (session lasts 2 hours).</p>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              rows={3}
              placeholder="Why are you entering this institute?"
              value={supportReason}
              onChange={(e) => setSupportReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowSupport(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => supportMutation.mutate()}
                disabled={supportReason.trim().length < 5 || supportMutation.isPending}
              >
                {supportMutation.isPending ? 'Starting…' : 'Start support session'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
