import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Input, Select, Spinner, Textarea } from '../components/ui';
import type { Batch, ClassSummary } from '../api/types';

export default function Classes() {
  const { user } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const base = `/${slug}`;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', price: '0', batchId: '' });
  const [error, setError] = useState('');
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [newBatch, setNewBatch] = useState({ name: '', year: '' });

  const canCreate = user?.role === 'teacher' || user?.role === 'admin';

  const classesQuery = useQuery({
    queryKey: ['classes', slug],
    queryFn: async () => (await t.get<{ classes: ClassSummary[] }>('/classes')).data.classes,
  });

  const batchesQuery = useQuery({
    queryKey: ['batches', slug],
    enabled: canCreate,
    queryFn: async () => (await t.get<{ batches: Batch[] }>('/batches')).data.batches,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      body.append('title', form.title);
      body.append('description', form.description);
      body.append('price', form.price);
      if (form.batchId) body.append('batchId', form.batchId);
      return (await t.post('/classes', body)).data;
    },
    onSuccess: () => {
      setShowForm(false);
      setForm({ title: '', description: '', price: '0', batchId: '' });
      setError('');
      queryClient.invalidateQueries({ queryKey: ['classes', slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const createBatchMutation = useMutation({
    mutationFn: async () => {
      const payload: { name: string; year?: number } = { name: newBatch.name.trim() };
      if (newBatch.year.trim()) payload.year = Number(newBatch.year);
      return (await t.post<{ batch: Batch }>('/batches', payload)).data.batch;
    },
    onSuccess: async (batch) => {
      setError('');
      setNewBatch({ name: '', year: '' });
      setShowBatchForm(false);
      await queryClient.invalidateQueries({ queryKey: ['batches', slug] });
      setForm((f) => ({ ...f, batchId: batch.id }));
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Classes</h1>
          <p className="text-slate-500 dark:text-slate-400">
            {user?.role === 'teacher' ? 'Classes you teach' : 'Classes you are enrolled in'}
          </p>
        </div>
        {canCreate && <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : 'New class'}</Button>}
      </div>

      {showForm && canCreate && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Create a class</h2>
          <div className="space-y-3">
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Textarea
              label="Description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Price (Rs.) - 0 for free"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
              <div>
                <Select label="Batch (optional)" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}>
                  <option value="">No batch</option>
                  {batchesQuery.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.year ? ` (${b.year})` : ''}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => setShowBatchForm((s) => !s)}
                  className="mt-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  {showBatchForm ? 'Cancel new batch' : '+ Create new batch'}
                </button>
              </div>
            </div>

            {showBatchForm && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">New batch</p>
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    label="Batch name"
                    placeholder="e.g. 2026 A/L"
                    className="min-w-[10rem]"
                    value={newBatch.name}
                    onChange={(e) => setNewBatch({ ...newBatch, name: e.target.value })}
                  />
                  <Input
                    label="Year (optional)"
                    type="number"
                    placeholder="2026"
                    className="w-28"
                    value={newBatch.year}
                    onChange={(e) => setNewBatch({ ...newBatch, year: e.target.value })}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => createBatchMutation.mutate()}
                    disabled={createBatchMutation.isPending || !newBatch.name.trim()}
                  >
                    {createBatchMutation.isPending ? 'Adding...' : 'Add batch'}
                  </Button>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.title}>
              {createMutation.isPending ? 'Creating...' : 'Create class'}
            </Button>
          </div>
        </Card>
      )}

      {classesQuery.isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classesQuery.data?.map((c) => (
            <Link key={c.id} to={`${base}/classes/${c.id}`}>
              <Card className="h-full transition hover:border-brand-300 hover:shadow-md">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white">{c.title}</h3>
                  <span className="whitespace-nowrap text-sm font-medium text-brand-600">
                    {c.price > 0 ? `Rs. ${c.price.toLocaleString()}` : 'Free'}
                  </span>
                </div>
                <p className="line-clamp-3 text-sm text-slate-500">{c.description || 'No description.'}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>{c.teacher?.name}</span>
                  {c.batch && <span>{c.batch.name}</span>}
                </div>
              </Card>
            </Link>
          ))}
          {classesQuery.data?.length === 0 && <p className="text-sm text-slate-500">No classes found.</p>}
        </div>
      )}
    </div>
  );
}
