import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { Icon, type IconName } from './icons';
import { Breadcrumbs, adminTrails } from './Breadcrumbs';

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

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useDarkMode();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-900">
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform dark:border-white/5 dark:bg-ink-850 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <Link to="/admin" className="flex items-center gap-3 px-5 py-5" onClick={() => setOpen(false)}>
          <span className="brand-chip h-10 w-10 text-lg font-extrabold">M</span>
          <span className="leading-tight">
            <span className="block text-sm font-bold text-slate-900 dark:text-white">Mindspark</span>
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

        <button
          onClick={logout}
          className="m-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <Icon name="logout" />
          Logout
        </button>
      </aside>

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
                <Link to="/admin/profile" className="hover:text-brand-600">
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
            </div>
          </div>
        </header>

        <div className="border-b border-slate-200 bg-white/60 px-4 py-2.5 sm:px-6 dark:border-white/5 dark:bg-ink-850/40">
          <Breadcrumbs base="/admin" root={{ label: 'Platform', to: '/admin' }} trails={adminTrails} />
        </div>

        <main className="px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
