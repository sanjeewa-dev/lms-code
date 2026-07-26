import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../api/client';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Card, Spinner } from '../ui';
import { Icon } from '../icons';
import type { EnrollmentStatus, PublicTenant, StudentStatus, TenantUser } from '../../api/types';
import { downloadIdCard, makeQr, type StudentRow } from '../../lib/studentExports';
import { SRI_LANKAN_DISTRICTS } from '../../lib/districts';

interface RosterStudent {
  id: string;
  name: string;
  email: string;
  status: StudentStatus;
  freeIdCard?: boolean;
  createdAt: string;
}

interface RosterEntry {
  id: string;
  status: EnrollmentStatus;
  student: RosterStudent;
}

const EMPTY_FORM = {
  name: '',
  email: '',
  phones: [''],
  guardianName: '',
  guardianPhone: '',
  area: '',
  district: '',
  address: '',
  freeIdCard: false,
};

export function RosterTab({ classId, classTitle }: { classId: string; classTitle: string }) {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<'new' | 'existing'>('new');
  const [existingSearch, setExistingSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [qr, setQr] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const rosterQuery = useQuery({
    queryKey: ['roster', t.slug, classId],
    queryFn: async () =>
      (await t.get<{ enrollments: RosterEntry[] }>(`/classes/${classId}/students`)).data.enrollments,
  });

  const allStudentsQuery = useQuery({
    queryKey: ['students', t.slug],
    queryFn: async () => (await t.get<{ students: TenantUser[] }>('/students')).data.students,
    enabled: modalOpen && addMode === 'existing',
  });

  const tenantQuery = useQuery({
    queryKey: ['public', t.slug],
    queryFn: async () => (await api.get<PublicTenant>(`/t/${t.slug}/public`)).data,
    staleTime: 5 * 60 * 1000,
  });

  const institute = tenantQuery.data?.tenant.name ?? t.slug ?? 'Institute';

  const rows: StudentRow[] = useMemo(() => {
    const list = rosterQuery.data ?? [];
    return list.map((e, i) => ({
      id: e.student.id,
      name: e.student.name,
      email: e.student.email,
      status: e.student.status,
      freeIdCard: e.student.freeIdCard,
      createdAt: e.student.createdAt,
      regId: `#${list.length - i}`,
      grade: classTitle,
    }));
  }, [rosterQuery.data, classTitle]);

  const enrolledIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  const availableStudents = useMemo(() => {
    const list = allStudentsQuery.data ?? [];
    const q = existingSearch.trim().toLowerCase();
    return list
      .filter((s) => !enrolledIds.has(s.id))
      .filter((s) => {
        if (!q) return true;
        return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
      });
  }, [allStudentsQuery.data, enrolledIds, existingSearch]);

  function openAddModal(mode: 'new' | 'existing' = 'new') {
    setForm(EMPTY_FORM);
    setFormError('');
    setExistingSearch('');
    setAddMode(mode);
    setModalOpen(true);
  }

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['roster', t.slug, classId] }),
      queryClient.invalidateQueries({ queryKey: ['students', t.slug] }),
      queryClient.invalidateQueries({ queryKey: ['stats', t.slug] }),
    ]);
  }

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setInviteSuccess('');
    setSaving(true);
    try {
      const phones = form.phones.map((p) => p.trim()).filter(Boolean);
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        freeIdCard: form.freeIdCard,
      };
      if (phones.length) {
        payload.phones = phones;
        payload.phone = phones[0];
      }
      if (form.guardianName.trim()) payload.guardianName = form.guardianName.trim();
      if (form.guardianPhone.trim()) payload.guardianPhone = form.guardianPhone.trim();
      if (form.area.trim()) payload.area = form.area.trim();
      if (form.district) payload.district = form.district;
      if (form.address.trim()) payload.address = form.address.trim();

      const res = await t.post<{ invited: boolean; inviteUrl?: string }>(
        `/classes/${classId}/students`,
        payload
      );
      await refresh();
      setForm(EMPTY_FORM);
      setModalOpen(false);
      if (res.data.invited) {
        setInviteSuccess(
          `Invitation email sent to ${String(payload.email)}. The student must complete registration before they can sign in.` +
            (res.data.inviteUrl ? ` (Dev link: ${res.data.inviteUrl})` : '')
        );
      } else {
        setInviteSuccess(`${String(payload.name)} was enrolled and notified by email.`);
      }
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function enrollExisting(student: TenantUser) {
    setFormError('');
    setInviteSuccess('');
    setSaving(true);
    setBusyId(student.id);
    try {
      const res = await t.post<{ pendingRegistration?: boolean }>(
        `/classes/${classId}/students/enroll-existing`,
        { studentId: student.id, freeIdCard: form.freeIdCard }
      );
      await refresh();
      setModalOpen(false);
      if (res.data.pendingRegistration) {
        setInviteSuccess(
          `${student.name} was added to this class. They still need to complete registration before they can sign in.`
        );
      } else {
        setInviteSuccess(`${student.name} was enrolled and notified by email.`);
      }
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setSaving(false);
      setBusyId(null);
    }
  }

  async function setStatus(row: StudentRow, status: StudentStatus) {
    setActionError('');
    setBusyId(row.id);
    try {
      await t.patch(`/students/${row.id}/status`, { status });
      await refresh();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function removeStudent(row: StudentRow) {
    if (
      !window.confirm(
        `Delete ${row.name}? This permanently removes the student account and unenrolls them from all classes.`
      )
    )
      return;
    setActionError('');
    setBusyId(row.id);
    try {
      await t.del(`/students/${row.id}`);
      await refresh();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function openCard(row: StudentRow) {
    setSelected(row);
    setQr('');
    setQr(await makeQr(`${institute} | ${row.name} | ${row.regId} | ${row.email}`));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Enrolled students</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {rows.length} student{rows.length === 1 ? '' : 's'} in this class
          </p>
        </div>
        <button
          onClick={() => openAddModal('new')}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <span className="text-lg leading-none">+</span> Add Student
        </button>
      </div>

      {inviteSuccess && (
        <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{inviteSuccess}</p>
      )}

      {actionError && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{actionError}</p>
      )}

      <Card className="p-0">
        {rosterQuery.isLoading ? (
          <Spinner label="Loading students..." />
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
            No students enrolled yet. Use “Add Student” to enroll one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-white/5">
                <tr>
                  <th className="px-5 py-3 font-semibold">ID</th>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {rows.map((r) => (
                  <tr key={r.id} className="transition hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="px-5 py-3 font-semibold text-slate-400">{r.regId}</td>
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{r.name}</span>
                        {r.freeIdCard && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Free card
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{r.email}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => openCard(r)}
                          title="Student ID card"
                          className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white transition hover:bg-brand-700"
                        >
                          <Icon name="idcard" width={16} height={16} />
                        </button>
                        <button
                          onClick={() => setStatus(r, 'approved')}
                          disabled={busyId === r.id || r.status === 'approved'}
                          title="Approve student"
                          className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-40"
                        >
                          <Icon name="check" width={16} height={16} />
                        </button>
                        <button
                          onClick={() => setStatus(r, 'rejected')}
                          disabled={busyId === r.id || r.status === 'rejected'}
                          title="Reject student"
                          className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500 text-white transition hover:bg-amber-600 disabled:opacity-40"
                        >
                          <Icon name="ban" width={16} height={16} />
                        </button>
                        <button
                          onClick={() => removeStudent(r)}
                          disabled={busyId === r.id}
                          title="Delete student"
                          className="grid h-8 w-8 place-items-center rounded-lg bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-40"
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

      {/* Add student modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-500/40 p-4">
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-ink-850">
            <button
              type="button"
              onClick={() => !saving && setModalOpen(false)}
              className="absolute right-4 top-4 text-2xl leading-none text-slate-400 transition hover:text-slate-600"
            >
              ×
            </button>
            <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <span className="text-brand-600">
                <Icon name="users" width={22} height={22} />
              </span>
              Add Student to Class
            </h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Invite a new student or enroll someone who already has an account at your institute.
            </p>

            <div className="mb-5 flex rounded-lg border border-slate-200 p-1 dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  setAddMode('new');
                  setFormError('');
                }}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  addMode === 'new'
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'
                }`}
              >
                New student
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddMode('existing');
                  setFormError('');
                }}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  addMode === 'existing'
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'
                }`}
              >
                Existing student
              </button>
            </div>

            {addMode === 'new' ? (
              <form onSubmit={addStudent}>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                  Name and email are required. An invitation email will be sent so the student can complete
                  registration and set their password.
                </p>

                <div className="space-y-3">
                  <Field label="Student name *">
                    <input
                      className={inputCls}
                      placeholder="e.g. Nimal Perera"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Email *">
                    <input
                      type="email"
                      className={inputCls}
                      placeholder="student@example.com"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      required
                    />
                  </Field>

                  <div className="space-y-2">
                    <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Telephone (optional)
                    </span>
                    {form.phones.map((phone, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          className={inputCls}
                          placeholder={`e.g. 0771234567${index === 0 ? ' (primary)' : ''}`}
                          value={phone}
                          onChange={(e) =>
                            setForm((f) => {
                              const phones = [...f.phones];
                              phones[index] = e.target.value;
                              return { ...f, phones };
                            })
                          }
                        />
                        {form.phones.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                phones: f.phones.filter((_, i) => i !== index),
                              }))
                            }
                            className="shrink-0 rounded-lg px-3 text-sm text-red-500 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {form.phones.length < 5 && (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, phones: [...f.phones, ''] }))}
                        className="text-sm font-semibold text-brand-600 hover:underline"
                      >
                        + Add another phone no
                      </button>
                    )}
                  </div>

                  <Field label="Address (optional)">
                    <textarea
                      className={inputCls}
                      rows={2}
                      placeholder="Street, town, postal details"
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    />
                  </Field>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Contact person / Guardian (optional)
                    </p>
                    <div className="space-y-3">
                      <Field label="Guardian name">
                        <input
                          className={inputCls}
                          placeholder="e.g. Mother / Father / Guardian"
                          value={form.guardianName}
                          onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))}
                        />
                      </Field>
                      <Field label="Guardian telephone">
                        <input
                          className={inputCls}
                          placeholder="e.g. 0771234567"
                          value={form.guardianPhone}
                          onChange={(e) => setForm((f) => ({ ...f, guardianPhone: e.target.value }))}
                        />
                      </Field>
                    </div>
                  </div>

                  <Field label="Area / town (optional)">
                    <input
                      className={inputCls}
                      placeholder="e.g. Maharagama"
                      value={form.area}
                      onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                    />
                  </Field>
                  <Field label="District (optional)">
                    <select
                      className={inputCls}
                      value={form.district}
                      onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                    >
                      <option value="">Select district</option>
                      {SRI_LANKAN_DISTRICTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-800 dark:bg-brand-950/20">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.freeIdCard}
                      onChange={(e) => setForm((f) => ({ ...f, freeIdCard: e.target.checked }))}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Offer free student ID card
                      </span>
                      <span className="text-xs text-slate-500">
                        Mark this student as eligible for a free identity card.
                      </span>
                    </span>
                  </label>
                </div>

                {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

                <button
                  type="submit"
                  disabled={saving}
                  className="mt-5 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  {saving ? 'Sending invite...' : 'Send invitation'}
                </button>
              </form>
            ) : (
              <div>
                <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-lg border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-800 dark:bg-brand-950/20">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={form.freeIdCard}
                    onChange={(e) => setForm((f) => ({ ...f, freeIdCard: e.target.checked }))}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Offer free student ID card
                    </span>
                    <span className="text-xs text-slate-500">
                      Apply free-card eligibility when adding this student.
                    </span>
                  </span>
                </label>

                <Field label="Search by name or email">
                  <input
                    className={inputCls}
                    placeholder="Start typing to find a student..."
                    value={existingSearch}
                    onChange={(e) => setExistingSearch(e.target.value)}
                    autoFocus
                  />
                </Field>

                <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
                  {allStudentsQuery.isLoading ? (
                    <Spinner label="Loading students..." />
                  ) : availableStudents.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
                      {existingSearch.trim()
                        ? 'No matching students found who are not already in this class.'
                        : 'All institute students are already enrolled in this class, or no students exist yet.'}
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-white/5">
                      {availableStudents.map((student) => (
                        <li key={student.id}>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => enrollExisting(student)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-white/5"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-800 dark:text-slate-200">
                                {student.name}
                              </p>
                              <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                                {student.email}
                              </p>
                              {student.classes && student.classes.length > 0 && (
                                <p className="mt-0.5 truncate text-xs text-brand-600">
                                  In: {student.classes.join(', ')}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">
                              {busyId === student.id ? 'Adding...' : 'Add'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ID card modal */}
      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div
            className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-ink-850"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelected(null)}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-red-500 text-white transition hover:bg-red-600"
            >
              ×
            </button>
            <h2 className="mb-2 text-center text-lg font-bold text-slate-900 dark:text-white">Student ID Card</h2>
            {selected.freeIdCard && (
              <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wide text-emerald-600">
                Free card offered
              </p>
            )}

            <div className="grid grid-cols-[140px_1fr] overflow-hidden rounded-xl bg-hero-gradient text-white">
              <div className="flex flex-col items-center justify-center gap-2 border-r border-white/10 p-4 text-center">
                <span className="brand-chip grid h-14 w-14 text-2xl font-extrabold">{institute[0]}</span>
                <span className="text-sm font-bold leading-tight text-brand-300">{institute}</span>
                <span className="text-[10px] tracking-widest text-slate-400">STUDENT PORTAL</span>
              </div>
              <div className="flex items-center justify-between gap-3 p-5">
                <div className="space-y-3">
                  <p className="text-xs font-bold tracking-widest text-brand-300">
                    {selected.freeIdCard ? 'FREE IDENTITY CARD' : 'IDENTITY CARD'}
                  </p>
                  <Detail label="Student Name" value={selected.name} />
                  <Detail label="Registration ID" value={selected.regId} />
                  <Detail label="Class" value={selected.grade} />
                </div>
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-white p-1">
                  {qr ? <img src={qr} alt="QR" className="h-full w-full" /> : <Spinner />}
                </div>
              </div>
            </div>

            <button
              onClick={() => qr && downloadIdCard(selected, institute, qr)}
              disabled={!qr}
              className="mx-auto mt-5 flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              <Icon name="note" width={16} height={16} /> Download Card
            </button>
          </div>
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

function StatusBadge({ status }: { status: StudentStatus }) {
  const map: Record<StudentStatus, string> = {
    approved: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-amber-100 text-amber-700',
    rejected: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${map[status]}`}>
      {status}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-bold text-white">{value}</p>
    </div>
  );
}
