import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { Badge, Button, Card, Input, Spinner, Textarea } from '../components/ui';
import { Icon } from '../components/icons';
import { EmptyState, FormPanel, PageHeader } from '../components/tenant/TenantUi';
import type { ClassSummary, Notice } from '../api/types';

export default function Notices() {
  const t = useTenantApi();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('notice');
  const canManage = user?.role === 'admin' || user?.role === 'teacher';
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    body: '',
    pinned: false,
    scope: 'all' as 'all' | 'classes',
    classIds: [] as string[],
  });
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const query = useQuery({
    queryKey: ['notices', t.slug],
    queryFn: async () => (await t.get<{ notices: Notice[] }>('/notices')).data.notices,
  });

  const classesQuery = useQuery({
    queryKey: ['classes', t.slug],
    enabled: canManage,
    queryFn: async () => (await t.get<{ classes: ClassSummary[] }>('/classes')).data.classes,
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      (
        await t.post('/notices', {
          title: form.title,
          body: form.body,
          pinned: form.pinned,
          scope: form.scope,
          classIds: form.scope === 'classes' ? form.classIds : undefined,
        })
      ).data,
    onSuccess: () => {
      setShowForm(false);
      setError('');
      setForm({ title: '', body: '', pinned: false, scope: 'all', classIds: [] });
      queryClient.invalidateQueries({ queryKey: ['notices', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['notices-unread', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await t.del(`/notices/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['notices-unread', t.slug] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => (await t.post(`/notices/${id}/read`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['notices-unread', t.slug] });
    },
  });

  const availableClasses = classesQuery.data ?? [];
  const teacherClasses =
    user?.role === 'teacher'
      ? availableClasses.filter((c) => c.teacher?.id === user.id)
      : availableClasses;

  useEffect(() => {
    if (!highlightId || !query.data) return;
    const el = cardRefs.current[highlightId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-brand-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-brand-400'), 2000);
    }
    const notice = query.data.find((n) => n.id === highlightId);
    if (notice && !notice.isRead) {
      markReadMutation.mutate(highlightId);
    }
    setSearchParams({}, { replace: true });
  }, [highlightId, query.data]);

  function toggleClass(classId: string) {
    setForm((f) => ({
      ...f,
      classIds: f.classIds.includes(classId)
        ? f.classIds.filter((id) => id !== classId)
        : [...f.classIds, classId],
    }));
  }

  function viewNotice(notice: Notice) {
    if (!notice.isRead) {
      markReadMutation.mutate(notice.id);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon="notices"
        tone="green"
        title="Announcements"
        subtitle="Notices and updates from your institute"
        action={
          canManage ? (
            <button
              onClick={() => setShowForm((s) => !s)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              <span className="text-lg leading-none">+</span>
              {showForm ? 'Close' : 'New notice'}
            </button>
          ) : undefined
        }
      />

      {showForm && canManage && (
        <FormPanel
          title="Create new notice"
          subtitle="Choose who should see this announcement"
          onClose={() => setShowForm(false)}
        >
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea
            label="Message"
            className="mt-3"
            rows={4}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
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
                  {scope === 'all' ? 'All classes' : 'Specific classes'}
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
                      <input type="checkbox" className="sr-only" checked={form.classIds.includes(c.id)} onChange={() => toggleClass(c.id)} />
                      {c.title}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-slate-700 dark:border-amber-900/40 dark:bg-amber-950/20">
            <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
            Pin to top of the list
          </label>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <Button
            className="mt-4"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.title || (form.scope === 'classes' && form.classIds.length === 0)}
          >
            {createMutation.isPending ? 'Posting...' : 'Post notice'}
          </Button>
        </FormPanel>
      )}

      {query.isLoading ? (
        <Spinner />
      ) : query.data && query.data.length > 0 ? (
        <div className="space-y-3">
          {query.data.map((n) => (
            <div
              key={n.id}
              ref={(el) => { cardRefs.current[n.id] = el; }}
              className="cursor-pointer"
              onClick={() => viewNotice(n)}
            >
              <Card
                className={`rounded-2xl transition hover:border-brand-200 hover:shadow-md ${
                  !n.isRead ? 'border-l-4 border-l-brand-500' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
                    <Icon name="notices" width={18} height={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">{n.title}</span>
                      {n.pinned && <Badge tone="amber">Pinned</Badge>}
                      {!n.isRead && <Badge tone="red">New</Badge>}
                      {n.scope === 'all' ? (
                        <Badge tone="slate">All classes</Badge>
                      ) : (
                        n.classes?.map((c) => (
                          <Badge key={c.id} tone="blue">
                            {c.title}
                          </Badge>
                        ))
                      )}
                    </div>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{n.body}</p>
                    <span className="mt-2 block text-xs text-slate-400">
                      {new Date(n.publishedAt).toLocaleString()}
                    </span>
                  </div>
                  {canManage && (
                    <button
                      className="shrink-0 text-xs font-medium text-red-500 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(n.id);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No announcements yet." />
      )}
    </div>
  );
}
