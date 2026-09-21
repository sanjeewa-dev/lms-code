import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { Badge, Button, Card, Input, Modal, Spinner } from '../components/ui';
import { Icon } from '../components/icons';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { validatePassword } from '../lib/passwordValidation';
import { EmptyState, PageHeader } from '../components/tenant/TenantUi';
import type { ClassSummary, Teacher } from '../api/types';

interface FormState {
  name: string;
  email: string;
  password: string;
  subject: string;
  phone: string;
  address: string;
  classIds: string[];
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  password: '',
  subject: '',
  phone: '',
  address: '',
  classIds: [],
};

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5';

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

  const classesQuery = useQuery({
    queryKey: ['classes', t.slug],
    queryFn: async () => (await t.get<{ classes: ClassSummary[] }>('/classes')).data.classes,
  });

  const allClasses = classesQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = teachersQuery.data ?? [];
    if (!q) return list;
    return list.filter(
      (x) =>
        x.name.toLowerCase().includes(q) ||
        x.subject.toLowerCase().includes(q) ||
        x.email.toLowerCase().includes(q)
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
      address: teacher.address ?? '',
      classIds: teacher.classes?.map((c) => c.id) ?? [],
    });
    setFormError('');
    setModalOpen(true);
  }

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['teachers', t.slug] }),
      queryClient.invalidateQueries({ queryKey: ['classes', t.slug] }),
      queryClient.invalidateQueries({ queryKey: ['stats', t.slug] }),
    ]);
  }

  function toggleClass(classId: string) {
    setForm((f) => ({
      ...f,
      classIds: f.classIds.includes(classId)
        ? f.classIds.filter((id) => id !== classId)
        : [...f.classIds, classId],
    }));
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
        address: form.address.trim(),
        classIds: form.classIds,
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
    <div className="space-y-6">
      <PageHeader
        icon="teacher"
        tone="violet"
        title="Teachers"
        subtitle="Add teachers and assign them to classes now or later."
        action={
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <span className="text-lg leading-none">+</span> Add teacher
          </button>
        }
      />

      <Card className="rounded-2xl">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Icon name="users" width={16} height={16} />
            </span>
            <input
              className={`${inputCls} pl-9`}
              placeholder="Search by name, subject, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Badge tone="slate">{filtered.length} teachers</Badge>
        </div>
      </Card>

      {actionError && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{actionError}</p>
      )}

      <Card className="overflow-hidden rounded-2xl p-0">
        {teachersQuery.isLoading ? (
          <Spinner label="Loading teachers..." />
        ) : filtered.length === 0 ? (
          <EmptyState
            message={search ? 'No teachers match your search.' : 'No teachers yet. Add your first teacher.'}
            action={
              !search ? (
                <Button onClick={openAdd}>Add teacher</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-400 dark:border-white/5 dark:bg-white/5">
                <tr>
                  <th className="px-5 py-3 font-semibold">Teacher</th>
                  <th className="px-5 py-3 font-semibold">Subject</th>
                  <th className="px-5 py-3 font-semibold">Classes</th>
                  <th className="px-5 py-3 font-semibold">Contact</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filtered.map((teacher) => (
                  <tr key={teacher.id} className="transition hover:bg-slate-50/80 dark:hover:bg-white/5">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <TeacherAvatar teacher={teacher} />
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{teacher.name}</p>
                          <p className="text-xs text-slate-500">{teacher.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {teacher.subject ? (
                        <Badge tone="blue">{teacher.subject}</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {teacher.classes && teacher.classes.length > 0 ? (
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {teacher.classes.map((c) => (
                            <Badge key={c.id} tone="slate">
                              {c.title}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No classes assigned</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-500">{teacher.phone || '—'}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => openEdit(teacher)}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 dark:border-white/10 dark:text-slate-300 dark:hover:bg-brand-900/30 dark:hover:text-brand-300"
                          title="Edit"
                        >
                          <Icon name="note" width={16} height={16} />
                        </button>
                        <button
                          onClick={() => remove(teacher)}
                          disabled={busyId === teacher.id}
                          className="grid h-8 w-8 place-items-center rounded-lg bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-40"
                          title="Delete"
                        >
                          <Icon name="trash" width={16} height={16} />
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

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        title={editing ? 'Edit teacher' : 'Add teacher'}
        className="max-h-[90vh] overflow-y-auto"
      >
          <form onSubmit={submit}>
            <p className="-mt-2 mb-5 text-sm text-slate-500">
              {editing ? 'Update details or class assignments.' : 'Create an account and optionally assign classes.'}
            </p>

            <div className="space-y-3">
              <Field label="Teacher name *">
                <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </Field>
              <Field label="Email *">
                <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              </Field>
              <Input
                label={editing ? 'Password (leave blank to keep)' : 'Password *'}
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required={!editing}
                placeholder="Create a strong password"
                autoComplete="new-password"
              />
              {(!editing || form.password) && <PasswordRequirements password={form.password} />}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Subject">
                  <input className={inputCls} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="e.g. ICT" />
                </Field>
                <Field label="Phone">
                  <input className={inputCls} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="077..." />
                </Field>
              </div>
              <Field label="Sender / shipping address">
                <textarea
                  className={inputCls}
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Address used as FROM on tute shipping labels"
                />
              </Field>

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Assign to classes</p>
                <p className="mt-0.5 text-xs text-slate-500">Optional — you can assign classes later from here.</p>
                {classesQuery.isLoading ? (
                  <Spinner />
                ) : allClasses.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No classes yet. Create classes first.</p>
                ) : (
                  <div className="mt-3 flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                    {allClasses.map((c) => (
                      <label
                        key={c.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                          form.classIds.includes(c.id)
                            ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-900/30'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10'
                        }`}
                      >
                        <input type="checkbox" className="sr-only" checked={form.classIds.includes(c.id)} onChange={() => toggleClass(c.id)} />
                        {c.title}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

            <div className="mt-5 flex gap-2">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? 'Saving...' : editing ? 'Update teacher' : 'Save teacher'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
      </Modal>
    </div>
  );
}

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
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
      {initials || '?'}
    </span>
  );
}
