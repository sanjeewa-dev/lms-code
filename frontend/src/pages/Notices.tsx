import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { Badge, Button, Card, Input, Spinner, Textarea } from '../components/ui';
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Announcements</h1>
          <p className="text-slate-500 dark:text-slate-400">Notices from your institute</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <span className="text-lg leading-none">+</span>
            {showForm ? 'Close' : 'New notice'}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <Card>
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea
            label="Body"
            className="mt-3"
            rows={3}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />

          <div className="mt-3">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Audience</span>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="radio"
                  name="scope"
                  checked={form.scope === 'all'}
                  onChange={() => setForm({ ...form, scope: 'all', classIds: [] })}
                />
                All classes
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="radio"
                  name="scope"
                  checked={form.scope === 'classes'}
                  onChange={() => setForm({ ...form, scope: 'classes' })}
                />
                Specific classes
              </label>
            </div>
          </div>

          {form.scope === 'classes' && (
            <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-white/10">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Select class(es)
              </p>
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
                          ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20'
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

          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
            />
            Pin to top
          </label>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Button
            className="mt-3"
            onClick={() => createMutation.mutate()}
            disabled={
              createMutation.isPending ||
              !form.title ||
              (form.scope === 'classes' && form.classIds.length === 0)
            }
          >
            {createMutation.isPending ? 'Posting...' : 'Post notice'}
          </Button>
        </Card>
      )}

      {query.isLoading ? (
        <Spinner />
      ) : query.data && query.data.length > 0 ? (
        <div className="space-y-2">
          {query.data.map((n) => (
            <div
              key={n.id}
              ref={(el) => { cardRefs.current[n.id] = el; }}
              className="cursor-pointer"
              onClick={() => viewNotice(n)}
            >
              <Card className={`transition ${!n.isRead ? 'border-l-4 border-l-red-500' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{n.title}</span>
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
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{n.body}</p>
                  <span className="mt-1 block text-xs text-slate-400">
                    {new Date(n.publishedAt).toLocaleString()}
                  </span>
                </div>
                {canManage && (
                  <button
                    className="shrink-0 text-xs text-red-600 hover:underline"
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
        <p className="text-sm text-slate-500">No announcements yet.</p>
      )}
    </div>
  );
}
