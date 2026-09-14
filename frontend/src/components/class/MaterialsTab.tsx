import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiErrorMessage, authFetchBlob } from '../../api/client';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Badge, Button, Card, Spinner } from '../ui';
import { Icon } from '../icons';
import { showToast } from '../AppToast';
import type { Material, MaterialPurchaseStatus } from '../../api/types';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:ring-brand-900/40';

function purchaseTone(status: MaterialPurchaseStatus | undefined): 'green' | 'amber' | 'red' | 'slate' {
  if (status === 'approved') return 'green';
  if (status === 'pending') return 'amber';
  if (status === 'rejected') return 'red';
  return 'slate';
}

function purchaseLabel(status: MaterialPurchaseStatus | undefined, price: number) {
  if (price <= 0) return 'Free';
  if (status === 'approved') return 'Paid';
  if (status === 'pending') return 'Pending';
  if (status === 'rejected') return 'Rejected';
  return 'Unpaid';
}

function MaterialThumb({ materialId, locked }: { materialId: string; locked?: boolean }) {
  const { slug } = useTenantApi();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!slug || !materialId) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setFailed(false);
    setUrl(null);

    (async () => {
      try {
        const blob = await authFetchBlob(`/t/${slug}/materials/${materialId}/thumbnail`);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setUrl(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [materialId, slug]);

  return (
    <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-white/5">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          className={`h-full w-full object-cover ${locked ? 'opacity-70' : ''}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-blue-600">
          <Icon name="classes" width={18} height={18} />
        </div>
      )}
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/35">
          <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
            Locked
          </span>
        </div>
      )}
    </div>
  );
}

export function MaterialsTab({ classId, canManage }: { classId: string; canManage: boolean }) {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [form, setForm] = useState({ title: '', description: '', price: '0' });
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const materialsQuery = useQuery({
    queryKey: ['materials', t.slug, classId],
    queryFn: async () =>
      (await t.get<{ materials: Material[] }>(`/classes/${classId}/materials`)).data.materials.filter(
        (m) => m.kind === 'material'
      ),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('Please choose a file');
      const body = new FormData();
      body.append('file', file);
      body.append('title', form.title.trim());
      body.append('description', form.description.trim());
      body.append('kind', 'material');
      body.append('price', String(Number(form.price) || 0));
      return (await t.post(`/classes/${classId}/materials`, body)).data;
    },
    onSuccess: () => {
      setError('');
      setForm({ title: '', description: '', price: '0' });
      if (fileRef.current) fileRef.current.value = '';
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['materials', t.slug, classId] });
      showToast('Material uploaded.');
    },
    onError: (err) => {
      const msg = apiErrorMessage(err);
      setError(msg);
      showToast(msg, 'error');
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      return (
        await t.patch(`/classes/${classId}/materials/${editTarget.id}`, {
          title: form.title.trim(),
          description: form.description.trim(),
          price: Number(form.price) || 0,
        })
      ).data;
    },
    onSuccess: () => {
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ['materials', t.slug, classId] });
      showToast('Material updated.');
    },
    onError: (err) => {
      const msg = apiErrorMessage(err);
      setError(msg);
      showToast(msg, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => t.del(`/classes/${classId}/materials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials', t.slug, classId] });
      showToast('Material deleted.');
    },
    onError: (err) => {
      const msg = apiErrorMessage(err);
      setError(msg);
      showToast(msg, 'error');
    },
  });

  const materials = materialsQuery.data ?? [];

  function startEdit(m: Material) {
    setEditTarget(m);
    setForm({
      title: m.title,
      description: m.description,
      price: String(m.price ?? 0),
    });
    setError('');
    setShowForm(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-white/5 dark:bg-ink-850">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Materials</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Free or paid tutes — paid items unlock after slip approval
          </p>
        </div>
        {canManage && !showForm && !editTarget && (
          <button
            onClick={() => {
              setForm({ title: '', description: '', price: '0' });
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <span className="text-lg leading-none">+</span> Upload material
          </button>
        )}
      </div>

      {canManage && showForm && (
        <Card className="rounded-2xl">
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Upload material</h3>
          <p className="mb-3 text-sm text-slate-500">
            Set amount to 0 for free access. Amount greater than 0 requires student payment before full preview.
          </p>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Title *</span>
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</span>
              <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Amount (Rs.)</span>
              <input
                className={inputCls}
                type="number"
                min={0}
                step="1"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
              <span className="mt-1 block text-xs text-slate-400">0 = free material</span>
            </label>
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">File (PDF or image) *</span>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="text-sm" />
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !form.title.trim()}>
              {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
            </Button>
            <Button variant="secondary" onClick={() => { setShowForm(false); setError(''); }}>Cancel</Button>
          </div>
        </Card>
      )}

      {canManage && editTarget && (
        <Card className="rounded-2xl">
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Edit: {editTarget.title}</h3>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Title *</span>
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</span>
              <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Amount (Rs.)</span>
              <input
                className={inputCls}
                type="number"
                min={0}
                step="1"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </label>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending || !form.title.trim()}>
              {editMutation.isPending ? 'Saving...' : 'Update'}
            </Button>
            <Button variant="secondary" onClick={() => { setEditTarget(null); setError(''); }}>Cancel</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden rounded-2xl p-0">
        {materialsQuery.isLoading ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : materials.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No materials uploaded yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {materials.map((m) => {
              const price = Number(m.price ?? 0);
              const locked = !canManage && price > 0 && m.canPreview === false;
              return (
                <li
                  key={m.id}
                  className="flex items-start justify-between gap-3 px-5 py-4 transition hover:bg-slate-50/80 dark:hover:bg-white/5"
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    {m.fileId ? (
                      <MaterialThumb materialId={m.id} locked={locked} />
                    ) : (
                      <div className="grid h-20 w-16 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-600">
                        <Icon name="classes" width={18} height={18} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-slate-800 dark:text-slate-200">{m.title}</p>
                        {price > 0 ? (
                          <Badge tone="amber">Rs. {price.toLocaleString()}</Badge>
                        ) : (
                          <Badge tone="green">Free</Badge>
                        )}
                        {!canManage && price > 0 && (
                          <Badge tone={purchaseTone(m.purchaseStatus)}>
                            {purchaseLabel(m.purchaseStatus, price)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {m.pageCount} page(s) · view-only
                        {locked ? ' · preview locked until payment approved' : ''}
                      </p>
                      {m.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                          {m.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                    {m.fileId && !locked && (
                      <Link to={`/${t.slug}/materials/${m.id}`}>
                        <Button variant="secondary">View</Button>
                      </Link>
                    )}
                    {locked && (
                      <Link to={`/${t.slug}/payments?section=materials&materialId=${m.id}`}>
                        <Button>
                          {m.purchaseStatus === 'pending'
                            ? 'Pending review'
                            : m.purchaseStatus === 'rejected'
                              ? 'Pay again'
                              : 'Pay to unlock'}
                        </Button>
                      </Link>
                    )}
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(m)}
                          className="icon-btn text-brand-600"
                          title="Edit"
                          aria-label="Edit material"
                        >
                          <Icon name="note" width={16} height={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Delete this material?')) deleteMutation.mutate(m.id);
                          }}
                          className="icon-btn text-red-500 hover:text-red-700"
                          title="Delete"
                          aria-label="Delete material"
                        >
                          <Icon name="trash" width={16} height={16} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
