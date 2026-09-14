import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../components/icons';
import { CLASS_SECTIONS, sectionMeta, type ClassSectionId } from './classSections';

/** Icon-card section tabs matching the class-hub mockup. */
export function ClassSectionNav({
  classBase,
  canManage,
  active,
}: {
  classBase: string;
  canManage: boolean;
  active?: ClassSectionId | null;
}) {
  const { slug = '' } = useParams<{ slug: string }>();
  const visible = CLASS_SECTIONS.filter((s) => !sectionMeta[s].staffOnly || canManage);

  return (
    <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" aria-label="Class sections">
      {visible.map((section) => {
        const meta = sectionMeta[section];
        const isActive = active === section;
        return (
          <Link
            key={section}
            to={`${classBase}/${section}`}
            className={`flex flex-col items-center gap-2 rounded-xl border bg-white px-2 py-3 text-center shadow-sm transition dark:bg-ink-850 ${
              isActive
                ? 'border-brand-300 border-t-[3px] border-t-brand-600 text-brand-700 dark:border-brand-700 dark:border-t-brand-400 dark:text-brand-300'
                : 'border-slate-200/80 text-slate-600 hover:border-brand-200 hover:text-brand-700 dark:border-white/10 dark:text-slate-300 dark:hover:border-brand-700 dark:hover:text-brand-300'
            }`}
          >
            <span
              className={`grid h-9 w-9 place-items-center rounded-lg ${
                isActive
                  ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300'
                  : 'bg-slate-50 text-brand-600 dark:bg-white/5 dark:text-brand-400'
              }`}
            >
              <Icon name={meta.icon} width={18} height={18} />
            </span>
            <span className="text-xs font-semibold">{meta.label}</span>
          </Link>
        );
      })}
      <Link
        to={`/${slug}/live`}
        className="flex flex-col items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-2 py-3 text-center text-slate-600 shadow-sm transition hover:border-brand-200 hover:text-brand-700 dark:border-white/10 dark:bg-ink-850 dark:text-slate-300 dark:hover:border-brand-700 dark:hover:text-brand-300"
      >
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-50 text-brand-600 dark:bg-white/5 dark:text-brand-400">
          <Icon name="live" width={18} height={18} />
        </span>
        <span className="text-xs font-semibold">Live</span>
      </Link>
    </nav>
  );
}
