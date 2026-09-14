import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '../../api/client';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Badge, Button, Card, Spinner, statusTone } from '../ui';
import { showToast } from '../AppToast';
import type { MaterialPaymentItem } from '../../api/types';

export function StudentMaterialPayments({ highlightMaterialId }: { highlightMaterialId?: string | null }) {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [replacingPaymentId, setReplacingPaymentId] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['payments-materials-status', t.slug],
    queryFn: async () =>
      (await t.get<{ items: MaterialPaymentItem[] }>('/payments/materials/status')).data.items,
  });

  useEffect(() => {
    if (!highlightMaterialId) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.add(highlightMaterialId);
      return next;
    });
  }, [highlightMaterialId]);

  const uploadMutation = useMutation({
    mutationFn: async ({ materialIds, file }: { materialIds: string[]; file: File }) => {
      const body = new FormData();
      body.append('slip', file);
      for (const id of materialIds) body.append('materialIds', id);
      return (await t.post('/payments/materials/slip', body)).data;
    },
    onSuccess: (_data, vars) => {
      setSelected(new Set());
      setError('');
      if (fileRef.current) fileRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['payments-materials-status', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['payments-mine', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['materials', t.slug] });
      const count = vars.materialIds.length;
      showToast(
        count === 1
          ? 'Material payment slip submitted. Waiting for approval.'
          : `Payment slip submitted for ${count} materials. Waiting for approval.`
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
      queryClient.invalidateQueries({ queryKey: ['payments-materials-status', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['payments-mine', t.slug] });
      showToast('Payment slip replaced. Waiting for approval.');
    },
    onError: (err) => {
      const msg = apiErrorMessage(err);
      setError(msg);
      showToast(msg, 'error');
    },
  });

  const items = statusQuery.data ?? [];
  const payable = useMemo(
    () => items.filter((i) => i.purchaseStatus === 'none' || i.purchaseStatus === 'rejected'),
    [items]
  );

  const selectedTotal = useMemo(() => {
    let sum = 0;
    for (const item of payable) {
      if (selected.has(item.materialId)) sum += item.price;
    }
    return sum;
  }, [payable, selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ids = [...selected];
    if (!ids.length) {
      showToast('Select at least one material to pay for.', 'error');
      e.target.value = '';
      return;
    }
    uploadMutation.mutate({ materialIds: ids, file });
  }

  function onReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const paymentId = replacingPaymentId;
    e.target.value = '';
    if (!file || !paymentId) return;
    replaceSlipMutation.mutate({ paymentId, file });
  }

  async function viewSlip(paymentId: string) {
    try {
      const blob = await t.fetchBlob(`/payments/${paymentId}/slip`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showToast('Unable to load payment slip', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Material payments</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Select paid tutes/materials, upload one bank slip, and unlock full preview after approval.
        </p>
      </Card>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFileChosen} />
      <input
        ref={replaceFileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={onReplaceFile}
      />

      {statusQuery.isLoading ? (
        <Spinner label="Loading materials..." />
      ) : items.length === 0 ? (
        <Card className="rounded-2xl">
          <p className="text-sm text-slate-500">No paid materials in your classes yet.</p>
        </Card>
      ) : (
        <>
          {payable.length > 0 && (
            <Card className="rounded-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {selected.size} selected · Rs. {selectedTotal.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400">One slip can cover multiple materials</p>
                </div>
                <Button
                  disabled={selected.size === 0 || uploadMutation.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploadMutation.isPending ? 'Uploading…' : 'Upload slip'}
                </Button>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {items.map((item) => {
              const canSelect = item.purchaseStatus === 'none' || item.purchaseStatus === 'rejected';
              const highlighted = highlightMaterialId === item.materialId;
              return (
                <Card
                  key={item.materialId}
                  className={`rounded-2xl ${highlighted ? 'ring-2 ring-brand-400' : ''}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 gap-3">
                      {canSelect && (
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.has(item.materialId)}
                          onChange={() => toggle(item.materialId)}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900 dark:text-white">{item.title}</p>
                          <Badge
                            tone={
                              item.purchaseStatus === 'none'
                                ? 'slate'
                                : statusTone(item.purchaseStatus)
                            }
                          >
                            {item.purchaseStatus === 'none'
                              ? 'Unpaid'
                              : item.purchaseStatus.charAt(0).toUpperCase() + item.purchaseStatus.slice(1)}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-500">{item.classTitle}</p>
                        {item.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-400">{item.description}</p>
                        )}
                        <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                          Rs. {item.price.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.canPreview && (
                        <Link to={`/${t.slug}/materials/${item.materialId}`}>
                          <Button variant="secondary">View material</Button>
                        </Link>
                      )}
                      {item.payment?.status === 'pending' && item.payment.id && (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setReplacingPaymentId(item.payment!.id);
                              replaceFileRef.current?.click();
                            }}
                            disabled={replaceSlipMutation.isPending}
                          >
                            Replace slip
                          </Button>
                          <Button variant="secondary" onClick={() => viewSlip(item.payment!.id)}>
                            View slip
                          </Button>
                        </>
                      )}
                      {item.payment?.status === 'approved' && item.payment.id && (
                        <Button variant="secondary" onClick={() => viewSlip(item.payment!.id)}>
                          View slip
                        </Button>
                      )}
                      {item.purchaseStatus === 'rejected' && item.payment?.note && (
                        <p className="w-full text-xs text-red-600">Note: {item.payment.note}</p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
