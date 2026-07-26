import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { api, apiErrorMessage } from '../api/client';
import { Card, Spinner } from '../components/ui';
import { Icon } from '../components/icons';
import type { TenantUser, PublicTenant, StudentStatus } from '../api/types';
import {
  downloadIdCard,
  downloadStudentsCsv,
  downloadStudentsPdf,
  makeQr,
  type StudentRow,
} from '../lib/studentExports';

const EMPTY_FILTERS = { regId: '', search: '', grade: '', from: '', to: '' };

export default function Students() {
  const { slug } = useParams<{ slug: string }>();
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [qr, setQr] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const studentsQuery = useQuery({
    queryKey: ['students', slug],
    queryFn: async () => (await t.get<{ students: TenantUser[] }>('/students')).data.students,
  });

  async function setStatus(row: StudentRow, status: StudentStatus) {
    setActionError('');
    setBusyId(row.id);
    try {
      await t.patch(`/students/${row.id}/status`, { status });
      await queryClient.invalidateQueries({ queryKey: ['students', slug] });
      await queryClient.invalidateQueries({ queryKey: ['stats', slug] });
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleFreeCard(row: StudentRow) {
    setActionError('');
    setBusyId(row.id);
    try {
      await t.patch(`/students/${row.id}/free-card`, { freeIdCard: !row.freeIdCard });
      await queryClient.invalidateQueries({ queryKey: ['students', slug] });
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function removeStudent(row: StudentRow) {
    if (!window.confirm(`Delete ${row.name}? This permanently removes the student and their data.`)) return;
    setActionError('');
    setBusyId(row.id);
    try {
      await t.del(`/students/${row.id}`);
      await queryClient.invalidateQueries({ queryKey: ['students', slug] });
      await queryClient.invalidateQueries({ queryKey: ['stats', slug] });
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const tenantQuery = useQuery({
    queryKey: ['public', slug],
    queryFn: async () => (await api.get<PublicTenant>(`/t/${slug}/public`)).data,
    staleTime: 5 * 60 * 1000,
  });

  const institute = tenantQuery.data?.tenant.name ?? slug ?? 'Institute';

  const rows: StudentRow[] = useMemo(() => {
    const list = studentsQuery.data ?? [];
    return list.map((u, i) => ({
      ...u,
      regId: `#${list.length - i}`,
      grade: u.classes && u.classes.length ? u.classes.join(', ') : 'No class',
      status: (u.status ?? 'approved') as StudentStatus,
    }));
  }, [studentsQuery.data]);

  const approvedCount = rows.filter((r) => r.status === 'approved').length;
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  const filtered = useMemo(() => {
    const s = filters.search.trim().toLowerCase();
    const g = filters.grade.trim().toLowerCase();
    const id = filters.regId.trim().replace('#', '');
    const from = filters.from ? new Date(filters.from).getTime() : null;
    const to = filters.to ? new Date(filters.to).getTime() + 86400000 : null;
    return rows.filter((r) => {
      if (id && !r.regId.replace('#', '').includes(id)) return false;
      if (s && !(r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s))) return false;
      if (g && !r.grade.toLowerCase().includes(g)) return false;
      const ts = new Date(r.createdAt).getTime();
      if (from && ts < from) return false;
      if (to && ts > to) return false;
      return true;
    });
  }, [rows, filters]);

  async function openCard(row: StudentRow) {
    setSelected(row);
    setQr('');
    const data = await makeQr(`${institute} | ${row.name} | ${row.regId} | ${row.email}`);
    setQr(data);
  }

  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-blue-600">
          <Icon name="users" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Students Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            View, filter, and manage all registered students.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Total Students" value={rows.length} bar="border-l-blue-500" tone="text-blue-600" />
        <SummaryCard label="Approved" value={approvedCount} bar="border-l-emerald-500" tone="text-emerald-600" />
        <SummaryCard label="Pending" value={pendingCount} bar="border-l-amber-500" tone="text-amber-600" />
      </div>

      {/* Filter bar */}
      <Card>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Field label="Student ID">
            <input className={inputCls} placeholder="e.g. 102" value={filters.regId} onChange={set('regId')} />
          </Field>
          <Field label="Name / Search">
            <input className={inputCls} placeholder="Search name..." value={filters.search} onChange={set('search')} />
          </Field>
          <Field label="Class">
            <input className={inputCls} placeholder="e.g. Combined Maths" value={filters.grade} onChange={set('grade')} />
          </Field>
          <Field label="From Date">
            <input type="date" className={inputCls} value={filters.from} onChange={set('from')} />
          </Field>
          <Field label="To Date">
            <input type="date" className={inputCls} value={filters.to} onChange={set('to')} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
            <Icon name="chart" width={16} height={16} /> {filtered.length} results
          </span>
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300"
          >
            Reset Filter
          </button>
          <button
            onClick={() => downloadStudentsCsv(filtered, institute)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <Icon name="note" width={16} height={16} /> Export Excel
          </button>
          <button
            onClick={() => downloadStudentsPdf(filtered, institute)}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            <Icon name="note" width={16} height={16} /> Download PDF
          </button>
        </div>
      </Card>

      {actionError && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{actionError}</p>
      )}

      {/* Table */}
      <Card className="p-0">
        {studentsQuery.isLoading ? (
          <Spinner label="Loading students..." />
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No students match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-white/5">
                <tr>
                  <th className="px-5 py-3 font-semibold">ID</th>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Class</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filtered.map((r) => (
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
                    <td className="px-5 py-3 font-medium text-brand-600">{r.grade}</td>
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
                          onClick={() => toggleFreeCard(r)}
                          disabled={busyId === r.id}
                          title={r.freeIdCard ? 'Revoke free ID card' : 'Offer free ID card'}
                          className={`grid h-8 w-8 place-items-center rounded-lg text-white transition disabled:opacity-40 ${
                            r.freeIdCard
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-slate-500 hover:bg-slate-600'
                          }`}
                        >
                          <Icon name="star" width={16} height={16} />
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

      {/* ID card modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={() => setSelected(null)}
        >
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

            {/* Card */}
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

function SummaryCard({ label, value, bar, tone }: { label: string; value: number; bar: string; tone: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-ink-850 ${bar}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold ${tone}`}>{value}</p>
    </div>
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
