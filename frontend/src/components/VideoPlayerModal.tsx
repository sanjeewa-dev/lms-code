import { useQuery } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { Spinner } from './ui';
import { Icon } from './icons';
import { apiErrorMessage } from '../api/client';
import { SecureVideoPlayer, type VideoPlayConfig } from './SecureVideoPlayer';
import type { VideoLesson } from '../api/types';

export function VideoPlayerModal({
  video,
  onClose,
}: {
  video: VideoLesson;
  onClose: () => void;
}) {
  const t = useTenantApi();

  const playQuery = useQuery({
    queryKey: ['video-play', t.slug, video.id],
    queryFn: async () => (await t.get<VideoPlayConfig>(`/video-lessons/${video.id}/play`)).data,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-white">{video.title}</h3>
            <p className="text-xs text-slate-400">Platform player — external links are hidden</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-2xl leading-none text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Close player"
          >
            ×
          </button>
        </div>

        <div className="aspect-video bg-black">
          {playQuery.isLoading ? (
            <div className="grid h-full place-items-center">
              <Spinner label="Loading video..." />
            </div>
          ) : playQuery.isError ? (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-red-300">
              {apiErrorMessage(playQuery.error)}
            </div>
          ) : playQuery.data ? (
            <SecureVideoPlayer config={playQuery.data} title={video.title} />
          ) : (
            <div className="grid h-full place-items-center text-sm text-slate-400">
              Unable to load this video.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function VideoLessonCard({
  video,
  canManage,
  onPlay,
  onDelete,
}: {
  video: VideoLesson;
  canManage: boolean;
  onPlay: () => void;
  onDelete: () => void;
}) {
  const providerLabel =
    video.provider === 'url' ? 'Direct video' : video.provider;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/5 dark:bg-ink-850">
      <button
        type="button"
        onClick={onPlay}
        className="group relative block w-full aspect-video overflow-hidden bg-slate-900"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-brand-700/80 to-purple-900/80" />
        <span className="relative z-10 grid h-full w-full place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/30 transition group-hover:scale-105 group-hover:bg-white/30">
            <Icon name="play" width={28} height={28} />
          </span>
        </span>
        <span className="absolute bottom-3 left-3 z-10 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium capitalize text-white">
          {providerLabel}
        </span>
      </button>
      <div className="p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="font-semibold text-slate-900 dark:text-white">{video.title}</h3>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-600 dark:bg-white/10 dark:text-slate-300">
            {video.visibility}
          </span>
        </div>
        {video.class?.title && <p className="text-xs text-slate-400">{video.class.title}</p>}
        {video.batch?.name && <p className="text-xs text-slate-400">{video.batch.name}</p>}
        {video.description && (
          <p className="mt-2 line-clamp-2 text-sm text-slate-500">{video.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <Icon name="play" width={14} height={14} />
            Watch lesson
          </button>
          {canManage && (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
