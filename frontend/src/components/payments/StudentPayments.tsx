import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '../../api/client';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Badge, Button, Card, Select, Spinner, statusTone } from '../ui';
import { showToast } from '../AppToast';
import { currentMonth, formatMonthLabel, monthOptions } from '../../lib/paymentUtils';
import type { Payment, PaymentEnrollmentStatus } from '../../api/types';
import { StudentMaterialPayments } from './StudentMaterialPayments';

export function StudentPayments() {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get('section') === 'materials' ? 'materials' : 'fees';
  const highlightMaterialId = searchParams.get('materialId');
  const [forMonth, setForMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [batchOpen, setBatchOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [replacingPaymentId, setReplacingPaymentId] = useState<string | null>(null);

  const paymentInfoQuery = useQuery({
    queryKey: ['payment-info', t.slug],
    queryFn: async () =>
      (
        await t.get<{
          paymentInfo: {
            bankName: string | null;
            bankAccountName: string | null;
            bankAccountNumber: string | null;
            bankBranch: string | null;
            paymentInstructions: string | null;
            payhereEnabled: boolean;
            graceDays: number;
            requireMonthlyPayment: boolean;
          } | null;
        }>('/settings/payment-info')
      ).data.paymentInfo,
  });

  const statusQuery = useQuery({
    queryKey: ['payments-status', t.slug, forMonth],
    queryFn: async () =>
      (
        await t.get<{
          forMonth: string;
          forMonthLabel: string;
          enrollments: PaymentEnrollmentStatus[];
        }>('/payments/my-status', { params: { forMonth } })
      ).data,
  });

  const historyQuery = useQuery({
    queryKey: ['payments-mine', t.slug],
    queryFn: async () => (await t.get<{ payments: Payment[] }>('/payments/mine')).data.payments,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ enrollmentIds, file }: { enrollmentIds: string[]; file: File }) => {
      const body = new FormData();
      body.append('slip', file);
      body.append('forMonth', forMonth);
      for (const id of enrollmentIds) body.append('enrollmentIds', id);
      return (await t.post('/payments/slip', body)).data;
    },
    onSuccess: (_data, vars) => {
      setSelected(new Set());
      setBatchOpen(false);
      setError('');
      if (fileRef.current) fileRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['payments-status', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['payments-mine', t.slug] });
      const count = vars.enrollmentIds.length;
      showToast(
        count === 1
          ? `Payment slip submitted for ${formatMonthLabel(forMonth)}. Waiting for approval.`
          : `Payment slip submitted for ${count} classes (${formatMonthLabel(forMonth)}). Waiting for approval.`
      );
    },
    onError: (err) => {
      const msg = apiErrorMessage(err);
      setError(msg);
      showToast(msg, 'error');
    },
  });

  const replaceSlipMutation = useMutation({
    mutationFn: async ({ paymentId, file }: { paymentId: string; file: File }) => {
      const body = new FormData();
      body.append('slip', file);
      return (await t.patch(`/payments/${paymentId}/slip`, body)).data;
    },
    onSuccess: () => {
      setReplacingPaymentId(null);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['payments-status', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['payments-mine', t.slug] });
      showToast('Payment slip replaced. Waiting for approval.');
    },
    onError: (err) => {
      const msg = apiErrorMessage(err);
      setError(msg);
      showToast(msg, 'error');
    },
  });

  function startReplaceSlip(paymentId: string) {
    setReplacingPaymentId(paymentId);
    replaceFileRef.current?.click();
  }

  async function payWithPayHere(enrollmentId: string) {
    try {
      const { data } = await t.post<{ checkout: Record<string, string> }>('/payments/payhere/init', {
        enrollmentId,
        forMonth,
      });
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = data.checkout.action;
      for (const [key, value] of Object.entries(data.checkout)) {
        if (key === 'action' || key === 'sandbox') continue;
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      const msg = apiErrorMessage(err);
      setError(msg);
      showToast(msg, 'error');
    }
  }

  async function viewSlip(id: string) {
    try {
      const blob = await t.fetchBlob(`/payments/${id}/slip`);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch {
      showToast('Unable to load payment slip', 'error');
    }
  }

  const enrollments = statusQuery.data?.enrollments ?? [];
  const unpaid = useMemo(
    () =>
      enrollments.filter(
        (e) => e.enrollmentStatus === 'active' && (!e.payment || e.payment.status === 'rejected')
      ),
    [enrollments]
  );
  const paidClasses = enrollments.filter((e) => e.payment?.status === 'approved').length;
  const info = paymentInfoQuery.data;

  const selectedTotal = unpaid
    .filter((e) => selected.has(e.enrollmentId))
    .reduce((sum, e) => sum + e.class.price, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllUnpaid() {
    setSelected(new Set(unpaid.map((e) => e.enrollmentId)));
  }

  const enrollmentsWithPayment = enrollments;

  return (
    <div className="space-y-6">
      <input
        ref={replaceFileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replacingPaymentId) {
            replaceSlipMutation.mutate({ paymentId: replacingPaymentId, file });
          }
          e.target.value = '';
        }}
      />
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My payments</h1>
        <p className="text-slate-500">
          Pay monthly class fees or unlock paid materials with a bank slip.
        </p>
        <div className="mt-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/5">
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              section === 'fees'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-ink-850 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            Class fees
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ section: 'materials' })}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              section === 'materials'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-ink-850 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            Material payments
          </button>
        </div>
      </div>

      {section === 'materials' ? (
        <StudentMaterialPayments highlightMaterialId={highlightMaterialId} />
      ) : (
        <>
      {info && (info.bankName || info.paymentInstructions) && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">Bank transfer details</h2>
          <dl className="grid gap-1 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            {info.bankName && (
              <>
                <dt className="text-slate-400">Bank</dt>
                <dd>{info.bankName}</dd>
              </>
            )}
            {info.bankAccountName && (
              <>
                <dt className="text-slate-400">Account name</dt>
                <dd>{info.bankAccountName}</dd>
              </>
            )}
            {info.bankAccountNumber && (
              <>
                <dt className="text-slate-400">Account number</dt>
                <dd>{info.bankAccountNumber}</dd>
              </>
            )}
            {info.bankBranch && (
              <>
                <dt className="text-slate-400">Branch</dt>
                <dd>{info.bankBranch}</dd>
              </>
            )}
          </dl>
          {info.paymentInstructions && (
            <p className="mt-3 text-sm text-slate-500">{info.paymentInstructions}</p>
          )}
          {info.requireMonthlyPayment && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
              After your first month, unpaid fees for the previous month block class access after day{' '}
              {info.graceDays} of the new month.
            </p>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-56">
          <Select label="Billing month" value={forMonth} onChange={(e) => setForMonth(e.target.value)}>
            {monthOptions(12).map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        {statusQuery.data && (
          <p className="pb-2 text-sm text-slate-500">
            {paidClasses} of {enrollments.length} class{enrollments.length === 1 ? '' : 'es'} paid for{' '}
            {statusQuery.data.forMonthLabel}
          </p>
        )}
      </div>

      {statusQuery.isLoading ? (
        <Spinner />
      ) : enrollmentsWithPayment.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">You are not enrolled in any classes yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {unpaid.length > 0 && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Pay for multiple classes
                  </h2>
                  <p className="text-sm text-slate-500">
                    Select the classes you paid for and upload one slip for {formatMonthLabel(forMonth)}.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={selectAllUnpaid}>
                    Select all unpaid
                  </Button>
                  <Button
                    onClick={() => setBatchOpen((o) => !o)}
                    disabled={selected.size === 0}
                  >
                    {batchOpen ? 'Hide upload' : `Upload slip (${selected.size})`}
                  </Button>
                </div>
              </div>

              {batchOpen && selected.size > 0 && (
                <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
                  <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
                    Total for selected classes:{' '}
                    <strong>Rs. {selectedTotal.toLocaleString()}</strong>
                  </p>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" className="text-sm" />
                  {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                  <div className="mt-3 flex gap-2">
                    <Button
                      disabled={uploadMutation.isPending}
                      onClick={() => {
                        const file = fileRef.current?.files?.[0];
                        if (!file) {
                          setError('Please choose a payment slip file');
                          return;
                        }
                        uploadMutation.mutate({ enrollmentIds: [...selected], file });
                      }}
                    >
                      {uploadMutation.isPending ? 'Uploading…' : 'Submit payment'}
                    </Button>
                    <Button variant="secondary" onClick={() => setBatchOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {enrollmentsWithPayment.map((item) => {
            const payment = item.payment;
            const canSelect = !payment || payment.status === 'rejected';
            const canReplaceSlip = payment?.status === 'pending';

            return (
              <Card key={item.enrollmentId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {canSelect && (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.has(item.enrollmentId)}
                        onChange={() => toggle(item.enrollmentId)}
                      />
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.class.title}
                        </span>
                        <Badge tone={statusTone(item.enrollmentStatus)}>{item.enrollmentStatus}</Badge>
                        {payment ? (
                          <Badge tone={statusTone(payment.status)}>{payment.status}</Badge>
                        ) : (
                          <Badge tone="amber">Not submitted</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        Fee: Rs. {item.class.price.toLocaleString()}
                      </p>
                      {payment && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          Submitted Rs. {payment.amount.toLocaleString()} on{' '}
                          {new Date(payment.createdAt).toLocaleString()}
                          {payment.note && ` · Note: ${payment.note}`}
                        </p>
                      )}
                      {payment?.status === 'rejected' && payment.note && (
                        <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                          Rejection reason: {payment.note}. Select this class above and upload a new slip.
                        </p>
                      )}
                      {canReplaceSlip && (
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          Waiting for approval. You can replace the slip if you uploaded the wrong file.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {payment && (
                      <Button variant="secondary" onClick={() => viewSlip(payment.id)}>
                        View slip
                      </Button>
                    )}
                    {canReplaceSlip && (
                      <Button
                        variant="secondary"
                        onClick={() => startReplaceSlip(payment.id)}
                        disabled={replaceSlipMutation.isPending && replacingPaymentId === payment.id}
                      >
                        {replaceSlipMutation.isPending && replacingPaymentId === payment.id
                          ? 'Uploading…'
                          : 'Replace slip'}
                      </Button>
                    )}
                    {canSelect && info?.payhereEnabled && (
                      <Button variant="secondary" onClick={() => payWithPayHere(item.enrollmentId)}>
                        Pay online
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Payment history</h2>
        {historyQuery.isLoading ? (
          <Spinner />
        ) : historyQuery.data && historyQuery.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-white/5">
                <tr>
                  <th className="pb-2 pr-4 font-semibold">Month</th>
                  <th className="pb-2 pr-4 font-semibold">Class</th>
                  <th className="pb-2 pr-4 font-semibold">Amount</th>
                  <th className="pb-2 pr-4 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                {historyQuery.data.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-4">{p.forMonthLabel ?? p.forMonth}</td>
                    <td className="py-2 pr-4">{p.enrollment?.class.title ?? '—'}</td>
                    <td className="py-2 pr-4">Rs. {p.amount.toLocaleString()}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    </td>
                    <td className="py-2 text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No payments submitted yet.</p>
        )}
      </Card>
        </>
      )}
    </div>
  );
}
