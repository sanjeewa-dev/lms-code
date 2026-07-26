import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Badge, Button, Card, Input, Spinner } from '../components/ui';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { validatePassword } from '../lib/passwordValidation';
import type { TenantSummary } from '../api/types';

export default function AdminTenants() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    slug: '',
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
          slug: form.slug,
          admin: { name: form.adminName, email: form.adminEmail, password: form.adminPassword },
        })
      ).data;
    },
    onSuccess: () => {
      setShowForm(false);
      setForm({ name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '' });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Institutes</h1>
          <p className="text-slate-500 dark:text-slate-400">Provision and manage tenant institutes</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : 'New institute'}</Button>
      </div>

      {showForm && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Create institute + first admin</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Institute name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input
              label="Slug (URL code)"
              placeholder="lowercase-hyphens"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
            />
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
            disabled={createMutation.isPending || !form.name || !form.slug || !form.adminEmail}
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
            <Card key={t.id}>
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{t.name}</h3>
                  <a href={`/${t.slug}`} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
                    /{t.slug}
                  </a>
                </div>
                <Badge tone={t.isActive ? 'green' : 'red'}>{t.isActive ? 'active' : 'inactive'}</Badge>
              </div>
              <p className="text-sm text-slate-500">
                {t.userCount ?? 0} users &middot; {t.classCount ?? 0} classes
              </p>
              <div className="mt-3">
                <Button
                  variant={t.isActive ? 'secondary' : 'primary'}
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
