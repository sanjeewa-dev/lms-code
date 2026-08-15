import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../../hooks/useTenantApi';
import { apiErrorMessage } from '../../api/client';
import { Badge, Button, Card, Input, Modal, Select, Spinner, statusTone } from '../ui';
import { Icon } from '../icons';
import { currentMonth, formatMonthLabel, monthOptions } from '../../lib/paymentUtils';
import type { ClassSummary, Payment, PaymentStatus } from '../../api/types';

type RosterEntry = {
  id: string;
  status: 'pending' | 'active' | 'rejected';
  student: { id: string; name: string; email: string };
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function initialStatus(params: URLSearchParams): PaymentStatus | '' {
  const value = params.get('status');
  if (value === 'pending' || value === 'approved' || value === 'rejected') return value;
  if (params.has('status') && value === '') return '';
  return 'pending';
}

function initialMonth(params: URLSearchParams): string {
  if (params.has('forMonth')) return params.get('forMonth') ?? '';
  return currentMonth();
}

export function AdminPayments() {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<PaymentStatus | ''>(() => initialStatus(searchParams));
  const [forMonth, setForMonth] = useState(() => initialMonth(searchParams));
  const [classId, setClassId] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const reviewingRef = useRef<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadClassId, setUploadClassId] = useState('');
  const [uploadEnrollmentId, setUploadEnrollmentId] = useState('');
  const [uploadMonth, setUploadMonth] = useState(() => currentMonth());
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');

  const query = useQuery({
    queryKey: ['payments', t.slug, status, forMonth, classId],
    queryFn: async () =>
      (
        await t.get<{ payments: Payment[] }>('/payments', {
          params: {
            ...(status ? { status } : {}),
            ...(forMonth ? { forMonth } : {}),
            ...(classId ? { classId } : {}),
          },
        })
      ).data.payments,
  });

  const summaryQuery = useQuery({
    queryKey: ['payments-summary', t.slug, forMonth],
    queryFn: async () =>
      (
        await t.get<{
          forMonth: string;
          forMonthLabel: string;
          total: number;
          approved: number;
          pending: number;
          rejected: number;
        }>('/payments/summary', { params: { forMonth } })
      ).data,
  });

  const pendingQuery = useQuery({
    queryKey: ['payments-pending-count', t.slug],
    queryFn: async () => (await t.get<{ count: number }>('/payments/pending-count')).data.count,
  });

  const classesQuery = useQuery({
    queryKey: ['classes', t.slug],
    queryFn: async () => (await t.get<{ classes: ClassSummary[] }>('/classes')).data.classes,
  });
  const rosterQuery = useQuery({
    queryKey: ['payment-slip-roster', t.slug, uploadClassId],
    enabled: Boolean(uploadClassId && uploadOpen),
    queryFn: async () => (await t.get<{ enrollments: RosterEntry[] }>(`/classes/${uploadClassId}/students`)).data.enrollments,
  });
  const staffSlipMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile || !uploadEnrollmentId) throw new Error('Select a student and payment slip');
      const body = new FormData();
      body.append('enrollmentId', uploadEnrollmentId);
      body.append('forMonth', uploadMonth);
      body.append('slip', uploadFile);
      return (await t.post('/payments/staff-slip', body)).data;
    },
    onSuccess: () => {
      setUploadOpen(false);
      setUploadClassId('');
      setUploadEnrollmentId('');
      setUploadFile(null);
      setUploadError('');
      queryClient.invalidateQueries({ queryKey: ['payments', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['payments-pending-count', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['payments-summary', t.slug] });
    },
    onError: (err) => setUploadError(apiErrorMessage(err)),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) =>
      (await t.post(`/payments/${id}/${action}`, { note })).data,
    onSuccess: () => {
      reviewingRef.current = null;
      setReviewingId(null);
      setReviewError('');
      setRejectId(null);
      setRejectNote('');
      queryClient.invalidateQueries({ queryKey: ['payments', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['payments-pending-count', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['payments-summary', t.slug] });
    },
    onError: (err) => {
      reviewingRef.current = null;
      setReviewingId(null);
      setReviewError(apiErrorMessage(err));
      queryClient.invalidateQueries({ queryKey: ['payments', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['payments-pending-count', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['payments-summary', t.slug] });
    },
  });

  function submitReview(id: string, action: 'approve' | 'reject', note?: string) {
    if (reviewingRef.current === id) return;
    reviewingRef.current = id;
    setReviewingId(id);
    setReviewError('');
    reviewMutation.mutate({ id, action, note });
  }

  async function viewSlip(id: string) {
    try {
      const blob = await t.fetchBlob(`/payments/${id}/slip`);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch {
      alert('Unable to load slip');
    }
  }

  const pendingCount = pendingQuery.data ?? 0;
  const payments = query.data ?? [];
  const summary = summaryQuery.data;
  const monthLabel = forMonth
    ? summary?.forMonthLabel ?? formatMonthLabel(forMonth)
    : 'All months';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-blue-600"><Icon name="payments" /></span>
          <div><h1 className="text-xl font-bold text-slate-900 dark:text-white">Payment verification</h1><p className="text-sm text-slate-500 dark:text-slate-400">Review and approve student payment slips by month</p></div>
        </div>
        <Button onClick={() => setUploadOpen(true)}>Upload slip for student</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label={`${monthLabel} payments`}
          value={summary?.total ?? 0}
          bar="border-l-blue-500"
          tone="text-blue-600"
          loading={summaryQuery.isLoading}
        />
        <SummaryCard
          label="Approved payments"
          value={summary?.approved ?? 0}
          bar="border-l-emerald-500"
          tone="text-emerald-600"
          loading={summaryQuery.isLoading}
        />
        <SummaryCard
          label="Pending payments"
          value={summary?.pending ?? 0}
          bar="border-l-amber-500"
          tone="text-amber-600"
          loading={summaryQuery.isLoading}
        />
        <SummaryCard
          label="Rejected payments"
          value={summary?.rejected ?? 0}
          bar="border-l-red-500"
          tone="text-red-600"
          loading={summaryQuery.isLoading}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Month" value={forMonth} onChange={(e) => setForMonth(e.target.value)}>
          <option value="">All months</option>
          {monthOptions(18).map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus | '')}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Select label="Class" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {(classesQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
      </div>

      {pendingCount > 0 && (
        <p className="text-sm font-medium text-amber-600">
          {pendingCount} payment{pendingCount === 1 ? '' : 's'} awaiting your review
        </p>
      )}

      {reviewError && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{reviewError}</p>
      )}

      {query.isLoading ? (
        <Spinner />
      ) : payments.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:border-white/5 dark:bg-white/5">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student ID</th>
                  <th className="px-4 py-3 font-semibold">Student name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Class</th>
                  <th className="px-4 py-3 font-semibold">Billing month</th>
                  <th className="px-4 py-3 font-semibold">Paid amount</th>
                  <th className="px-4 py-3 font-semibold">Class fee</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                {payments.map((p) => {
                  const student = p.enrollment?.student;
                  const klass = p.enrollment?.class;
                  const amountMatch = klass && p.amount >= klass.price;

                  return (
                    <tr key={p.id} className="align-middle hover:bg-slate-50/80 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-semibold text-slate-500">
                        {student?.regId ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{student?.name ?? '—'}</p>
                        {student?.phone && (
                          <p className="text-xs text-slate-400">{student.phone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{student?.email ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">
                        {klass?.title ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{p.forMonthLabel ?? p.forMonth}</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${amountMatch ? 'text-emerald-600' : 'text-amber-600'}`}>
                          Rs. {p.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        Rs. {klass?.price.toLocaleString() ?? '—'}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-500">{p.paymentType}</td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                        {p.note && (
                          <p className="mt-1 max-w-[140px] truncate text-xs text-slate-400" title={p.note}>
                            {p.note}
                          </p>
                        )}
                        {p.reviewedAt && (
                          <p className="mt-1 text-xs text-slate-400">
                            Reviewed {formatDateTime(p.reviewedAt)}
                            {p.reviewedBy ? ` · ${p.reviewedBy.name}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDateTime(p.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => viewSlip(p.id)}
                            title="View payment slip"
                            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 dark:border-white/10 dark:bg-white/5 dark:hover:bg-brand-900/20"
                          >
                            <Icon name="note" width={16} height={16} />
                          </button>
                          {p.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => submitReview(p.id, 'approve')}
                                disabled={reviewingId === p.id}
                                title="Approve payment"
                                className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-40"
                              >
                                <Icon name="check" width={16} height={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReviewError('');
                                  setRejectId(p.id);
                                }}
                                disabled={reviewingId === p.id}
                                title="Reject payment"
                                className="grid h-8 w-8 place-items-center rounded-lg bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-40"
                              >
                                <Icon name="ban" width={16} height={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400 dark:border-white/5">
            Showing {payments.length} payment{payments.length === 1 ? '' : 's'}
          </p>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No payments match your filters.</p>
        </Card>
      )}

      <Modal open={uploadOpen} onClose={() => { if (!staffSlipMutation.isPending) { setUploadOpen(false); setUploadError(''); } }} title="Upload payment slip for student" className="max-w-md">
        <p className="mb-4 text-sm text-slate-500">Use this for a payment slip a student sent to a staff member. It remains pending for review.</p>
        <div className="space-y-3">
          <Select label="Class" value={uploadClassId} onChange={(e) => { setUploadClassId(e.target.value); setUploadEnrollmentId(''); }}><option value="">Select a class</option>{(classesQuery.data ?? []).map((klass) => <option key={klass.id} value={klass.id}>{klass.title}</option>)}</Select>
          <Select label="Student" value={uploadEnrollmentId} disabled={!uploadClassId || rosterQuery.isLoading} onChange={(e) => setUploadEnrollmentId(e.target.value)}><option value="">{rosterQuery.isLoading ? 'Loading students...' : 'Select a student'}</option>{(rosterQuery.data ?? []).filter((entry) => entry.status !== 'rejected').map((entry) => <option key={entry.id} value={entry.id}>{entry.student.name} · {entry.student.email}</option>)}</Select>
          <Select label="Billing month" value={uploadMonth} onChange={(e) => setUploadMonth(e.target.value)}>{monthOptions(18).map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}</Select>
          <label className="block"><span className="mb-1 block text-sm font-medium">Payment slip</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" /></label>
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
          <div className="flex gap-2"><Button onClick={() => staffSlipMutation.mutate()} disabled={staffSlipMutation.isPending || !uploadEnrollmentId || !uploadFile}>{staffSlipMutation.isPending ? 'Uploading...' : 'Submit for review'}</Button><Button variant="secondary" onClick={() => setUploadOpen(false)}>Cancel</Button></div>
        </div>
      </Modal>

      <Modal
        open={Boolean(rejectId)}
        onClose={() => {
          setRejectId(null);
          setRejectNote('');
          setReviewError('');
        }}
        title="Reject payment"
        className="max-w-md"
      >
        <Input
          label="Reason (optional)"
          value={rejectNote}
          onChange={(e) => setRejectNote(e.target.value)}
          placeholder="e.g. Amount mismatch, unclear slip"
        />
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            onClick={() => rejectId && submitReview(rejectId, 'reject', rejectNote || undefined)}
            disabled={reviewMutation.isPending || reviewingId === rejectId}
          >
            Confirm reject
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setRejectId(null);
              setRejectNote('');
              setReviewError('');
            }}
          >
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  bar,
  tone,
  loading,
}: {
  label: string;
  value: number;
  bar: string;
  tone: string;
  loading?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-ink-850 ${bar}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold ${tone}`}>
        {loading ? '—' : value}
      </p>
    </div>
  );
}
