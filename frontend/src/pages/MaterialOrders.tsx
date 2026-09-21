import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { Badge, Button, Card, Select, Spinner, statusTone } from '../components/ui';
import { PageHeader } from '../components/tenant/TenantUi';
import { showToast } from '../components/AppToast';
import { downloadMaterialOrdersCsv, groupOrdersByStudent, printShippingLabels } from '../lib/materialOrderExports';
// shipping label styles: black SHIP TO/FROM + gradient dashed cut lines (v2)
import { useInstituteBrand } from '../components/BrandMark';
import type { MaterialOrder, MaterialOrderStatus, UserProfile } from '../api/types';
import type { StudentPackage } from '../lib/materialOrderExports';

type TabId = 'all' | 'active' | 'processing' | 'delivered' | 'cancelled' | 'rejected';

const TABS: { id: TabId; label: string; status: MaterialOrderStatus | null }[] = [
  { id: 'all', label: 'All Orders', status: null },
  { id: 'active', label: 'Active', status: 'active' },
  { id: 'processing', label: 'Processing', status: 'processing' },
  { id: 'delivered', label: 'Delivered', status: 'delivered' },
  { id: 'cancelled', label: 'Cancelled', status: 'cancelled' },
  { id: 'rejected', label: 'Rejected', status: 'rejected' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'approval_pending', label: 'Approval pending' },
  { value: 'active', label: 'Active' },
  { value: 'processing', label: 'Processing' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected' },
];

const inputCls =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5';

function statusLabel(s: MaterialOrderStatus) {
  if (s === 'approval_pending') return 'Approval pending';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MaterialOrders() {
  const t = useTenantApi();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const brand = useInstituteBrand(t.slug);
  const institute = brand.data?.tenant.name ?? t.slug ?? 'Institute';

  const [tab, setTab] = useState<TabId>('all');
  const [statusFilter, setStatusFilter] = useState('approval_pending');
  const [q, setQ] = useState('');
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<'processing' | 'delivered' | 'cancelled'>('processing');
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());

  const lockedStatus = TABS.find((x) => x.id === tab)?.status ?? null;
  const effectiveStatus = lockedStatus ?? (statusFilter === 'all' ? null : statusFilter);
  const isProcessingView = tab === 'processing' || (tab === 'all' && statusFilter === 'processing');

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (effectiveStatus) p.set('status', effectiveStatus);
    if (q.trim()) p.set('q', q.trim());
    if (date) p.set('date', date);
    else {
      if (from) p.set('from', from);
      if (to) p.set('to', to);
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [effectiveStatus, q, date, from, to]);

  const ordersQuery = useQuery({
    queryKey: ['material-orders', t.slug, queryParams],
    queryFn: async () =>
      (await t.get<{ orders: MaterialOrder[] }>(`/material-orders${queryParams}`)).data.orders,
  });

  const orders = ordersQuery.data ?? [];
  const packages = useMemo(
    () => (isProcessingView ? groupOrdersByStudent(orders) : []),
    [isProcessingView, orders]
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['material-orders', t.slug] });
    queryClient.invalidateQueries({ queryKey: ['payments', t.slug] });
  }

  const approveMutation = useMutation({
    mutationFn: async (id: string) => (await t.post(`/material-orders/${id}/approve`, {})).data,
    onSuccess: () => {
      showToast('Order approved');
      invalidate();
    },
    onError: (e) => showToast(apiErrorMessage(e), 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const note = window.prompt('Rejection note (optional)') ?? undefined;
      return (await t.post(`/material-orders/${id}/reject`, { note: note || undefined })).data;
    },
    onSuccess: () => {
      showToast('Order rejected');
      invalidate();
    },
    onError: (e) => showToast(apiErrorMessage(e), 'error'),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const cancelNote =
        status === 'cancelled' ? window.prompt('Cancel note (optional)') ?? undefined : undefined;
      return (await t.patch(`/material-orders/${id}/status`, { status, cancelNote })).data;
    },
    onSuccess: () => {
      showToast('Status updated');
      invalidate();
    },
    onError: (e) => showToast(apiErrorMessage(e), 'error'),
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const ids = [...selected];
      const cancelNote =
        bulkStatus === 'cancelled' ? window.prompt('Cancel note (optional)') ?? undefined : undefined;
      return (await t.post('/material-orders/bulk-status', { ids, status: bulkStatus, cancelNote })).data as {
        results: { id: string; ok: boolean; error?: string }[];
      };
    },
    onSuccess: (data) => {
      const ok = data.results.filter((r) => r.ok).length;
      const fail = data.results.length - ok;
      showToast(fail ? `Updated ${ok}, failed ${fail}` : `Updated ${ok} orders`);
      setSelected(new Set());
      invalidate();
    },
    onError: (e) => showToast(apiErrorMessage(e), 'error'),
  });

  const remarksMutation = useMutation({
    mutationFn: async ({ id, remarks }: { id: string; remarks: string }) =>
      (await t.patch(`/material-orders/${id}`, { remarks })).data,
    onSuccess: () => {
      showToast('Remarks saved');
      invalidate();
    },
    onError: (e) => showToast(apiErrorMessage(e), 'error'),
  });

  function toggleAll() {
    if (isProcessingView) {
      const allIds = packages.flatMap((p) => p.orders.map((o) => o.id));
      if (selected.size === allIds.length && allIds.length > 0) setSelected(new Set());
      else setSelected(new Set(allIds));
      return;
    }
    if (selected.size === orders.length) setSelected(new Set());
    else setSelected(new Set(orders.map((o) => o.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePackage(pkg: StudentPackage) {
    const ids = pkg.orders.map((o) => o.id);
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function packageSelected(pkg: StudentPackage) {
    return pkg.orders.every((o) => selected.has(o.id));
  }

  function toggleExpanded(key: string) {
    setExpandedPackages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function markPackageStatus(pkg: StudentPackage, status: 'delivered' | 'cancelled') {
    const cancelNote =
      status === 'cancelled' ? window.prompt('Cancel note (optional)') ?? undefined : undefined;
    try {
      await t.post('/material-orders/bulk-status', {
        ids: pkg.orders.map((o) => o.id),
        status,
        cancelNote,
      });
      showToast(
        status === 'delivered'
          ? `Marked ${pkg.orders.length} order(s) delivered for ${pkg.recipientName}`
          : `Cancelled ${pkg.orders.length} order(s) for ${pkg.recipientName}`
      );
      invalidate();
    } catch (e) {
      showToast(apiErrorMessage(e), 'error');
    }
  }

  async function ensureAndPrint(orderList: MaterialOrder[]) {
    if (!orderList.length) {
      showToast('No orders to print', 'error');
      return;
    }
    try {
      const ensured = (
        await t.post<{ orders: MaterialOrder[] }>('/material-orders/ensure-labels', {
          ids: orderList.map((o) => o.id),
        })
      ).data.orders;
      invalidate();

      let fromName = institute;
      let fromPhone: string | null = null;
      let fromAddress: string | null = null;
      let photoDataUrl: string | null = null;
      let photoOnly = false;

      async function blobToDataUrl(blob: Blob) {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      }

      if (user?.role === 'teacher') {
        const profile = (await t.get<{ profile: UserProfile }>('/profile')).data.profile;
        fromName = profile.name || fromName;
        fromPhone = profile.phone ?? null;
        fromAddress = profile.address ?? null;
        photoOnly = Boolean(profile.shippingLabelPhotoOnly);
        if (profile.shippingLabelPhotoUrl) {
          try {
            photoDataUrl = await blobToDataUrl(await t.fetchBlob('/profile/shipping-label-photo'));
          } catch {
            showToast('Could not load shipping label photo — printing text labels', 'error');
          }
        }
        if (!photoDataUrl && !fromAddress?.trim()) {
          showToast('Add your sender address or upload a shipping label photo in Profile', 'error');
          return;
        }
        if (photoOnly && !photoDataUrl) {
          showToast('Upload a shipping label photo in Profile, or turn off photo-only mode', 'error');
          return;
        }
      } else {
        const teacher =
          ensured
            .flatMap((o) => o.items)
            .map((i) => i.teacher)
            .find((x) => x && (x.address?.trim() || x.shippingLabelPhotoFileId)) ||
          orderList
            .flatMap((o) => o.items)
            .map((i) => i.teacher)
            .find((x) => x && (x.address?.trim() || x.shippingLabelPhotoFileId));
        if (teacher) {
          fromName = teacher.name || fromName;
          fromPhone = teacher.phone;
          fromAddress = teacher.address;
          photoOnly = Boolean(teacher.shippingLabelPhotoOnly);
          if (teacher.shippingLabelPhotoFileId) {
            try {
              photoDataUrl = await blobToDataUrl(
                await t.fetchBlob(`/material-orders/teachers/${teacher.id}/shipping-label-photo`)
              );
            } catch {
              showToast('Could not load teacher shipping label photo — printing text labels', 'error');
            }
          }
        }
        if (!photoDataUrl && !fromAddress?.trim()) {
          showToast(
            'Class teacher needs a sender address or shipping label photo on their Profile.',
            'error'
          );
          return;
        }
        if (photoOnly && !photoDataUrl) {
          showToast(
            'Class teacher enabled photo-only labels but has not uploaded a photo yet.',
            'error'
          );
          return;
        }
      }

      const result = await printShippingLabels(ensured.length ? ensured : orderList, {
        name: fromName,
        phone: fromPhone,
        address: fromAddress,
        photoDataUrl,
        photoOnly,
      });
      if (!result.ok) {
        showToast(
          result.reason === 'popup_blocked'
            ? 'Pop-up blocked — allow pop-ups for this site to print labels'
            : 'No shipping labels available to print',
          'error'
        );
        return;
      }
      showToast(
        photoDataUrl
          ? `Opened photo labels (${result.count} package${result.count === 1 ? '' : 's'})`
          : `Opened print dialog for ${result.count} package${result.count === 1 ? '' : 's'}`
      );
    } catch (e) {
      showToast(apiErrorMessage(e), 'error');
    }
  }

  async function printPackage(pkg: StudentPackage) {
    await ensureAndPrint(pkg.orders);
  }

  async function viewSlip(orderId: string) {
    try {
      const blob = await t.fetchBlob(`/material-orders/${orderId}/slip`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showToast('Unable to load slip', 'error');
    }
  }

  function exportSelectedOrAll() {
    const rows = selected.size ? orders.filter((o) => selected.has(o.id)) : orders;
    if (!rows.length) {
      showToast('No orders to export', 'error');
      return;
    }
    downloadMaterialOrdersCsv(rows, institute);
  }

  async function printLabels() {
    const rows = selected.size
      ? orders.filter((o) => selected.has(o.id))
      : orders.filter((o) => o.status === 'processing');
    await ensureAndPrint(rows);
  }

  function rowActions(o: MaterialOrder) {
    const busy =
      approveMutation.isPending ||
      rejectMutation.isPending ||
      statusMutation.isPending;
    const sm = 'px-3 py-1.5 text-xs';

    if (o.status === 'approval_pending') {
      return (
        <>
          <Button className={sm} onClick={() => viewSlip(o.id)}>
            View slip
          </Button>
          <Button className={sm} disabled={busy} onClick={() => approveMutation.mutate(o.id)}>
            Approve
          </Button>
          <Button className={sm} variant="secondary" disabled={busy} onClick={() => rejectMutation.mutate(o.id)}>
            Reject
          </Button>
        </>
      );
    }
    if (o.status === 'active') {
      return (
        <>
          <Button
            className={sm}
            disabled={busy}
            onClick={() => statusMutation.mutate({ id: o.id, status: 'processing' })}
          >
            To Processing
          </Button>
          <Button
            className={sm}
            variant="secondary"
            disabled={busy}
            onClick={() => statusMutation.mutate({ id: o.id, status: 'cancelled' })}
          >
            Cancel
          </Button>
        </>
      );
    }
    if (o.status === 'processing') {
      return (
        <>
          <Button
            className={sm}
            disabled={busy}
            onClick={() => statusMutation.mutate({ id: o.id, status: 'delivered' })}
          >
            Mark Delivered
          </Button>
          <Button
            className={sm}
            variant="secondary"
            disabled={busy}
            onClick={() => statusMutation.mutate({ id: o.id, status: 'cancelled' })}
          >
            Cancel
          </Button>
        </>
      );
    }
    return null;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon="payments"
        tone="amber"
        title="Tute Orders"
        subtitle={
          user?.role === 'teacher'
            ? 'Orders for materials in your classes'
            : 'Review slips, fulfill and ship material orders'
        }
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setSelected(new Set());
              if (item.id === 'all') setStatusFilter('approval_pending');
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              tab === item.id
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card className="rounded-2xl">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[160px] flex-1">
            <span className="mb-1 block text-xs font-medium text-slate-500">Search</span>
            <input
              className={`w-full ${inputCls}`}
              placeholder="Order no, name, phone, email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          {tab === 'all' && (
            <div className="min-w-[180px]">
              <Select
                label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Exact date</span>
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (e.target.value) {
                  setFrom('');
                  setTo('');
                }
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">From</span>
            <input
              type="date"
              className={inputCls}
              value={from}
              disabled={Boolean(date)}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">To</span>
            <input
              type="date"
              className={inputCls}
              value={to}
              disabled={Boolean(date)}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Button
            variant="secondary"
            onClick={() => {
              setQ('');
              setDate('');
              setFrom('');
              setTo('');
              if (tab === 'all') setStatusFilter('approval_pending');
            }}
          >
            Reset
          </Button>
        </div>
      </Card>

      {selected.size > 0 && (
        <Card className="rounded-2xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {selected.size} selected
            </span>
            <Select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as typeof bulkStatus)}>
              <option value="processing">Processing</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Button disabled={bulkMutation.isPending} onClick={() => bulkMutation.mutate()}>
              Apply status
            </Button>
            <Button variant="secondary" onClick={exportSelectedOrAll}>
              Export Excel
            </Button>
            {(tab === 'processing' || statusFilter === 'processing') && (
              <Button variant="secondary" onClick={() => void printLabels()}>
                Print labels (1 per student)
              </Button>
            )}
          </div>
        </Card>
      )}

      {(tab === 'processing' || (tab === 'all' && statusFilter === 'processing')) && selected.size === 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={exportSelectedOrAll}>
            Export Excel
          </Button>
          <Button variant="secondary" onClick={() => void printLabels()}>
            Print labels (1 per student)
          </Button>
          {packages.length > 0 && (
            <p className="text-sm text-slate-500">
              {packages.length} package{packages.length === 1 ? '' : 's'} · {orders.length} order
              {orders.length === 1 ? '' : 's'}
              {packages.some((p) => p.orders.length > 1)
                ? ' · same-student orders are combined'
                : ''}
            </p>
          )}
        </div>
      )}

      {ordersQuery.isLoading ? (
        <Spinner label="Loading orders…" />
      ) : orders.length === 0 ? (
        <Card className="rounded-2xl">
          <p className="text-sm text-slate-500">No orders match these filters.</p>
        </Card>
      ) : isProcessingView ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-1">
            <input
              type="checkbox"
              checked={
                packages.length > 0 &&
                packages.every((p) => packageSelected(p))
              }
              onChange={toggleAll}
            />
            <span className="text-sm text-slate-500">Select all packages</span>
          </div>
          {packages.map((pkg) => {
            const multi = pkg.orders.length > 1;
            const expanded = expandedPackages.has(pkg.key) || !multi;
            const checked = packageSelected(pkg);
            return (
              <Card
                key={pkg.key}
                className={`rounded-2xl border-l-4 p-0 ${
                  multi ? 'border-l-brand-500' : 'border-l-slate-200 dark:border-l-white/10'
                } ${checked ? 'ring-2 ring-brand-400/40' : ''}`}
              >
                <div className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
                  <input
                    type="checkbox"
                    className="mt-1.5"
                    checked={checked}
                    onChange={() => togglePackage(pkg)}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                        {pkg.recipientName}
                      </h3>
                      <Badge tone={multi ? 'blue' : 'slate'}>
                        {multi ? `${pkg.orders.length} orders · 1 package` : '1 order'}
                      </Badge>
                      {pkg.primaryLabelNo && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300">
                          {pkg.primaryLabelNo}
                          {pkg.shippingLabelNos.length > 1 ? ` +${pkg.shippingLabelNos.length - 1}` : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span>{pkg.phone}</span>
                      <span className="truncate">{pkg.email}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{pkg.address}</p>
                    {pkg.grade && (
                      <p className="text-xs text-slate-400">Grade / batch: {pkg.grade}</p>
                    )}
                    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Materials in this package
                      </p>
                      <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                        {pkg.materials.join(', ') || '—'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Classes: {pkg.relatedClasses.join(', ') || '—'}
                      </p>
                    </div>

                    {multi && (
                      <button
                        type="button"
                        className="text-sm font-medium text-brand-600 hover:underline"
                        onClick={() => toggleExpanded(pkg.key)}
                      >
                        {expandedPackages.has(pkg.key) ? 'Hide orders' : `Show ${pkg.orders.length} orders`}
                      </button>
                    )}

                    {expanded && (
                      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-white/5 dark:border-white/10">
                        {pkg.orders.map((o) => (
                          <li
                            key={o.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                          >
                            <div>
                              <span className="font-medium text-slate-800 dark:text-slate-100">
                                {o.orderNo}
                              </span>
                              {o.shippingLabelNo && (
                                <span className="ml-2 font-mono text-xs text-slate-400">
                                  {o.shippingLabelNo}
                                </span>
                              )}
                              <p className="text-xs text-slate-500">{o.materials.join(', ')}</p>
                            </div>
                            <span className="text-xs text-slate-400">
                              {new Date(o.createdAt).toLocaleDateString()}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 sm:items-end">
                    <Button
                      className="px-3 py-1.5 text-xs"
                      onClick={() => void printPackage(pkg)}
                    >
                      Print 1 label
                    </Button>
                    <Button
                      className="px-3 py-1.5 text-xs"
                      variant="secondary"
                      disabled={statusMutation.isPending || bulkMutation.isPending}
                      onClick={() => void markPackageStatus(pkg, 'delivered')}
                    >
                      Mark package delivered
                    </Button>
                    <Button
                      className="px-3 py-1.5 text-xs"
                      variant="secondary"
                      disabled={statusMutation.isPending || bulkMutation.isPending}
                      onClick={() => void markPackageStatus(pkg, 'cancelled')}
                    >
                      Cancel package
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-x-auto rounded-2xl p-0">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-white/10 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === orders.length && orders.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Materials</th>
                <th className="px-4 py-3">Classes</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 dark:border-white/5">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleOne(o.id)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{o.orderNo}</div>
                    {o.shippingLabelNo && (
                      <div className="text-xs text-slate-500">{o.shippingLabelNo}</div>
                    )}
                    <div className="text-xs text-slate-400">{o.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.recipientName}</div>
                    <div className="max-w-[180px] truncate text-xs text-slate-500">{o.address}</div>
                    <div className="text-xs text-slate-400">{o.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{o.materials.join(', ')}</td>
                  <td className="px-4 py-3 text-xs">{o.relatedClasses.join(', ')}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(o.status)}>{statusLabel(o.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {rowActions(o)}
                      <Button
                        className="px-3 py-1.5 text-xs"
                        variant="secondary"
                        onClick={() => {
                          const next = window.prompt('Remarks', o.remarks ?? '') ?? null;
                          if (next === null) return;
                          remarksMutation.mutate({ id: o.id, remarks: next });
                        }}
                      >
                        Remarks
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

