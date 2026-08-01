import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, Input, Select, Spinner, Textarea } from '../components/ui';
import { ClassEditModal } from '../components/class/ClassEditModal';
import { showToast } from '../components/AppToast';
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
  const [enrollBusy, setEnrollBusy] = useState<string | null>(null);
  const [enrollMsg, setEnrollMsg] = useState('');
  const [editing, setEditing] = useState<ClassSummary | null>(null);

  const canCreate = user?.role === 'teacher' || user?.role === 'admin';
  const isStudent = user?.role === 'student';

  const classesQuery = useQuery({
    queryKey: ['classes', slug],
    queryFn: async () => (await t.get<{ classes: ClassSummary[] }>('/classes')).data.classes,
  });

  const catalogQuery = useQuery({
    queryKey: ['classes-catalog', slug],
    enabled: isStudent,
    queryFn: async () =>
      (await t.get<{ classes: ClassSummary[] }>('/classes/catalog')).data.classes,
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
      showToast('Class created');
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

  async function requestEnroll(classId: string) {
    setEnrollMsg('');
    setEnrollBusy(classId);
    try {
      await t.post(`/classes/${classId}/enroll`);
      setEnrollMsg('Enrollment requested. Open the class to complete payment if required.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['classes', slug] }),
        queryClient.invalidateQueries({ queryKey: ['classes-catalog', slug] }),
      ]);
    } catch (err) {
      setEnrollMsg(apiErrorMessage(err));
    } finally {
      setEnrollBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Classes</h1>
          <p className="text-slate-500 dark:text-slate-400">
            {user?.role === 'teacher'
              ? 'Classes you teach — the hub for materials, schedules, quizzes, and students'
              : user?.role === 'admin'
                ? 'All institute classes'
                : 'Your enrolled classes — browse and join published classes below'}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : 'New class'}</Button>
        )}
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
                <Select
                  label="Batch (optional)"
                  value={form.batchId}
                  onChange={(e) => setForm({ ...form, batchId: e.target.value })}
                >
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
              <div className="rounded-xl border border-dashed border-slate-200 p-3 dark:border-white/10">
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">New batch</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Name"
                    value={newBatch.name}
                    onChange={(e) => setNewBatch({ ...newBatch, name: e.target.value })}
                  />
                  <Input
                    label="Year (optional)"
                    type="number"
                    value={newBatch.year}
                    onChange={(e) => setNewBatch({ ...newBatch, year: e.target.value })}
                  />
                </div>
                <Button
                  className="mt-3"
                  variant="secondary"
                  disabled={createBatchMutation.isPending || !newBatch.name.trim()}
                  onClick={() => createBatchMutation.mutate()}
                >
                  {createBatchMutation.isPending ? 'Saving...' : 'Save batch'}
                </Button>
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
            <Card
              key={c.id}
              className={`relative h-full overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:shadow-md dark:bg-ink-850 ${
                c.isPublished
                  ? 'border-slate-200 hover:border-brand-300 dark:border-white/5'
                  : 'border-amber-200 opacity-90 dark:border-amber-900/40'
              }`}
            >
              <Link to={`${base}/classes/${c.id}`} className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3 pr-14">
                  <div className="min-w-0">
                    <h3 className="brand-chip inline-flex max-w-full items-center rounded-xl px-3 py-1.5 text-sm font-extrabold leading-snug">
                      <span className="truncate">{c.title}</span>
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {c.batch && <Badge tone="slate">{c.batch.name}</Badge>}
                      {!c.isPublished && <Badge tone="amber">Inactive</Badge>}
                    </div>
                  </div>
                </div>

                <p className="mt-3 line-clamp-3 text-sm text-slate-500 dark:text-slate-400">
                  {c.description || 'No description.'}
                </p>

                <div className="mt-auto pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {c.teacher?.name ? `Teacher: ${c.teacher.name}` : 'Teacher assigned'}
                    </p>
                    <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10">
                      Open class
                    </span>
                  </div>
                </div>
              </Link>
              {canCreate && (
                <div className="absolute right-3 top-3">
                  <Button
                    variant="secondary"
                    className="!px-2.5 !py-1 !text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditing(c);
                    }}
                  >
                    Edit
                  </Button>
                </div>
              )}
            </Card>
          ))}
          {classesQuery.data?.length === 0 && (
            <p className="text-sm text-slate-500">
              {isStudent ? 'You are not enrolled in any classes yet.' : 'No classes found.'}
            </p>
          )}
        </div>
      )}

      {isStudent && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Browse published classes</h2>
            <p className="text-sm text-slate-500">Request enrollment in open classes you are not in yet.</p>
          </div>
          {enrollMsg && (
            <p className="rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
              {enrollMsg}
            </p>
          )}
          {catalogQuery.isLoading ? (
            <Spinner />
          ) : !(catalogQuery.data?.length) ? (
            <p className="text-sm text-slate-500">No other published classes available.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalogQuery.data.map((c) => (
                <Card
                  key={c.id}
                  className="flex h-full flex-col rounded-3xl border border-slate-200 p-5 dark:border-white/5 dark:bg-ink-850"
                >
                  <h3 className="font-semibold text-slate-900 dark:text-white">{c.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.teacher?.name && <Badge tone="slate">{c.teacher.name}</Badge>}
                    {c.batch && <Badge tone="slate">{c.batch.name}</Badge>}
                  </div>
                  <p className="mt-3 line-clamp-3 flex-1 text-sm text-slate-500">
                    {c.description || 'No description.'}
                  </p>
                  <Button
                    className="mt-4"
                    disabled={enrollBusy === c.id}
                    onClick={() => requestEnroll(c.id)}
                  >
                    {enrollBusy === c.id ? 'Requesting…' : 'Request enrollment'}
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <ClassEditModal
        open={Boolean(editing)}
        klass={editing}
        onClose={() => setEditing(null)}
        onSaved={() => showToast('Class updated')}
      />
    </div>
  );
}
