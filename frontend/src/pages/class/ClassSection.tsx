import { Link, Navigate, useOutletContext, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui';
import { Icon } from '../../components/icons';
import { MaterialsTab } from '../../components/class/MaterialsTab';
import { QuizzesTab } from '../../components/class/QuizzesTab';
import { ScheduleTab } from '../../components/class/ScheduleTab';
import { SubmissionsTab } from '../../components/class/SubmissionsTab';
import { RosterTab } from '../../components/class/RosterTab';
import { GradebookTab } from '../../components/class/GradebookTab';
import { ClassAttendanceTab } from '../../components/class/ClassAttendanceTab';
import type { ClassOutletContext } from '../ClassDetail';
import { isClassSection, sectionMeta } from './classSections';

export default function ClassSection() {
  const { section } = useParams<{ section: string }>();
  const { klass, canManage, isStudent, classBase, hasAccess } = useOutletContext<ClassOutletContext>();

  if (!hasAccess) {
    return null;
  }

  if (!isClassSection(section)) {
    return <Navigate to={classBase} replace />;
  }

  if (sectionMeta[section].staffOnly && !canManage) {
    return <Navigate to={classBase} replace />;
  }

  const meta = sectionMeta[section];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-white/5 dark:bg-ink-850">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={classBase}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            <Icon name="chevron" width={14} height={14} className="rotate-180" />
            Back to dashboard
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">{meta.label}</Badge>
              <p className="text-sm text-slate-500 dark:text-slate-400">{meta.hint}</p>
            </div>
          </div>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${meta.tone}`}>
          <Icon name={meta.icon} width={18} height={18} />
        </span>
      </div>

      {section === 'materials' && <MaterialsTab classId={klass.id} canManage={canManage} />}
      {section === 'schedule' && <ScheduleTab classId={klass.id} classTitle={klass.title} canManage={canManage} />}
      {section === 'quizzes' && (
        <QuizzesTab
          classId={klass.id}
          classTitle={klass.title}
          canManage={canManage}
          isStudent={isStudent}
        />
      )}
      {section === 'assignments' && (
        <SubmissionsTab classId={klass.id} isStudent={isStudent} canManage={canManage} />
      )}
      {section === 'grades' && <GradebookTab classId={klass.id} />}
      {section === 'students' && canManage && (
        <RosterTab classId={klass.id} classTitle={klass.title} />
      )}
      {section === 'attendance' && canManage && <ClassAttendanceTab classId={klass.id} />}
    </div>
  );
}
