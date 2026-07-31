import { Link, useOutletContext } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { Icon } from '../../components/icons';
import { CLASS_SECTIONS, sectionMeta, type ClassSectionId } from './classSections';
import type { ClassOutletContext } from '../ClassDetail';

const NEXT_ACTIONS: {
  section: ClassSectionId | null;
  to: (classBase: string, slug: string) => string;
  label: string;
  hint: string;
  icon: 'spark' | 'live' | 'note';
  tone: string;
}[] = [
  {
    section: 'quizzes',
    to: (classBase) => `${classBase}/quizzes?ai=1`,
    label: 'Generate a quiz',
    hint: 'Create an AI quiz for this class',
    icon: 'spark',
    tone: 'bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
  },
  {
    section: 'schedule',
    to: (classBase) => `${classBase}/schedule`,
    label: 'Schedule / live',
    hint: 'Plan sessions or start a live class',
    icon: 'live',
    tone: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  {
    section: 'attendance',
    to: (classBase) => `${classBase}/attendance`,
    label: 'Take attendance',
    hint: 'Mark who joined today',
    icon: 'note',
    tone: 'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300',
  },
];

export default function ClassDashboard() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { canManage, classBase } = useOutletContext<ClassOutletContext>();

  const visibleSections = CLASS_SECTIONS.filter((section) => !sectionMeta[section].staffOnly || canManage);

  return (
    <div className="border-t border-slate-100 px-6 py-5 dark:border-white/5">
      <nav className="mb-5 flex gap-1 overflow-x-auto pb-1" aria-label="Class sections">
        {visibleSections.map((section) => {
          const meta = sectionMeta[section];
          return (
            <Link
              key={section}
              to={`${classBase}/${section}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-brand-50 hover:text-brand-700 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-brand-300"
            >
              <Icon name={meta.icon} width={14} height={14} />
              {meta.label}
            </Link>
          );
        })}
      </nav>

      {canManage && (
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">What&apos;s next</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Common teaching tasks for this class.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {NEXT_ACTIONS.map((action) => (
              <Link
                key={action.label}
                to={action.to(classBase, slug)}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 transition hover:border-brand-200 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:border-brand-700 dark:hover:bg-white/[0.07]"
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${action.tone}`}>
                  <Icon name={action.icon} width={16} height={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                    {action.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {action.hint}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
