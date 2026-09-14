import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { Icon, type IconName } from './icons';
import { Breadcrumbs, adminTrails } from './Breadcrumbs';
import { AppToastHost } from './AppToast';

const links: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/admin', label: 'Overview', icon: 'dashboard', end: true },
  { to: '/admin/tenants', label: 'Institutes', icon: 'building' },
  { to: '/admin/users', label: 'Users', icon: 'users' },
  { to: '/admin/monitoring', label: 'Monitoring', icon: 'chart' },
  { to: '/admin/ai', label: 'AI Usage', icon: 'spark' },
  { to: '/admin/payments', label: 'Payments', icon: 'payments' },
  { to: '/admin/audit', label: 'Audit Log', icon: 'note' },
  { to: '/admin/profile', label: 'Profile', icon: 'user' },
];

function greetingForHour(h: number) {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useDarkMode();
  const [open, setOpen] = useState(false);
  const firstName = user?.name?.split(/\s+/)[0] ?? 'Admin';
  const initials = (user?.name ?? 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  const todayLabel = new Date().toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#f4f7fb] dark:bg-ink-900">
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/5 bg-ink-900 transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <Link to="/admin" className="flex items-center gap-3 px-5 py-5" onClick={() => setOpen(false)}>
          <span className="brand-chip h-10 w-10 text-lg font-extrabold">M</span>
          <span className="leading-tight">
            <span className="block text-sm font-bold text-white">Mindspark</span>
            <span className="block text-xs text-slate-400">Platform Admin</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `side-link ${isActive ? 'side-link-active' : ''}`}
            >
              <Icon name={l.icon} />
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-2 border-t border-white/5 p-3">
          <Link
            to="/admin/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 transition hover:bg-white/10"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
              {initials || 'A'}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-white">{user?.name}</span>
              <span className="block text-xs text-slate-400">Super Admin</span>
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
                <p className="text-xs text-slate-400">Platform administration</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <span className="hidden items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                {todayLabel}
              </span>
              <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
                <Icon name={dark ? 'sun' : 'moon'} />
              </button>
              <Link
                to="/admin/profile"
                className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 transition hover:border-brand-200 sm:flex dark:border-white/10 dark:bg-white/5"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                  {initials || 'A'}
                </span>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Admin</span>
              </Link>
            </div>
          </div>
        </header>

        <div className="border-b border-slate-200/70 bg-white/50 px-4 py-2 sm:px-6 dark:border-white/5 dark:bg-ink-850/40">
          <Breadcrumbs base="/admin" root={{ label: 'Platform', to: '/admin' }} trails={adminTrails} />
        </div>

        <main className="px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
      <AppToastHost />
    </div>
  );
}
