import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { Card, Spinner } from '../components/ui';
import { Icon } from '../components/icons';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { validatePassword } from '../lib/passwordValidation';
import type { Teacher } from '../api/types';

interface FormState {
  name: string;
  email: string;
  password: string;
  subject: string;
  phone: string;
}

const EMPTY_FORM: FormState = { name: '', email: '', password: '', subject: '', phone: '' };

export default function Teachers() {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const teachersQuery = useQuery({
    queryKey: ['teachers', t.slug],
    queryFn: async () => (await t.get<{ teachers: Teacher[] }>('/teachers')).data.teachers,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = teachersQuery.data ?? [];
    if (!q) return list;
    return list.filter(
      (x) => x.name.toLowerCase().includes(q) || x.subject.toLowerCase().includes(q)
    );
  }, [teachersQuery.data, search]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(teacher: Teacher) {
    setEditing(teacher);
    setForm({
      name: teacher.name,
      email: teacher.email,
      password: '',
      subject: teacher.subject,
      phone: teacher.phone,
    });
    setFormError('');
    setModalOpen(true);
  }

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['teachers', t.slug] }),
      queryClient.invalidateQueries({ queryKey: ['stats', t.slug] }),
    ]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!editing || form.password) {
      if (!editing && !form.password) {
        setFormError('Password is required');
        return;
      }
      if (form.password) {
        const pwdErr = validatePassword(form.password);
        if (pwdErr) {
          setFormError(pwdErr);
          return;
        }
      }
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim(),
        phone: form.phone.trim(),
        ...(form.password ? { password: form.password } : {}),
      };

      if (editing) {
        await t.patch(`/teachers/${editing.id}`, body);
      } else {
        await t.post('/teachers', body);
      }
      await refresh();
      setModalOpen(false);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(teacher: Teacher) {
    if (!window.confirm(`Delete ${teacher.name}? This permanently removes the teacher account.`)) return;
    setActionError('');
    setBusyId(teacher.id);
    try {
      await t.del(`/teachers/${teacher.id}`);
      await refresh();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-100 text-violet-600">
            <Icon name="teacher" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Teachers Management</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Add, edit, and manage teacher accounts.
            </p>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <span className="text-lg leading-none">+</span> Add New Teacher
        </button>
      </div>

      {/* Search */}
      <Card>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Icon name="users" width={16} height={16} />
            </span>
            <input
              className={`${inputCls} pl-9`}
              placeholder="Search by Name or Subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
            {filtered.length} teachers
          </span>
        </div>
      </Card>

      {actionError && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{actionError}</p>
      )}

      {/* Table */}
      <Card className="p-0">
        {teachersQuery.isLoading ? (
          <Spinner label="Loading teachers..." />
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
            {search ? 'No teachers match your search.' : 'No teachers yet. Add your first teacher.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-white/5">
                <tr>
                  <th className="px-5 py-3 font-semibold">Teacher Name</th>
                  <th className="px-5 py-3 font-semibold">Subject</th>
                  <th className="px-5 py-3 font-semibold">Phone Number</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filtered.map((teacher) => (
                  <tr key={teacher.id} className="transition hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <TeacherAvatar teacher={teacher} />
                        <span className="font-semibold text-brand-600">{teacher.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {teacher.subject ? (
                        <span className="inline-flex rounded-md bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                          {teacher.subject}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                      {teacher.phone || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{teacher.email}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => openEdit(teacher)}
                          title="Edit teacher"
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                        >
                          <Icon name="note" width={14} height={14} /> Edit
                        </button>
                        <button
                          onClick={() => remove(teacher)}
                          disabled={busyId === teacher.id}
                          title="Delete teacher"
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-40"
                        >
                          <Icon name="trash" width={14} height={14} /> Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-500/40 p-4">
          <form
            onSubmit={submit}
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-ink-850"
          >
            <button
              type="button"
              onClick={() => !saving && setModalOpen(false)}
              className="absolute right-4 top-4 text-2xl leading-none text-slate-400 transition hover:text-slate-600"
            >
              ×
            </button>
            <h2 className="mb-5 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <span className="text-brand-600">
                <Icon name="teacher" width={22} height={22} />
              </span>
              {editing ? 'Edit Teacher' : 'Add New Teacher'}
            </h2>

            <div className="space-y-3">
              <Field label="Teacher Name">
                <input
                  className={inputCls}
                  placeholder="e.g. Mr. Sunimal Perera"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className={inputCls}
                  placeholder="teacher@institute.lk"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </Field>
              <Field label={editing ? 'Password (leave blank to keep current)' : 'Password'}>
                <input
                  type="password"
                  className={inputCls}
                  placeholder="Create a strong password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required={!editing}
                />
              </Field>
              {form.password && <PasswordRequirements password={form.password} />}
              <Field label="Subject">
                <input
                  className={inputCls}
                  placeholder="e.g. ICT"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </Field>
              <Field label="Phone Number">
                <input
                  className={inputCls}
                  placeholder="e.g. 0771234567"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </Field>
            </div>

            {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

            <button
              type="submit"
              disabled={saving}
              className="mt-5 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? 'Saving...' : editing ? 'Update Teacher' : 'Save Teacher'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function TeacherAvatar({ teacher }: { teacher: Teacher }) {
  const initials = teacher.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
      {initials || '?'}
    </span>
  );
}
