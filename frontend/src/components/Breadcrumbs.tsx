import { Link, matchPath, useLocation, useParams } from 'react-router-dom';
import { Icon } from './icons';
import { isClassSection, sectionMeta } from '../pages/class/classSections';

export interface Crumb {
  label: string;
  /** Absolute path, or a path relative to `base`. Omit for a non-clickable crumb. */
  to?: string;
}

interface Trail {
  pattern: string;
  trail: Crumb[];
}

function resolvePathTemplate(template: string, params: Record<string, string | undefined>) {
  return template.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    const value = params[key];
    return value != null && value !== '' ? value : `:${key}`;
  });
}

/**
 * Route-aware breadcrumb trail. `root` is always shown first (with a home
 * icon); the remaining crumbs come from the first `trails` entry whose pattern
 * matches the current path. Relative `to` values are resolved against `base`,
 * and `:param` placeholders are filled from the matched route.
 */
export function Breadcrumbs({ root, base, trails }: { root: Crumb; base: string; trails: Trail[] }) {
  const { pathname } = useLocation();
  const routeParams = useParams();

  let matchParams: Record<string, string | undefined> = { ...routeParams };
  let trail: Crumb[] = [];

  for (const t of trails) {
    const result = matchPath(
      { path: t.pattern ? `${base}/${t.pattern}` : base, end: true },
      pathname
    );
    if (result) {
      matchParams = { ...routeParams, ...result.params };
      trail = t.trail;
      break;
    }
  }

  const crumbs: Crumb[] = [
    root,
    ...trail.map((crumb) => {
      // Prefer real section name over generic "Section"
      if (crumb.label === 'Section' && isClassSection(matchParams.section)) {
        return { ...crumb, label: sectionMeta[matchParams.section].label };
      }
      return crumb;
    }),
  ];

  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        const resolvedTo =
          crumb.to && !isLast ? resolvePathTemplate(crumb.to, matchParams) : undefined;
        const href = resolvedTo
          ? resolvedTo.startsWith('/')
            ? resolvedTo
            : `${base}/${resolvedTo}`
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
  {
    pattern: 'classes/:classId/:section',
    trail: [
      { label: 'Classes', to: 'classes' },
      { label: 'Class Details', to: 'classes/:classId' },
      { label: 'Section' },
    ],
  },
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
  { pattern: 'chat', trail: [{ label: 'Chat' }] },
  { pattern: 'ai', trail: [{ label: 'AI Student Area' }] },
  { pattern: 'ai-copilot', trail: [{ label: 'AI Teacher Copilot' }] },
  { pattern: 'interventions', trail: [{ label: 'Interventions' }] },
  { pattern: 'settings', trail: [{ label: 'Settings' }] },
];

/** Breadcrumb trails for the platform admin app (relative to `/admin`). */
export const adminTrails: Trail[] = [
  { pattern: '', trail: [{ label: 'Overview' }] },
  { pattern: 'tenants', trail: [{ label: 'Institutes' }] },
  { pattern: 'tenants/:id', trail: [{ label: 'Institutes', to: 'tenants' }, { label: 'Institute' }] },
  { pattern: 'users', trail: [{ label: 'Users' }] },
  { pattern: 'monitoring', trail: [{ label: 'Monitoring' }] },
  { pattern: 'ai', trail: [{ label: 'AI Usage' }] },
  { pattern: 'payments', trail: [{ label: 'Payments' }] },
  { pattern: 'audit', trail: [{ label: 'Audit Log' }] },
  { pattern: 'profile', trail: [{ label: 'Profile' }] },
];
