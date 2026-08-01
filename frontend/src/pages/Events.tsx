import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { Badge, Button, Card, Input, Spinner, Textarea } from '../components/ui';
import { Icon } from '../components/icons';
import { EmptyState, FormPanel, PageHeader } from '../components/tenant/TenantUi';
import type { ClassSummary, EventItem } from '../api/types';

type EventForm = {
  title: string;
  body: string;
  eventDate: string;
  batchLabel: string;
  scope: 'all' | 'classes';
  classIds: string[];
  isActive: boolean;
};

const emptyForm = (): EventForm => ({
  title: '',
  body: '',
  eventDate: '',
  batchLabel: '',
  scope: 'all',
  classIds: [],
  isActive: true,
});

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formFromEvent(e: EventItem): EventForm {
  return {
    title: e.title,
    body: e.body ?? '',
    eventDate: toLocalInput(e.eventDate),
    batchLabel: e.batchLabel ?? '',
    scope: e.scope === 'classes' ? 'classes' : 'all',
    classIds: e.classes?.map((c) => c.id) ?? [],
    isActive: e.isActive !== false,
  };
}

export default function Events() {
  const t = useTenantApi();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === 'admin' || user?.role === 'teacher';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<EventForm>(emptyForm);

  const query = useQuery({
    queryKey: ['events', t.slug],
    queryFn: async () => (await t.get<{ events: EventItem[] }>('/events')).data.events,
  });

  const classesQuery = useQuery({
    queryKey: ['classes', t.slug],
    enabled: canManage,
    queryFn: async () => (await t.get<{ classes: ClassSummary[] }>('/classes')).data.classes,
  });

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setError('');
    setForm(emptyForm());
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setShowForm(true);
  }

  function openEdit(e: EventItem) {
    setEditingId(e.id);
    setForm(formFromEvent(e));
    setError('');
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        body: form.body,
        eventDate: form.eventDate,
        batchLabel: form.batchLabel || null,
        scope: form.scope,
        classIds: form.scope === 'classes' ? form.classIds : undefined,
        isActive: form.isActive,
      };
      if (editingId) {
        return (await t.patch(`/events/${editingId}`, payload)).data;
      }
      return (await t.post('/events', payload)).data;
    },
    onSuccess: () => {
      closeForm();
      queryClient.invalidateQueries({ queryKey: ['events', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (e: EventItem) => {
      const payload = {
        title: e.title,
        body: e.body,
        eventDate: e.eventDate,
        batchLabel: e.batchLabel ?? null,
        scope: e.scope === 'classes' ? 'classes' : 'all',
        classIds: e.scope === 'classes' ? e.classes?.map((c) => c.id) : undefined,
        isActive: e.isActive === false,
      };
      return (await t.patch(`/events/${e.id}`, payload)).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events', t.slug] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await t.del(`/events/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events', t.slug] }),
  });

  const availableClasses = classesQuery.data ?? [];
  const teacherClasses =
    user?.role === 'teacher'
      ? availableClasses.filter((c) => c.teacher?.id === user.id)
      : availableClasses;

  function toggleClass(classId: string) {
    setForm((f) => ({
      ...f,
      classIds: f.classIds.includes(classId)
        ? f.classIds.filter((id) => id !== classId)
        : [...f.classIds, classId],
    }));
  }

  const isEditing = Boolean(editingId);

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
              onClick={() => (showForm && !isEditing ? closeForm() : openCreate())}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              <span className="text-lg leading-none">+</span>
              {showForm && !isEditing ? 'Close' : 'New event'}
            </button>
          ) : undefined
        }
      />

      {showForm && canManage && (
        <FormPanel
          title={isEditing ? 'Edit event' : 'Create new event'}
          subtitle={isEditing ? 'Update details, audience, or active status' : 'Choose who should see this event'}
          onClose={closeForm}
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
            className="mt-3 min-h-[10rem]"
            rows={8}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Add full event details, location, agenda, or notes…"
          />

          <div className="mt-4">
            <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Audience</span>
            <div className="flex flex-wrap gap-2">
              {(['all', 'classes'] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setForm({ ...form, scope, classIds: scope === 'all' ? [] : form.classIds })}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    form.scope === scope
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10'
                  }`}
                >
                  {scope === 'all' ? 'All students' : 'Specific classes'}
                </button>
              ))}
            </div>
          </div>

          {form.scope === 'classes' && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Select class(es)</p>
              {classesQuery.isLoading ? (
                <Spinner />
              ) : teacherClasses.length === 0 ? (
                <p className="text-sm text-slate-500">No classes available.</p>
              ) : (
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                  {teacherClasses.map((c) => (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                        form.classIds.includes(c.id)
                          ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-900/30'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={form.classIds.includes(c.id)}
                        onChange={() => toggleClass(c.id)}
                      />
                      {c.title}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            <span>
              <span className="block font-medium text-slate-800 dark:text-slate-100">Event is active</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                When off, students cannot see this event. Staff can still view and edit it.
              </span>
            </span>
          </label>

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending ||
                !form.title ||
                !form.eventDate ||
                (form.scope === 'classes' && form.classIds.length === 0)
              }
            >
              {saveMutation.isPending ? 'Saving...' : isEditing ? 'Save changes' : 'Create event'}
            </Button>
            {isEditing && (
              <Button variant="secondary" onClick={closeForm}>
                Cancel
              </Button>
            )}
          </div>
        </FormPanel>
      )}

      {query.isLoading ? (
        <Spinner />
      ) : query.data && query.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((e) => (
            <Card
              key={e.id}
              className={`rounded-2xl transition hover:border-brand-200 hover:shadow-md ${
                e.isActive === false ? 'border-amber-200 opacity-90 dark:border-amber-900/40' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-600">
                  <Icon name="events" width={18} height={18} />
                </span>
                {canManage && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      className="text-xs font-medium text-brand-600 hover:underline"
                      onClick={() => openEdit(e)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-xs font-medium text-slate-500 hover:underline"
                      disabled={toggleActiveMutation.isPending}
                      onClick={() => toggleActiveMutation.mutate(e)}
                    >
                      {e.isActive === false ? 'Activate' : 'Deactivate'}
                    </button>
                    <button
                      className="text-xs font-medium text-red-500 hover:underline"
                      onClick={() => deleteMutation.mutate(e.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
                {new Date(e.eventDate).toLocaleString()}
              </p>
              <h3 className="mt-1 font-semibold text-slate-900 dark:text-white">{e.title}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.isActive === false && <Badge tone="amber">Inactive</Badge>}
                {e.batchLabel && <Badge tone="slate">{e.batchLabel}</Badge>}
                {e.scope === 'all' ? (
                  <Badge tone="slate">All students</Badge>
                ) : (
                  e.classes?.map((c) => (
                    <Badge key={c.id} tone="blue">
                      {c.title}
                    </Badge>
                  ))
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-500 dark:text-slate-400">{e.body}</p>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState message="No events yet." />
      )}
    </div>
  );
}
