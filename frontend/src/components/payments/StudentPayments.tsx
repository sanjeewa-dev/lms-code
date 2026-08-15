import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../api/client';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Badge, Button, Card, Select, Spinner, statusTone } from '../ui';
import { currentMonth, formatMonthLabel, monthOptions } from '../../lib/paymentUtils';
import type { Payment, PaymentEnrollmentStatus } from '../../api/types';

export function StudentPayments() {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [forMonth, setForMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [batchOpen, setBatchOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
      enrollmentIds.forEach((id) => body.append('enrollmentIds', id));
      return (await t.post('/payments/slip', body)).data;
    },
    onSuccess: () => {
      setSelected(new Set());
      setBatchOpen(false);
      setError('');
      if (fileRef.current) fileRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['payments-status', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['payments-mine', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

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
      setError(apiErrorMessage(err));
    }
  }

  async function viewSlip(id: string) {
    try {
      const blob = await t.fetchBlob(`/payments/${id}/slip`);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch {
      alert('Unable to load payment slip');
    }
  }

  const enrollments = statusQuery.data?.enrollments ?? [];
  const unpaid = useMemo(
    () => enrollments.filter((item) => item.enrollmentStatus === 'active' && (!item.payment || item.payment.status === 'rejected')),
    [enrollments]
  );
  const paidClasses = enrollments.filter((e) => e.payment?.status === 'approved').length;
  const info = paymentInfoQuery.data;
  const selectedTotal = unpaid.filter((item) => selected.has(item.enrollmentId)).reduce((total, item) => total + item.class.price, 0);
  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My payments</h1>
        <p className="text-slate-500">Upload monthly payment slips for your enrolled classes</p>
      </div>

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
              Monthly payment is required for class access after day {info.graceDays} of each month.
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
      ) : enrollments.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">You are not enrolled in any classes yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {unpaid.length > 0 && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold text-slate-900 dark:text-white">Pay for multiple classes</h2><p className="text-sm text-slate-500">Select classes and upload one bank slip for {formatMonthLabel(forMonth)}.</p></div>
                <div className="flex gap-2"><Button variant="secondary" onClick={() => setSelected(new Set(unpaid.map((item) => item.enrollmentId)))}>Select all unpaid</Button><Button disabled={!selected.size} onClick={() => setBatchOpen((open) => !open)}>{batchOpen ? 'Hide upload' : `Upload slip (${selected.size})`}</Button></div>
              </div>
              {batchOpen && <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5"><p className="mb-3 text-sm">Total for selected classes: <strong>Rs. {selectedTotal.toLocaleString()}</strong></p><input ref={fileRef} type="file" accept="image/*,application/pdf" className="text-sm" />{error && <p className="mt-2 text-sm text-red-600">{error}</p>}<div className="mt-3 flex gap-2"><Button disabled={uploadMutation.isPending} onClick={() => { const file = fileRef.current?.files?.[0]; if (!file) return setError('Please choose a payment slip file'); uploadMutation.mutate({ enrollmentIds: [...selected], file }); }}>{uploadMutation.isPending ? 'Uploading…' : 'Submit payment'}</Button><Button variant="secondary" onClick={() => setBatchOpen(false)}>Cancel</Button></div></div>}
            </Card>
          )}
          {enrollments.map((item) => {
            const payment = item.payment;
            const canUpload = !payment || payment.status === 'rejected';

            return (
              <Card key={item.enrollmentId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {canUpload && <input type="checkbox" className="mt-1" checked={selected.has(item.enrollmentId)} onChange={() => toggle(item.enrollmentId)} />}
                    <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{item.class.title}</span>
                      <Badge tone={statusTone(item.enrollmentStatus)}>{item.enrollmentStatus}</Badge>
                      {payment ? (
                        <Badge tone={statusTone(payment.status)}>{payment.status}</Badge>
                      ) : (
                        <Badge tone="amber">Not submitted</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">Fee: Rs. {item.class.price.toLocaleString()}</p>
                    {payment && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        Submitted Rs. {payment.amount.toLocaleString()} on{' '}
                        {new Date(payment.createdAt).toLocaleString()}
                        {payment.note && ` · Note: ${payment.note}`}
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
                    {canUpload && info?.payhereEnabled && (
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
                  <th className="pb-2 pr-4 font-semibold">Type</th>
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
                    <td className="py-2 pr-4 capitalize">{p.paymentType}</td>
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
          <p className="text-sm text-slate-500">No payment history yet.</p>
        )}
      </Card>
    </div>
  );
}
