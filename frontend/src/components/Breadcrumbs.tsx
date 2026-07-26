import { Link, matchPath, useLocation } from 'react-router-dom';
import { Icon } from './icons';

export interface Crumb {
  label: string;
  /** Absolute path, or a path relative to `base`. Omit for a non-clickable crumb. */
  to?: string;
}

interface Trail {
  pattern: string;
  trail: Crumb[];
}

/**
 * Route-aware breadcrumb trail. `root` is always shown first (with a home
 * icon); the remaining crumbs come from the first `trails` entry whose pattern
 * matches the current path. Relative `to` values are resolved against `base`.
 */
export function Breadcrumbs({ root, base, trails }: { root: Crumb; base: string; trails: Trail[] }) {
  const { pathname } = useLocation();

  const match = trails.find((t) =>
    matchPath({ path: t.pattern ? `${base}/${t.pattern}` : base, end: true }, pathname)
  );

  const crumbs: Crumb[] = [root, ...(match?.trail ?? [])];

  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        const href =
          crumb.to && !isLast
            ? crumb.to.startsWith('/')
              ? crumb.to
              : `${base}/${crumb.to}`
            : undefined;

        return (
          <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && (
              <Icon name="chevron" width={14} height={14} className="text-slate-300 dark:text-slate-600" />
            )}
            {href ? (
              <Link
                to={href}
                className="flex items-center gap-1.5 font-medium text-slate-500 transition hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-300"
              >
                {i === 0 && <Icon name="home" width={15} height={15} />}
                {crumb.label}
              </Link>
            ) : (
              <span
                className={`flex items-center gap-1.5 ${
                  isLast
                    ? 'font-semibold text-slate-800 dark:text-white'
                    : 'font-medium text-slate-500 dark:text-slate-400'
                }`}
                aria-current={isLast ? 'page' : undefined}
              >
                {i === 0 && <Icon name="home" width={15} height={15} />}
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** Breadcrumb trails for the tenant app (relative to `/:slug`). */
export const tenantTrails: Trail[] = [
  { pattern: 'dashboard', trail: [{ label: 'Dashboard' }] },
  { pattern: 'classes', trail: [{ label: 'Classes' }] },
  { pattern: 'classes/:classId', trail: [{ label: 'Classes', to: 'classes' }, { label: 'Class Details' }] },
  { pattern: 'materials/:materialId', trail: [{ label: 'Classes', to: 'classes' }, { label: 'Material' }] },
  { pattern: 'quizzes/:quizId/take', trail: [{ label: 'Classes', to: 'classes' }, { label: 'Quiz' }] },
  {
    pattern: 'attempts/:attemptId/result',
    trail: [{ label: 'Classes', to: 'classes' }, { label: 'Quiz Result' }],
  },
  { pattern: 'students', trail: [{ label: 'Students' }] },
  { pattern: 'teachers', trail: [{ label: 'Teachers' }] },
  { pattern: 'payments', trail: [{ label: 'Payments' }] },
  { pattern: 'profile', trail: [{ label: 'Profile' }] },
  { pattern: 'videos', trail: [{ label: 'Videos' }] },
  { pattern: 'notices', trail: [{ label: 'Announcements' }] },
  { pattern: 'events', trail: [{ label: 'Events' }] },
  { pattern: 'attendance', trail: [{ label: 'Attendance' }] },
  { pattern: 'live', trail: [{ label: 'Live Class' }] },
  { pattern: 'settings', trail: [{ label: 'Settings' }] },
];

/** Breadcrumb trails for the platform admin app (relative to `/admin`). */
export const adminTrails: Trail[] = [
  { pattern: '', trail: [{ label: 'Institutes' }] },
  { pattern: 'profile', trail: [{ label: 'Profile' }] },
];
