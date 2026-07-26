import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { Button, Card, Input, Select, Spinner, Textarea } from '../components/ui';
import { VideoLessonCard, VideoPlayerModal } from '../components/VideoPlayerModal';
import type { Batch, ClassSummary, VideoLesson } from '../api/types';

export default function Videos() {
  const t = useTenantApi();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === 'admin' || user?.role === 'teacher';
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [activeVideo, setActiveVideo] = useState<VideoLesson | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    provider: 'youtube',
    videoUrl: '',
    visibility: 'all',
    classId: '',
    batchId: '',
  });

  const videosQuery = useQuery({
    queryKey: ['videos', t.slug],
    queryFn: async () => (await t.get<{ videos: VideoLesson[] }>('/video-lessons')).data.videos,
  });

  const classesQuery = useQuery({
    queryKey: ['classes', t.slug],
    enabled: canManage,
    queryFn: async () => (await t.get<{ classes: ClassSummary[] }>('/classes')).data.classes,
  });

  const batchesQuery = useQuery({
    queryKey: ['batches', t.slug],
    enabled: canManage,
    queryFn: async () => (await t.get<{ batches: Batch[] }>('/batches')).data.batches,
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      (
        await t.post('/video-lessons', {
          title: form.title,
          description: form.description,
          provider: form.provider,
          videoUrl: form.videoUrl,
          visibility: form.visibility,
          classId: form.visibility === 'class' ? form.classId : undefined,
          batchId: form.visibility === 'batch' ? form.batchId : undefined,
        })
      ).data,
    onSuccess: () => {
      setShowForm(false);
      setError('');
      setForm({ title: '', description: '', provider: 'youtube', videoUrl: '', visibility: 'all', classId: '', batchId: '' });
      queryClient.invalidateQueries({ queryKey: ['videos', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await t.del(`/video-lessons/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['videos', t.slug] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Video lessons</h1>
          <p className="text-slate-500 dark:text-slate-400">Watch recorded lessons inside the platform</p>
        </div>
        {canManage && <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : 'Add video'}</Button>}
      </div>

      {showForm && canManage && (
        <Card>
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
            <Select label="Visibility" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
              <option value="all">All students</option>
              <option value="class">Specific class</option>
              <option value="batch">Specific batch</option>
            </Select>
            {form.visibility === 'class' && (
              <Select label="Class" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">Select class</option>
                {classesQuery.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
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
          <Textarea
            label="Description"
            className="mt-3"
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Button className="mt-3" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.title || !form.videoUrl}>
            {createMutation.isPending ? 'Saving...' : 'Add video lesson'}
          </Button>
        </Card>
      )}

      {videosQuery.isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {videosQuery.data?.map((v) => (
            <VideoLessonCard
              key={v.id}
              video={v}
              canManage={canManage}
              onPlay={() => setActiveVideo(v)}
              onDelete={() => deleteMutation.mutate(v.id)}
            />
          ))}
          {videosQuery.data?.length === 0 && (
            <p className="text-sm text-slate-500">No video lessons available.</p>
          )}
        </div>
      )}

      {activeVideo && <VideoPlayerModal video={activeVideo} onClose={() => setActiveVideo(null)} />}
    </div>
  );
}
