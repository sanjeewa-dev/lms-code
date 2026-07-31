import { Link, useOutletContext } from 'react-router-dom';
import { Badge } from '../../components/ui';
import { Icon } from '../../components/icons';
import { CLASS_SECTIONS, sectionMeta, type ClassSectionId } from './classSections';
import type { ClassOutletContext } from '../ClassDetail';

function SectionCard({
  classBase,
  section,
}: {
  classBase: string;
  section: ClassSectionId;
}) {
  const meta = sectionMeta[section];

  return (
    <Link
      to={`${classBase}/${section}`}
      className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-200 hover:shadow-md dark:border-white/5 dark:bg-ink-850"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Class Area</p>
          <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{meta.label}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{meta.hint}</p>
        </div>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${meta.tone}`}>
          <Icon name={meta.icon} />
        </span>
      </div>
    </Link>
  );
}

export default function ClassDashboard() {
  const { canManage, classBase } = useOutletContext<ClassOutletContext>();

  const visibleSections = CLASS_SECTIONS.filter((section) => !sectionMeta[section].staffOnly || canManage);

  return (
    <div className="border-t border-slate-100 px-6 py-5 dark:border-white/5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Class Dashboard</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choose an area to open inside this class.
          </p>
        </div>
        <Badge tone="slate">{visibleSections.length} sections</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleSections.map((section) => (
          <SectionCard key={section} classBase={classBase} section={section} />
        ))}
      </div>
    </div>
  );
}
