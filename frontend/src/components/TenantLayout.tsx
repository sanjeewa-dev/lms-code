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
  admin: 'Admin Panel',
  teacher: 'Teacher Panel',
  student: 'Student Area',
};

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

  const chatUnreadQuery = useQuery({
    queryKey: ['chat-unread', t.slug],
    enabled: Boolean(user && ['admin', 'teacher', 'student'].includes(user.role)),
    queryFn: async () => (await t.get<{ count: number }>('/chat/unread-count')).data.count,
    refetchInterval: 10_000,
  });
  const chatUnread = chatUnreadQuery.data ?? 0;

  const links: { to: string; label: string; icon: IconName; roles: string[]; end?: boolean }[] = [
    { to: `${base}/dashboard`, label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'teacher', 'student'], end: true },
    { to: `${base}/students`, label: 'Students', icon: 'users', roles: ['admin', 'teacher'] },
    { to: `${base}/teachers`, label: 'Teachers', icon: 'teacher', roles: ['admin'] },
    { to: `${base}/classes`, label: 'Classes', icon: 'classes', roles: ['admin', 'teacher', 'student'] },
    { to: `${base}/videos`, label: 'Videos', icon: 'videos', roles: ['admin', 'teacher', 'student'] },
    { to: `${base}/notices`, label: 'Announcements', icon: 'notices', roles: ['admin', 'teacher', 'student'] },
    { to: `${base}/events`, label: 'Events', icon: 'events', roles: ['admin', 'teacher', 'student'] },
    { to: `${base}/attendance`, label: 'Attendance', icon: 'note', roles: ['admin', 'teacher'] },
    { to: `${base}/payments`, label: 'Payments', icon: 'payments', roles: ['admin', 'teacher', 'student'] },
    { to: `${base}/profile`, label: 'Profile', icon: 'user', roles: ['admin', 'teacher', 'student'] },
    { to: `${base}/live`, label: 'Live Class', icon: 'live', roles: ['admin', 'teacher', 'student'] },
    { to: `${base}/chat`, label: 'Chat', icon: 'chat', roles: ['admin', 'teacher', 'student'] },
    { to: `${base}/ai`, label: 'AI Student Area', icon: 'spark', roles: ['student'] },
    { to: `${base}/ai-copilot`, label: 'AI Copilot', icon: 'spark', roles: ['admin', 'teacher'] },
    { to: `${base}/interventions`, label: 'Interventions', icon: 'bell', roles: ['admin', 'teacher'] },
    { to: `${base}/settings`, label: 'Settings', icon: 'building', roles: ['admin'] },
  ];

  const inSupport = user?.role === 'superadmin' && Boolean(user.supportSession || tokenStore.getSupportMeta());
  const visible = links.filter((l) => {
    if (!user) return false;
    if (inSupport) {
      // Support sees admin-level navigation inside the tenant.
      return l.roles.some((r) => r === 'admin' || r === 'teacher');
    }
    return l.roles.includes(user.role);
  });

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-900">
      <SupportBanner />
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform dark:border-white/5 dark:bg-ink-850 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <Link to={`${base}/dashboard`} className="flex items-center gap-3 px-5 py-5" onClick={() => setOpen(false)}>
          <BrandMark name={instituteName} logoUrl={logoUrl} />
          <span className="leading-tight">
            <span className="block text-sm font-bold text-slate-900 dark:text-white">{instituteName}</span>
            <span className="block text-xs text-slate-400">{user ? roleLabel[user.role] : ''}</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {visible.map((l) => {
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
                  <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <button
          onClick={logout}
          className="m-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <Icon name="logout" />
          Logout
        </button>
      </aside>

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100/80 backdrop-blur dark:border-white/5 dark:bg-ink-900/80">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button className="icon-btn lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
                <Icon name="menu" />
              </button>
              <div>
                <p className="text-xs text-slate-400">
                  {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <Link to={`${base}/profile`} className="hover:text-brand-600">
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                    Hi, {user?.name.split(' ')[0]} <span className="align-middle">👋</span>
                  </h1>
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
                <Icon name={dark ? 'sun' : 'moon'} />
              </button>
              <NotificationBell />
            </div>
          </div>
        </header>

        <div className="border-b border-slate-200 bg-white/60 px-4 py-2.5 sm:px-6 dark:border-white/5 dark:bg-ink-850/40">
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
