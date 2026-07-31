import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../api/client';
import { Badge, Button, Card, Input, Spinner } from '../../components/ui';
import { PasswordRequirements } from '../../components/PasswordRequirements';
import { validatePassword } from '../../lib/passwordValidation';
import { PageHeading } from '../../components/admin/AdminUi';
import type { TenantSummary } from '../../api/types';

export default function AdminTenantsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  });

  const tenantsQuery = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: async () => (await api.get<{ tenants: TenantSummary[] }>('/admin/tenants')).data.tenants,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const pwdErr = validatePassword(form.adminPassword);
      if (pwdErr) throw new Error(pwdErr);
      return (
        await api.post('/admin/tenants', {
          name: form.name,
          admin: { name: form.adminName, email: form.adminEmail, password: form.adminPassword },
        })
      ).data;
    },
    onSuccess: () => {
      setShowForm(false);
      setForm({ name: '', adminName: '', adminEmail: '', adminPassword: '' });
      setError('');
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      (await api.patch(`/admin/tenants/${id}`, { isActive })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-tenants'] }),
  });

  return (
    <div className="space-y-6">
      <PageHeading
        title="Institutes"
        subtitle="Provision and manage tenant institutes"
        action={<Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : 'New institute'}</Button>}
      />

      {showForm && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Create institute + first admin</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="Institute name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-400">
                URL slug is generated automatically from the institute name.
              </p>
            </div>
            <Input label="Admin name" value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
            <Input
              label="Admin email"
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            />
            <Input
              label="Admin password"
              type="password"
              placeholder="Create a strong password"
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
            />
            {form.adminPassword && <PasswordRequirements password={form.adminPassword} />}
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Button
            className="mt-3"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.name || !form.adminEmail || !form.adminName || !form.adminPassword}
          >
            {createMutation.isPending ? 'Creating...' : 'Create institute'}
          </Button>
        </Card>
      )}

      {tenantsQuery.isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tenantsQuery.data?.map((t) => (
            <Card key={t.id} className="transition hover:border-brand-200 hover:shadow-md dark:hover:border-brand-700/40">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <span className="brand-chip h-10 w-10 shrink-0 text-sm font-extrabold">
                    {t.name[0]?.toUpperCase() ?? 'I'}
                  </span>
                  <div>
                    <Link
                      to={`/admin/tenants/${t.id}`}
                      className="font-semibold text-slate-900 hover:text-brand-600 dark:text-white"
                    >
                      {t.name}
                    </Link>
                    <a
                      href={`/${t.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-xs text-brand-600 hover:underline"
                    >
                      /{t.slug}
                    </a>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={t.isActive ? 'green' : 'red'}>{t.isActive ? 'active' : 'inactive'}</Badge>
                  <Badge tone="blue">{(t.plan ?? 'pro').toUpperCase()}</Badge>
                </div>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t.userCount ?? 0} users · {t.classCount ?? 0} classes
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/admin/tenants/${t.id}`}>
                  <Button variant="secondary" className="!px-3 !py-1.5 !text-xs">
                    Details
                  </Button>
                </Link>
                <Button
                  variant={t.isActive ? 'secondary' : 'primary'}
                  className="!px-3 !py-1.5 !text-xs"
                  onClick={() => toggleMutation.mutate({ id: t.id, isActive: !t.isActive })}
                  disabled={toggleMutation.isPending}
                >
                  {t.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </Card>
          ))}
          {tenantsQuery.data?.length === 0 && <p className="text-sm text-slate-500">No institutes yet.</p>}
        </div>
      )}
    </div>
  );
}
