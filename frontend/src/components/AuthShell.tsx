import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const LOGO_SRC = '/mindspark-logo.png?v=4';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050b18] text-slate-100">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 60% at 15% 20%, rgba(37,99,235,0.35), transparent 55%), radial-gradient(ellipse 70% 50% at 85% 75%, rgba(14,165,233,0.18), transparent 50%), radial-gradient(circle at 50% 100%, rgba(30,64,175,0.25), transparent 45%)',
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12 sm:px-8">
        <div className="mb-8 flex items-center gap-3">
          <img src={LOGO_SRC} alt="Mindspark LMS" className="h-12 w-12 rounded-xl object-contain" />
          <div>
            <p className="text-lg font-bold text-white">Mindspark LMS</p>
            <p className="text-xs text-slate-400">{subtitle ?? 'Account access'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <div className="mt-6">{children}</div>
        </div>

        {footer ?? (
          <p className="mt-6 text-center text-sm text-slate-400">
            <Link to="/login" className="font-medium text-brand-300 hover:text-brand-200 hover:underline">
              Back to sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
