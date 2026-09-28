import { useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { useTenantApi } from '../hooks/useTenantApi';
import { Icon, type IconName } from './icons';
import { Breadcrumbs, tenantTrails } from './Breadcrumbs';
import { NotificationBell } from './NotificationBell';
import { SupportBanner } from './SupportBanner';
import { BrandMark, useInstituteBrand } from './BrandMark';
import { AppToastHost } from './AppToast';
import { tokenStore } from '../api/client';

const roleLabel: Record<string, string> = {
  admin: 'Admin',
  teacher: 'Teacher',
  student: 'Student',
};

type NavLinkItem = { to: string; label: string; icon: IconName; roles: string[]; end?: boolean };
type NavGroup = { id: string; label: string; items: NavLinkItem[] };

function greetingForHour(h: number) {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function TenantLayout() {
  const { user, logout } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const { dark, toggle } = useDarkMode();
  const t = useTenantApi();
  const [open, setOpen] = useState(false);
  const base = `/${slug}`;
  const brandQuery = useInstituteBrand(slug);
  const instituteName = brandQuery.data?.tenant.name ?? slug;
  const logoUrl = brandQuery.data?.tenant.logoUrl;
  const firstName = user?.name?.split(/\s+/)[0] ?? 'there';
  const initials = (user?.name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  const chatUnreadQuery = useQuery({
    queryKey: ['chat-unread', t.slug],
    enabled: Boolean(user && ['admin', 'teacher', 'student'].includes(user.role)),
    queryFn: async () => (await t.get<{ count: number }>('/chat/unread-count')).data.count,
    refetchInterval: 10_000,
  });
  const chatUnread = chatUnreadQuery.data ?? 0;

  const groups: NavGroup[] = [
    {
      id: 'home',
      label: '',
      items: [
        { to: `${base}/dashboard`, label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'teacher', 'student'], end: true },
      ],
    },
    {
      id: 'learn',
      label: 'Learn',
      items: [
        { to: `${base}/classes`, label: 'Classes', icon: 'classes', roles: ['admin', 'teacher', 'student'] },
        { to: `${base}/videos`, label: 'Videos', icon: 'videos', roles: ['admin', 'teacher', 'student'] },
        { to: `${base}/notices`, label: 'Announcements', icon: 'notices', roles: ['admin', 'teacher', 'student'] },
        { to: `${base}/events`, label: 'Events', icon: 'events', roles: ['admin', 'teacher', 'student'] },
        { to: `${base}/ai`, label: 'AI Study', icon: 'spark', roles: ['student'] },
      ],
    },
    {
      id: 'teach',
      label: 'Teach',
      items: [
        { to: `${base}/students`, label: 'Students', icon: 'users', roles: ['admin'] },
        { to: `${base}/teachers`, label: 'Teachers', icon: 'teacher', roles: ['admin'] },
        { to: `${base}/material-orders`, label: 'Tute Orders', icon: 'payments', roles: ['admin', 'teacher'] },
        { to: `${base}/attendance`, label: 'Attendance', icon: 'note', roles: ['admin', 'teacher'] },
        { to: `${base}/ai-copilot`, label: 'AI Copilot', icon: 'spark', roles: ['admin', 'teacher'] },
        { to: `${base}/question-bank`, label: 'Question bank', icon: 'note', roles: ['admin', 'teacher'] },
        { to: `${base}/quiz-analytics`, label: 'Quiz analytics', icon: 'dashboard', roles: ['admin', 'teacher', 'student'] },
        { to: `${base}/interventions`, label: 'Interventions', icon: 'bell', roles: ['admin', 'teacher'] },
      ],
    },
    {
      id: 'communicate',
      label: 'Communicate',
      items: [
        { to: `${base}/live`, label: 'Live Class', icon: 'live', roles: ['admin', 'teacher', 'student'] },
        { to: `${base}/chat`, label: 'Chat', icon: 'chat', roles: ['admin', 'teacher', 'student'] },
      ],
    },
    {
      id: 'account',
      label: 'Account',
      items: [
        { to: `${base}/payments`, label: 'Payments', icon: 'payments', roles: ['admin', 'teacher', 'student'] },
        { to: `${base}/profile`, label: 'Profile', icon: 'user', roles: ['admin', 'teacher', 'student'] },
        { to: `${base}/settings`, label: 'Settings', icon: 'building', roles: ['admin'] },
      ],
    },
  ];

  const inSupport = user?.role === 'superadmin' && Boolean(user.supportSession || tokenStore.getSupportMeta());
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((l) => {
        if (!user) return false;
        if (inSupport) return l.roles.some((r) => r === 'admin' || r === 'teacher');
        return l.roles.includes(user.role);
      }),
    }))
    .filter((g) => g.items.length > 0);

  const todayLabel = new Date().toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#f4f7fb] dark:bg-ink-900">
      <SupportBanner />
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/5 bg-ink-900 transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <Link to={`${base}/dashboard`} className="flex items-center gap-3 px-5 py-5" onClick={() => setOpen(false)}>
          <BrandMark name={instituteName} logoUrl={logoUrl} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-bold text-white">{instituteName}</span>
            <span className="block text-xs text-slate-400">
              {user ? roleLabel[user.role] ?? user.role : ''} · Mindspark
            </span>
          </span>
        </Link>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
          {visibleGroups.map((g) => (
            <div key={g.id}>
              {g.label ? (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {g.label}
                </p>
              ) : null}
              <div className="space-y-1">
                {g.items.map((l) => {
                  const isChat = l.to === `${base}/chat`;
                  return (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      end={l.end}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `side-link ${isActive ? 'side-link-active' : ''} ${isChat ? 'justify-between' : ''}`
                      }
                    >
                      <span className="flex items-center gap-3">
                        <Icon name={l.icon} />
                        {l.label}
                      </span>
                      {isChat && chatUnread > 0 && (
                        <span className="shrink-0 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                          {chatUnread > 99 ? '99+' : chatUnread}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto space-y-2 border-t border-white/5 p-3">
          <Link
            to={`${base}/profile`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 transition hover:bg-white/10"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
              {initials || 'U'}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-white">{user?.name}</span>
              <span className="block text-xs text-slate-400">{user ? roleLabel[user.role] : ''}</span>
            </span>
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10"
          >
            <Icon name="logout" />
            Logout
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-white/5 dark:bg-ink-850/95">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button className="icon-btn lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
                <Icon name="menu" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-slate-900 dark:text-white sm:text-lg">
                  {greetingForHour(new Date().getHours())}, {firstName}{' '}
                  <span aria-hidden>👋</span>
                </p>
                <p className="truncate text-xs text-slate-400">
                  {instituteName} · {user ? roleLabel[user.role] : ''}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <span className="hidden items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                {todayLabel}
              </span>
              <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
                <Icon name={dark ? 'sun' : 'moon'} />
              </button>
              <NotificationBell />
              <Link
                to={`${base}/profile`}
                className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 transition hover:border-brand-200 sm:flex dark:border-white/10 dark:bg-white/5"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                  {initials || 'U'}
                </span>
                <span className="max-w-[7rem] truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {firstName}
                </span>
              </Link>
            </div>
          </div>
        </header>

        <div className="border-b border-slate-200/70 bg-white/50 px-4 py-2 sm:px-6 dark:border-white/5 dark:bg-ink-850/40">
          <Breadcrumbs
            base={base}
            root={{ label: slug ? slug[0].toUpperCase() + slug.slice(1) : 'Home', to: `${base}/dashboard` }}
            trails={tenantTrails}
          />
        </div>

        <main className="px-4 py-6 sm:px-6">
          <Outlet />
        </main>
        <AppToastHost />
      </div>
    </div>
  );
}
