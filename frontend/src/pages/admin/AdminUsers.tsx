import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../../api/client';
import { Badge, Button, Card, Input, Spinner } from '../../components/ui';
import { PageHeading } from '../../components/admin/AdminUi';

interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  tenantId: string | null;
  tenant: { id: string; slug: string; name: string } | null;
  createdAt: string;
}

export default function AdminUsers() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', q, role],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (role) params.set('role', role);
      return (await api.get(`/admin/users?${params}`)).data.users as PlatformUser[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; name?: string; email?: string; status?: string }) => {
      const { id, ...body } = payload;
      return (await api.patch(`/admin/users/${id}`, body)).data;
    },
    onSuccess: () => {
      setMsg('User updated');
      setErr('');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  function openEdit(u: PlatformUser) {
    setEditing(u);
    setEditForm({ name: u.name, email: u.email });
    setMsg('');
    setErr('');
  }

  function statusTone(status: string): 'green' | 'amber' | 'red' | 'slate' {
    if (status === 'approved') return 'green';
    if (status === 'pending') return 'amber';
    if (status === 'rejected') return 'red';
    return 'slate';
  }

  return (
    <div className="space-y-6">
      <PageHeading title="Users" subtitle="Global search across all institutes" />
      {(msg || err) && <p className={`text-sm ${err ? 'text-red-600' : 'text-emerald-600'}`}>{err || msg}</p>}
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="min-w-[200px] flex-1">
            <Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Role</label>
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="">All</option>
              <option value="admin">Admin</option>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>
        </div>
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-2 font-medium">Name</th>
                  <th className="font-medium">Email</th>
                  <th className="font-medium">Role</th>
                  <th className="font-medium">Status</th>
                  <th className="font-medium">Institute</th>
                  <th className="font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((u) => (
                  <tr key={u.id} className="border-t border-slate-100 dark:border-white/5">
                    <td className="py-2.5 font-medium text-slate-800 dark:text-slate-100">{u.name}</td>
                    <td className="text-slate-600 dark:text-slate-300">{u.email}</td>
                    <td>
                      <Badge tone="blue">{u.role}</Badge>
                    </td>
                    <td>
                      <Badge tone={statusTone(u.status)}>
                        {u.status === 'rejected' ? 'inactive' : u.status}
                      </Badge>
                    </td>
                    <td>
                      {u.tenant ? (
                        <Link className="font-medium text-brand-600 hover:underline" to={`/admin/tenants/${u.tenant.id}`}>
                          {u.tenant.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          className="!px-2.5 !py-1 !text-xs"
                          onClick={() => openEdit(u)}
                          disabled={u.role === 'superadmin'}
                        >
                          Edit
                        </Button>
                        {u.role !== 'superadmin' &&
                          (u.status === 'rejected' ? (
                            <Button
                              className="!px-2.5 !py-1 !text-xs"
                              disabled={updateMutation.isPending}
                              onClick={() => updateMutation.mutate({ id: u.id, status: 'approved' })}
                            >
                              Activate
                            </Button>
                          ) : (
                            <Button
                              variant="danger"
                              className="!px-2.5 !py-1 !text-xs"
                              disabled={updateMutation.isPending}
                              onClick={() => updateMutation.mutate({ id: u.id, status: 'rejected' })}
                            >
                              Inactivate
                            </Button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-ink-850">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Edit user</h2>
            <p className="text-xs text-slate-400">
              {editing.role}
              {editing.tenant ? ` · ${editing.tenant.name}` : ''}
            </p>
            <Input
              label="Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                disabled={
                  !editForm.name.trim() ||
                  !editForm.email.trim() ||
                  updateMutation.isPending ||
                  (editForm.name === editing.name && editForm.email === editing.email)
                }
                onClick={() =>
                  updateMutation.mutate({
                    id: editing.id,
                    name: editForm.name.trim(),
                    email: editForm.email.trim(),
                  })
                }
              >
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
