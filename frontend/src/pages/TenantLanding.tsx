import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Spinner } from '../components/ui';
import { Icon } from '../components/icons';
import { BrandMark } from '../components/BrandMark';
import { useDarkMode } from '../hooks/useDarkMode';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import type { PublicTenant } from '../api/types';

function monthDay(date: string) {
  const d = new Date(date);
  return {
    day: d.toLocaleDateString(undefined, { day: '2-digit' }),
    month: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
  };
}

export default function TenantLanding() {
  const { slug } = useParams<{ slug: string }>();
  const { dark, toggle } = useDarkMode();

  const query = useQuery({
    queryKey: ['public', slug],
    queryFn: async () => (await api.get<PublicTenant>(`/t/${slug}/public`)).data,
    retry: false,
  });

  const tenant = query.data?.tenant;

  useDocumentMeta({
    title: tenant
      ? `${tenant.name} — Online Learning Platform`
      : `Institute — Mindspark LMS`,
    description: tenant
      ? `Welcome to ${tenant.name}. Access your classes, notices, events, and live lessons on our online learning platform.`
      : 'Online learning platform powered by Mindspark LMS.',
    ogImage: tenant?.logoUrl ?? undefined,
  });

  if (query.isLoading)
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 dark:bg-ink-900">
        <Spinner label="Loading institute..." />
      </div>
    );

  if (query.isError || !query.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-ink-850">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Institute not found</h1>
          <p className="mt-1 text-sm text-slate-500">No active institute exists at /{slug}.</p>
          <Link to="/" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  const { notices, events, videos } = query.data;
  const navItems = [
    { href: '#home', label: 'Home' },
    { href: '#events', label: 'Events' },
    { href: '#videos', label: 'Lessons' },
    { href: '#notices', label: 'Notices' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-ink-900 dark:text-slate-200">
      {/* Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-white/5 dark:bg-ink-850/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="#home" className="flex items-center gap-2.5 text-lg font-bold text-slate-900 dark:text-white">
            <BrandMark name={tenant.name} logoUrl={tenant.logoUrl} size="sm" />
            {tenant.name}
          </a>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((n, i) => (
              <a
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  i === 0
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-200'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
                }`}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
              <Icon name={dark ? 'sun' : 'moon'} />
            </button>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition hover:bg-brand-700"
            >
              Login
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="home" className="relative overflow-hidden bg-hero-gradient">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #60a5fa 0, transparent 40%), radial-gradient(circle at 80% 70%, #a78bfa 0, transparent 40%)' }} />
        <div className="relative mx-auto max-w-6xl px-4 py-24">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow">
            Special notices
          </span>
          <h1 className="mt-6 text-5xl font-extrabold tracking-tight text-white">
            Welcome to {tenant.name}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            Excellence within reach. Access your classes, live sessions, quizzes, and study resources — all in one place.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              to={`/${slug}/register`}
              className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-lg transition hover:bg-slate-100"
            >
              Join now
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Student login
            </Link>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-16 px-4 py-16">
        {/* Notices */}
        <section id="notices">
          <SectionTitle>Special notices</SectionTitle>
          {notices.length > 0 ? (
            <div className="space-y-3">
              {notices.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-ink-850"
                >
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-600">
                    <Icon name="notices" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">{n.title}</span>
                      {n.pinned && (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                          PINNED
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{n.body}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No notices right now.</Empty>
          )}
        </section>

        {/* Events */}
        <section id="events">
          <SectionTitle>Recent events</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => {
              const { day, month } = monthDay(e.eventDate);
              return (
                <article
                  key={e.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-white/5 dark:bg-ink-850"
                >
                  <div className="flex items-center gap-3 border-b border-slate-100 p-4 dark:border-white/5">
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-brand-gradient text-white">
                      <span className="text-lg font-bold leading-none">{day}</span>
                      <span className="text-[10px] font-semibold">{month}</span>
                    </div>
                    {e.batchLabel && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300">
                        {e.batchLabel}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{e.title}</h3>
                    <p className="mt-1 line-clamp-3 text-sm text-slate-500 dark:text-slate-400">{e.body}</p>
                  </div>
                </article>
              );
            })}
            {events.length === 0 && <Empty>No events yet.</Empty>}
          </div>
        </section>

        {/* Videos */}
        <section id="videos">
          <SectionTitle>Video lessons</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <article
                key={v.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-white/5 dark:bg-ink-850"
              >
                <div className="grid aspect-video place-items-center bg-hero-gradient">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-white">
                    <Icon name="play" width={28} height={28} />
                  </span>
                </div>
                <div className="p-4">
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                    {v.batch?.name ?? 'All students'}
                  </span>
                  <h3 className="mt-2 font-semibold text-slate-900 dark:text-white">{v.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Sign in to watch this lesson in the platform player.
                  </p>
                </div>
              </article>
            ))}
            {videos.length === 0 && <Empty>No public videos.</Empty>}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-white/5 dark:bg-ink-850">
        <div className="mx-auto max-w-6xl px-4 py-8 text-center text-sm text-slate-400">
          {tenant.name} &middot; Powered by Mindspark LMS
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="h-6 w-1.5 rounded-full bg-brand-gradient" />
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{children}</h2>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400 dark:border-white/5 dark:bg-ink-850">
      {children}
    </p>
  );
}
