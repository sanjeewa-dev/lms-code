import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { Button, Card, Input, Select, Spinner, Textarea } from '../components/ui';
import { VideoLessonCard, VideoPlayerModal } from '../components/VideoPlayerModal';
import type { Batch, ClassSummary, ClassTopic, VideoLesson } from '../api/types';

type ViewMode = 'class' | 'playlist';

type VideoForm = {
  title: string;
  description: string;
  provider: string;
  videoUrl: string;
  visibility: string;
  classId: string;
  batchId: string;
  topicId: string;
  newTopicTitle: string;
  playlistOrder: string;
};

const emptyForm = (): VideoForm => ({
  title: '',
  description: '',
  provider: 'youtube',
  videoUrl: '',
  visibility: 'all',
  classId: '',
  batchId: '',
  topicId: '',
  newTopicTitle: '',
  playlistOrder: '1',
});

function formFromVideo(v: VideoLesson): VideoForm {
  return {
    title: v.title,
    description: v.description ?? '',
    provider: v.provider === 'upload' ? 'url' : v.provider,
    videoUrl: v.videoUrl ?? '',
    visibility: v.visibility,
    classId: v.classId ?? '',
    batchId: v.batchId ?? '',
    topicId: v.topicId ?? '',
    newTopicTitle: '',
    playlistOrder: String(v.playlistOrder && v.playlistOrder > 0 ? v.playlistOrder : 1),
  };
}

function nextPlaylistOrderValue(videos: VideoLesson[], topicId: string, classId: string) {
  if (topicId === '__new__' || (!topicId && !classId)) return '1';
  const pool =
    topicId && topicId !== '__new__'
      ? videos.filter((v) => v.topicId === topicId)
      : videos.filter((v) => v.classId === classId && !v.topicId);
  const max = pool.reduce((m, v) => Math.max(m, v.playlistOrder ?? 0), 0);
  return String(max + 1);
}

function sortByPlaylistOrder(list: VideoLesson[]) {
  return [...list].sort((a, b) => {
    const ao = a.playlistOrder ?? 0;
    const bo = b.playlistOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export default function Videos() {
  const t = useTenantApi();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === 'admin' || user?.role === 'teacher';
  const [view, setView] = useState<ViewMode>('class');
  const [filterClassId, setFilterClassId] = useState('');
  const [filterTopicId, setFilterTopicId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeVideo, setActiveVideo] = useState<VideoLesson | null>(null);
  const [form, setForm] = useState<VideoForm>(emptyForm);

  const videosQuery = useQuery({
    queryKey: ['videos', t.slug],
    queryFn: async () => (await t.get<{ videos: VideoLesson[] }>('/video-lessons')).data.videos,
  });

  const classesQuery = useQuery({
    queryKey: ['classes', t.slug],
    queryFn: async () => (await t.get<{ classes: ClassSummary[] }>('/classes')).data.classes,
  });

  const batchesQuery = useQuery({
    queryKey: ['batches', t.slug],
    enabled: canManage,
    queryFn: async () => (await t.get<{ batches: Batch[] }>('/batches')).data.batches,
  });

  const topicClassId = form.visibility === 'class' ? form.classId : '';

  const topicsQuery = useQuery({
    queryKey: ['class-topics', t.slug, topicClassId],
    enabled: Boolean(topicClassId),
    queryFn: async () =>
      (await t.get<{ topics: ClassTopic[] }>(`/classes/${topicClassId}/topics`)).data.topics,
  });

  const playlistTopicsQuery = useQuery({
    queryKey: ['class-topics-all', t.slug],
    enabled: view === 'playlist' || canManage,
    queryFn: async () =>
      (await t.get<{ topics: ClassTopic[] }>('/class-topics')).data.topics,
  });

  const isEditing = Boolean(editingId);

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

  function openEdit(v: VideoLesson) {
    setEditingId(v.id);
    setForm(formFromVideo(v));
    setError('');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function applyNextOrder(next: Partial<VideoForm> & { classId?: string; topicId?: string }) {
    const classId = next.classId ?? form.classId;
    const topicId = next.topicId ?? form.topicId;
    setForm({
      ...form,
      ...next,
      playlistOrder: isEditing
        ? form.playlistOrder
        : nextPlaylistOrderValue(videosQuery.data ?? [], topicId, classId),
    });
  }

  function buildPayload() {
    return {
      title: form.title,
      description: form.description,
      provider: form.provider,
      videoUrl: form.videoUrl,
      visibility: form.visibility,
      classId: form.visibility === 'class' ? form.classId : undefined,
      batchId: form.visibility === 'batch' ? form.batchId : undefined,
      topicId:
        form.visibility === 'class' && form.topicId && form.topicId !== '__new__'
          ? form.topicId
          : undefined,
      newTopicTitle:
        form.visibility === 'class' &&
        (form.topicId === '__new__' || (!form.topicId && form.newTopicTitle.trim()))
          ? form.newTopicTitle.trim()
          : undefined,
      playlistOrder:
        form.visibility === 'class' && form.playlistOrder
          ? Number(form.playlistOrder)
          : undefined,
    };
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (editingId) {
        return (await t.patch(`/video-lessons/${editingId}`, payload)).data;
      }
      return (await t.post('/video-lessons', payload)).data;
    },
    onSuccess: () => {
      closeForm();
      queryClient.invalidateQueries({ queryKey: ['videos', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['class-topics', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['class-topics-all', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await t.del(`/video-lessons/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['class-topics', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['class-topics-all', t.slug] });
    },
  });

  const classes = classesQuery.data ?? [];
  const videos = videosQuery.data ?? [];
  const allTopics = playlistTopicsQuery.data ?? [];

  const classVideos = useMemo(() => {
    if (!filterClassId) return [] as VideoLesson[];
    return sortByPlaylistOrder(
      videos.filter((v) => v.classId === filterClassId || v.topic?.classId === filterClassId)
    );
  }, [videos, filterClassId]);

  const topicVideos = useMemo(() => {
    if (!filterTopicId) return [] as VideoLesson[];
    return sortByPlaylistOrder(videos.filter((v) => v.topicId === filterTopicId));
  }, [videos, filterTopicId]);

  const selectedTopic = allTopics.find((topic) => topic.id === filterTopicId);

  const formValid =
    Boolean(form.title && form.videoUrl) &&
    !(form.visibility === 'class' && !form.classId) &&
    !(form.visibility === 'batch' && !form.batchId) &&
    !(form.topicId === '__new__' && !form.newTopicTitle.trim());

  function renderCard(v: VideoLesson) {
    return (
      <VideoLessonCard
        key={v.id}
        video={v}
        canManage={canManage}
        onPlay={() => setActiveVideo(v)}
        onEdit={() => openEdit(v)}
        onDelete={() => deleteMutation.mutate(v.id)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Video lessons</h1>
          <p className="text-slate-500 dark:text-slate-400">Watch recorded lessons inside the platform</p>
        </div>
        {canManage && (
          <Button onClick={() => (showForm && !isEditing ? closeForm() : openCreate())}>
            {showForm && !isEditing ? 'Close' : 'Add video'}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['class', 'Class'],
          ['playlist', 'Playlist'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setView(mode)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              view === mode
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {showForm && canManage && (
        <Card>
          <div className="mb-3">
            <h2 className="font-semibold text-slate-900 dark:text-white">
              {isEditing ? 'Edit video lesson' : 'Add video lesson'}
            </h2>
            <p className="text-sm text-slate-500">
              {isEditing ? 'Update title, URL, audience, topic, or playlist order' : 'Share a recorded lesson with students'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input
              label="Video URL"
              value={form.videoUrl}
              onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
              placeholder="YouTube, Vimeo, or direct .mp4 link"
            />
            <Select label="Provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
              <option value="youtube">YouTube</option>
              <option value="vimeo">Vimeo</option>
              <option value="url">Direct video file URL</option>
            </Select>
            <Select
              label="Visibility"
              value={form.visibility}
              onChange={(e) =>
                setForm({
                  ...form,
                  visibility: e.target.value,
                  classId: e.target.value === 'class' ? form.classId : '',
                  batchId: e.target.value === 'batch' ? form.batchId : '',
                  topicId: e.target.value === 'class' ? form.topicId : '',
                  newTopicTitle: e.target.value === 'class' ? form.newTopicTitle : '',
                  playlistOrder: e.target.value === 'class' ? form.playlistOrder || '1' : '1',
                })
              }
            >
              <option value="all">All students</option>
              <option value="class">Specific class</option>
              <option value="batch">Specific batch</option>
            </Select>
            {form.visibility === 'class' && (
              <>
                <Select
                  label="Class"
                  value={form.classId}
                  onChange={(e) =>
                    applyNextOrder({ classId: e.target.value, topicId: '', newTopicTitle: '' })
                  }
                >
                  <option value="">Select class</option>
                  {classesQuery.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Class topic (playlist)"
                  value={form.topicId}
                  disabled={!form.classId}
                  onChange={(e) =>
                    applyNextOrder({
                      topicId: e.target.value,
                      newTopicTitle: e.target.value === '__new__' ? form.newTopicTitle : '',
                    })
                  }
                >
                  <option value="">No topic / later</option>
                  {topicsQuery.data?.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                  <option value="__new__">+ Create new topic</option>
                </Select>
                {form.topicId === '__new__' && (
                  <Input
                    label="New topic name"
                    className="sm:col-span-2"
                    value={form.newTopicTitle}
                    onChange={(e) => setForm({ ...form, topicId: '__new__', newTopicTitle: e.target.value })}
                    placeholder="e.g. Introduction, Algebra, Week 1"
                  />
                )}
                <Input
                  label="Playlist display order"
                  type="number"
                  min={1}
                  value={form.playlistOrder}
                  onChange={(e) => setForm({ ...form, playlistOrder: e.target.value })}
                  disabled={!form.classId}
                />
              </>
            )}
            {form.visibility === 'batch' && (
              <Select label="Batch" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}>
                <option value="">Select batch</option>
                {batchesQuery.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          {form.visibility === 'class' && (
            <p className="mt-2 text-xs text-slate-500">
              Class topics become playlist sections. Display order is filled with the next number in that topic — you can change it before saving.
            </p>
          )}
          <Textarea
            label="Description"
            className="mt-3"
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !formValid}>
              {saveMutation.isPending ? 'Saving...' : isEditing ? 'Save changes' : 'Add video lesson'}
            </Button>
            {isEditing && (
              <Button variant="secondary" onClick={closeForm}>
                Cancel
              </Button>
            )}
          </div>
        </Card>
      )}

      {view === 'class' && (
        <Card className="rounded-2xl">
          <Select
            label="Select class"
            value={filterClassId}
            onChange={(e) => setFilterClassId(e.target.value)}
          >
            <option value="">Choose a class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
          {!filterClassId && (
            <p className="mt-2 text-sm text-slate-500">Choose a class to list its videos.</p>
          )}
        </Card>
      )}

      {view === 'playlist' && (
        <Card className="rounded-2xl">
          <Select
            label="Select class topic (playlist)"
            value={filterTopicId}
            onChange={(e) => setFilterTopicId(e.target.value)}
          >
            <option value="">Choose a playlist topic</option>
            {allTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.class?.title ? `${topic.class.title} — ${topic.title}` : topic.title}
              </option>
            ))}
          </Select>
          {!filterTopicId && (
            <p className="mt-2 text-sm text-slate-500">Choose a class topic to list videos in that playlist.</p>
          )}
          {filterTopicId && selectedTopic && (
            <p className="mt-2 text-sm text-slate-500">
              Showing playlist <span className="font-medium text-slate-700 dark:text-slate-200">{selectedTopic.title}</span>
              {selectedTopic.class?.title ? ` · ${selectedTopic.class.title}` : ''}
            </p>
          )}
        </Card>
      )}

      {videosQuery.isLoading || (view === 'playlist' && playlistTopicsQuery.isLoading) ? (
        <Spinner />
      ) : view === 'class' ? (
        !filterClassId ? null : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {classVideos.map(renderCard)}
            {classVideos.length === 0 && (
              <p className="text-sm text-slate-500">No videos for this class yet.</p>
            )}
          </div>
        )
      ) : !filterTopicId ? null : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {topicVideos.map(renderCard)}
          {topicVideos.length === 0 && (
            <p className="text-sm text-slate-500">No videos in this playlist yet.</p>
          )}
        </div>
      )}

      {activeVideo && <VideoPlayerModal video={activeVideo} onClose={() => setActiveVideo(null)} />}
    </div>
  );
}
