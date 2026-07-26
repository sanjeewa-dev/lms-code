import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '../../api/client';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Button, Card, Spinner } from '../ui';
import { Icon } from '../icons';
import type { Material } from '../../api/types';

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export function MaterialsTab({ classId, canManage }: { classId: string; canManage: boolean }) {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [form, setForm] = useState({ title: '', description: '' });
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
      return (await t.post(`/classes/${classId}/materials`, body)).data;
    },
    onSuccess: () => {
      setError('');
      setForm({ title: '', description: '' });
      if (fileRef.current) fileRef.current.value = '';
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['materials', t.slug, classId] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      return (
        await t.patch(`/classes/${classId}/materials/${editTarget.id}`, {
          title: form.title.trim(),
          description: form.description.trim(),
        })
      ).data;
    },
    onSuccess: () => {
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ['materials', t.slug, classId] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => t.del(`/classes/${classId}/materials/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['materials', t.slug, classId] }),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const materials = materialsQuery.data ?? [];

  function startEdit(m: Material) {
    setEditTarget(m);
    setForm({ title: m.title, description: m.description });
    setError('');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Materials</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            View-only PDFs and images — students cannot download originals
          </p>
        </div>
        {canManage && !showForm && !editTarget && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <span className="text-lg leading-none">+</span> Upload material
          </button>
        )}
      </div>

      {canManage && showForm && (
        <Card>
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Upload material</h3>
          <p className="mb-3 text-sm text-slate-500">
            PDFs and images are rendered as watermarked, view-only pages. Students cannot download the original file.
          </p>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Title *</span>
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Description</span>
              <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">File (PDF or image) *</span>
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
        <Card>
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Edit: {editTarget.title}</h3>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Title *</span>
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Description</span>
              <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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

      <Card>
        {materialsQuery.isLoading ? (
          <Spinner />
        ) : materials.length === 0 ? (
          <p className="text-sm text-slate-500">No materials uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {materials.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{m.title}</p>
                  {m.description && <p className="mt-0.5 text-xs text-slate-400">{m.description}</p>}
                  <p className="mt-0.5 text-xs text-slate-400">{m.pageCount} page(s) · view-only</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m.fileId && (
                    <Link to={`/${t.slug}/materials/${m.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                  )}
                  {canManage && (
                    <>
                      <button onClick={() => startEdit(m)} className="icon-btn text-brand-600" title="Edit">
                        <Icon name="note" width={16} height={16} />
                      </button>
                      <button
                        onClick={() => { if (window.confirm('Delete this material?')) deleteMutation.mutate(m.id); }}
                        className="icon-btn text-red-500 hover:text-red-700"
                        title="Delete"
                      >
                        <Icon name="trash" width={16} height={16} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
