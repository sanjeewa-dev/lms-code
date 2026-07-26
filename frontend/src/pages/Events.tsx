import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { Button, Card, Input, Spinner, Textarea } from '../components/ui';
import type { EventItem } from '../api/types';

export default function Events() {
  const t = useTenantApi();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === 'admin' || user?.role === 'teacher';
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', body: '', eventDate: '', batchLabel: '' });

  const query = useQuery({
    queryKey: ['events', t.slug],
    queryFn: async () => (await t.get<{ events: EventItem[] }>('/events')).data.events,
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      (
        await t.post('/events', {
          title: form.title,
          body: form.body,
          eventDate: form.eventDate,
          batchLabel: form.batchLabel || undefined,
        })
      ).data,
    onSuccess: () => {
      setShowForm(false);
      setError('');
      setForm({ title: '', body: '', eventDate: '', batchLabel: '' });
      queryClient.invalidateQueries({ queryKey: ['events', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await t.del(`/events/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events', t.slug] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Events</h1>
          <p className="text-slate-500 dark:text-slate-400">Upcoming and recent events</p>
        </div>
        {canManage && <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : 'New event'}</Button>}
      </div>

      {showForm && canManage && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input
              label="Date"
              type="datetime-local"
              value={form.eventDate}
              onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
            />
            <Input label="Batch label (optional)" value={form.batchLabel} onChange={(e) => setForm({ ...form, batchLabel: e.target.value })} />
          </div>
          <Textarea
            label="Details"
            className="mt-3"
            rows={2}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Button className="mt-3" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.title || !form.eventDate}>
            {createMutation.isPending ? 'Saving...' : 'Create event'}
          </Button>
        </Card>
      )}

      {query.isLoading ? (
        <Spinner />
      ) : query.data && query.data.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((e) => (
            <Card key={e.id}>
              <div className="text-xs font-medium text-brand-600">
                {new Date(e.eventDate).toLocaleString()}
                {e.batchLabel ? ` · ${e.batchLabel}` : ''}
              </div>
              <div className="font-semibold text-slate-800 dark:text-slate-100">{e.title}</div>
              <p className="text-sm text-slate-500">{e.body}</p>
              {canManage && (
                <button className="mt-2 text-xs text-red-600 hover:underline" onClick={() => deleteMutation.mutate(e.id)}>
                  Delete
                </button>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No events.</p>
      )}
    </div>
  );
}
