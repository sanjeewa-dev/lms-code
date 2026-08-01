import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Select } from '../components/ui';
import { Icon, type IconName } from '../components/icons';
import { apiErrorMessage } from '../api/client';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

const LOGO_SRC = '/mindspark-logo.png?v=4';
const VIDEO_SRC = '/mindspark-intro.mp4?v=4';

const FEATURES: { icon: IconName; title: string; blurb: string }[] = [
  {
    icon: 'live',
    title: 'Live classes',
    blurb: 'Host and join sessions with recording-ready rooms.',
  },
  {
    icon: 'quiz',
    title: 'Smart quizzes',
    blurb: 'Build, assign, and auto-score assessments in minutes.',
  },
  {
    icon: 'spark',
    title: 'AI learning tools',
    blurb: 'Study help for students and a copilot for teachers.',
  },
  {
    icon: 'chart',
    title: 'Progress insights',
    blurb: 'Track attendance, grades, and at-risk students.',
  },
];

export default function PlatformHome() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tenantChoices, setTenantChoices] = useState<{ slug: string; name: string }[] | null>(null);
  const [chosenSlug, setChosenSlug] = useState('');

  useDocumentMeta({
    title: 'Sign In — Mindspark LMS',
    description:
      'Sign in to your Mindspark LMS account to access your classes, quizzes, live sessions, and AI learning tools.',
  });

  async function doLogin(tenantSlug?: string) {
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password, tenantSlug);
      if (result.kind === 'multiple') {
        setTenantChoices(result.tenants);
        setChosenSlug(result.tenants[0]?.slug ?? '');
        return;
      }
      if (result.user.role === 'superadmin') {
        navigate('/admin');
      } else if (result.tenant) {
        navigate(`/${result.tenant.slug}/dashboard`);
      } else {
        navigate('/login');
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    doLogin(tenantChoices ? chosenSlug : undefined);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050b18] text-slate-100">
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 60% at 15% 20%, rgba(37,99,235,0.35), transparent 55%), radial-gradient(ellipse 70% 50% at 85% 75%, rgba(14,165,233,0.18), transparent 50%), radial-gradient(circle at 50% 100%, rgba(30,64,175,0.25), transparent 45%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        aria-hidden
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.15) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 70% 70% at 50% 40%, black, transparent)',
        }}
      />

      <div className="relative mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[1.15fr_0.85fr]">
        {/* Promo panel */}
        <section className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-14 lg:py-16">
          <div className="mb-8 flex items-center gap-5">
            <img
              src={LOGO_SRC}
              alt="Mindspark LMS"
              className="h-24 w-24 shrink-0 object-contain sm:h-28 sm:w-28"
            />
            <div>
              <p className="text-sm font-medium tracking-wide text-sky-300/90">Mindspark LMS</p>
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Learn smarter.
                <span className="block bg-gradient-to-r from-sky-300 to-blue-400 bg-clip-text text-transparent">
                  Teach clearer.
                </span>
              </h1>
            </div>
          </div>

          <p className="max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            A multi-tenant learning platform for institutes — live classes, quizzes, materials,
            payments, and AI tools in one place.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/25">
                  <Icon name={f.icon} width={18} height={18} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{f.title}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-slate-400">{f.blurb}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-8 max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-black/50 shadow-2xl shadow-sky-950/40 ring-1 ring-sky-500/10">
            <video
              className="aspect-video w-full bg-black object-cover"
              src={VIDEO_SRC}
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Mindspark LMS video"
            >
              Your browser does not support embedded video.
            </video>
          </div>
        </section>

        {/* Sign-in panel */}
        <section className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-10 lg:py-16">
          <div className="w-full max-w-md rounded-3xl border border-white/12 bg-white/[0.07] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <img
                src={LOGO_SRC}
                alt=""
                className="h-14 w-14 shrink-0 object-contain"
              />
              <div>
                <p className="text-lg font-bold text-white">Mindspark LMS</p>
                <p className="text-xs text-slate-400">Sign in to continue</p>
              </div>
            </div>

            <div className="mb-6 hidden lg:block">
              <h2 className="text-2xl font-bold text-white">Welcome back</h2>
              <p className="mt-1 text-sm text-slate-400">Sign in to your institute workspace</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 [&_label>span]:text-slate-200">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setTenantChoices(null);
                }}
                required
                autoComplete="username"
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setTenantChoices(null);
                }}
                required
                autoComplete="current-password"
              />

              {tenantChoices && (
                <Select
                  label="Choose your institute"
                  value={chosenSlug}
                  onChange={(e) => setChosenSlug(e.target.value)}
                >
                  {tenantChoices.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}

              {error && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
