import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { Icon } from './icons';
import type { Notice } from '../api/types';

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const { slug } = useParams<{ slug: string }>();
  const t = useTenantApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const base = `/${slug}`;

  const countQuery = useQuery({
    queryKey: ['notifications-unread', t.slug],
    queryFn: async () =>
      (await t.get<{ count: number }>('/notifications/unread-count')).data.count,
    refetchInterval: 30_000,
  });

  const feedQuery = useQuery({
    queryKey: ['notification-feed', t.slug],
    enabled: open,
    queryFn: async () => {
      const [notifs, notices] = await Promise.all([
        t.get<{ notifications: AppNotification[] }>('/notifications'),
        t.get<{ notices: Notice[] }>('/notices'),
      ]);
      return {
        notifications: notifs.data.notifications,
        notices: notices.data.notices,
      };
    },
  });

  const markNotifMutation = useMutation({
    mutationFn: async (id: string) => (await t.post(`/notifications/${id}/read`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['notification-feed', t.slug] });
    },
  });

  const markNoticeMutation = useMutation({
    mutationFn: async (id: string) => (await t.post(`/notices/${id}/read`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['notification-feed', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['notices', t.slug] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: async () => (await t.post('/notifications/read-all')).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['notification-feed', t.slug] });
    },
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const unreadCount = countQuery.data ?? 0;
  const notifications = feedQuery.data?.notifications ?? [];
  const notices = feedQuery.data?.notices ?? [];

  type FeedItem =
    | { kind: 'notif'; data: AppNotification; at: number }
    | { kind: 'notice'; data: Notice; at: number };

  const feed: FeedItem[] = [
    ...notifications.map((n) => ({ kind: 'notif' as const, data: n, at: new Date(n.createdAt).getTime() })),
    ...notices.map((n) => ({ kind: 'notice' as const, data: n, at: new Date(n.publishedAt).getTime() })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);

  async function openItem(item: FeedItem) {
    if (item.kind === 'notif') {
      if (!item.data.readAt) await markNotifMutation.mutateAsync(item.data.id);
      setOpen(false);
      if (item.data.link) {
        navigate(item.data.link.startsWith('/') ? `${base}${item.data.link}` : item.data.link);
      }
      return;
    }
    if (!item.data.isRead) await markNoticeMutation.mutateAsync(item.data.id);
    setOpen(false);
    navigate(`${base}/notices?notice=${item.data.id}`);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        className="icon-btn relative"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-ink-850">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/5">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium text-brand-600 hover:underline"
                  onClick={() => markAllMutation.mutate()}
                >
                  Mark all read
                </button>
              )}
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                  {unreadCount} new
                </span>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {feedQuery.isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Loading...</p>
            ) : feed.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications</p>
            ) : (
              feed.map((item) => {
                const unread =
                  item.kind === 'notif' ? !item.data.readAt : !item.data.isRead;
                const title = item.data.title;
                const body = item.kind === 'notif' ? item.data.body : item.data.body;
                const when =
                  item.kind === 'notif' ? item.data.createdAt : item.data.publishedAt;
                return (
                  <button
                    key={`${item.kind}-${item.data.id}`}
                    onClick={() => openItem(item)}
                    className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5 ${
                      unread ? 'bg-brand-50/50 dark:bg-brand-900/10' : ''
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-red-500' : 'bg-transparent'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{title}</p>
                      <p className="truncate text-xs text-slate-400">{body || 'No details'}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {new Date(when).toLocaleString()}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-100 px-4 py-2 dark:border-white/5">
            <Link
              to={`${base}/notices`}
              onClick={() => setOpen(false)}
              className="block py-1.5 text-center text-xs font-semibold text-brand-600 hover:underline"
            >
              View announcements
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
