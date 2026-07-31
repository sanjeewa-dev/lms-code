import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { Badge, Button, Card, Input, Spinner, Textarea } from '../components/ui';
import { Icon } from '../components/icons';
import { EmptyState, FormPanel, PageHeader } from '../components/tenant/TenantUi';
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
    <div className="space-y-6">
      <PageHeader
        icon="events"
        tone="sky"
        title="Events"
        subtitle="Upcoming and recent institute events"
        action={
          canManage ? (
            <button
              onClick={() => setShowForm((s) => !s)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              <span className="text-lg leading-none">+</span>
              {showForm ? 'Close' : 'New event'}
            </button>
          ) : undefined
        }
      />

      {showForm && canManage && (
        <FormPanel
          title="Create new event"
          subtitle="Share date, details, and an optional batch label"
          onClose={() => setShowForm(false)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input
              label="Date & time"
              type="datetime-local"
              value={form.eventDate}
              onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
            />
            <Input
              label="Batch label (optional)"
              className="sm:col-span-2"
              value={form.batchLabel}
              onChange={(e) => setForm({ ...form, batchLabel: e.target.value })}
              placeholder="e.g. 2026 A/L"
            />
          </div>
          <Textarea
            label="Details"
            className="mt-3"
            rows={3}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Button
            className="mt-4"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.title || !form.eventDate}
          >
            {createMutation.isPending ? 'Saving...' : 'Create event'}
          </Button>
        </FormPanel>
      )}

      {query.isLoading ? (
        <Spinner />
      ) : query.data && query.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((e) => (
            <Card key={e.id} className="rounded-2xl transition hover:border-brand-200 hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-600">
                  <Icon name="events" width={18} height={18} />
                </span>
                {canManage && (
                  <button
                    className="text-xs font-medium text-red-500 hover:underline"
                    onClick={() => deleteMutation.mutate(e.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
                {new Date(e.eventDate).toLocaleString()}
              </p>
              <h3 className="mt-1 font-semibold text-slate-900 dark:text-white">{e.title}</h3>
              {e.batchLabel && <Badge tone="slate">{e.batchLabel}</Badge>}
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{e.body}</p>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState message="No events yet." />
      )}
    </div>
  );
}
