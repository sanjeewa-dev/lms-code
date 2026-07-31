import { Navigate, useOutletContext, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui';
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
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{meta.label}</Badge>
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
      {section === 'grades' && <GradebookTab classId={klass.id} classTitle={klass.title} />}
      {section === 'students' && canManage && (
        <RosterTab classId={klass.id} classTitle={klass.title} />
      )}
      {section === 'attendance' && canManage && <ClassAttendanceTab classId={klass.id} />}
    </div>
  );
}
