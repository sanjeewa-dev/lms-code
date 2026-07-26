import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { Badge, Card, Spinner } from '../components/ui';
import { EnrollPanel } from '../components/class/EnrollPanel';
import { MaterialsTab } from '../components/class/MaterialsTab';
import { QuizzesTab } from '../components/class/QuizzesTab';
import { ScheduleTab } from '../components/class/ScheduleTab';
import { SubmissionsTab } from '../components/class/SubmissionsTab';
import { RosterTab } from '../components/class/RosterTab';
import { GradebookTab } from '../components/class/GradebookTab';
import type { ClassSummary, Enrollment } from '../api/types';

type Tab = 'materials' | 'schedule' | 'quizzes' | 'submissions' | 'roster' | 'grades';

const VALID_TABS: Tab[] = ['materials', 'schedule', 'quizzes', 'submissions', 'roster', 'grades'];

function tabFromSearch(value: string | null): Tab {
  return value && VALID_TABS.includes(value as Tab) ? (value as Tab) : 'materials';
}

export default function ClassDetail() {
  const { classId } = useParams<{ classId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const t = useTenantApi();
  const [tab, setTab] = useState<Tab>(() => tabFromSearch(searchParams.get('tab')));

  useEffect(() => {
    setTab(tabFromSearch(searchParams.get('tab')));
  }, [searchParams]);

  function selectTab(next: Tab) {
    setTab(next);
    setSearchParams(next === 'materials' ? {} : { tab: next }, { replace: true });
  }

  const detailQuery = useQuery({
    queryKey: ['class', classId],
    queryFn: async () =>
      (await t.get<{ class: ClassSummary; enrollment: Enrollment | null }>(`/classes/${classId}`)).data,
  });

  if (detailQuery.isLoading) return <Spinner label="Loading class..." />;
  if (!detailQuery.data) return <p>Class not found.</p>;

  const { class: klass, enrollment } = detailQuery.data;
  const isStudent = user?.role === 'student';
  const isOwner = user?.role === 'teacher' && klass.teacher?.id === user.id;
  const canManage = isOwner || user?.role === 'admin';
  const hasAccess = canManage || enrollment?.status === 'active';

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'materials', label: 'Materials', show: true },
    { id: 'schedule', label: 'Schedule', show: true },
    { id: 'quizzes', label: 'Quizzes', show: true },
    { id: 'submissions', label: 'Assignments', show: true },
    { id: 'grades', label: 'Grades', show: true },
    { id: 'roster', label: 'Students', show: !!canManage },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{klass.title}</h1>
          <Badge tone="blue">{klass.price > 0 ? `Rs. ${klass.price.toLocaleString()}` : 'Free'}</Badge>
          {klass.batch && <Badge tone="slate">{klass.batch.name}</Badge>}
        </div>
        <p className="text-slate-500 dark:text-slate-400">by {klass.teacher?.name}</p>
        {klass.description && (
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">{klass.description}</p>
        )}
      </div>

      {isStudent && enrollment?.status !== 'active' && <EnrollPanel klass={klass} enrollment={enrollment} />}

      {hasAccess ? (
        <div>
          <div className="mb-4 flex gap-1 border-b border-slate-200 dark:border-white/5">
            {tabs
              .filter((tb) => tb.show)
              .map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => selectTab(tb.id)}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                    tab === tb.id
                      ? 'border-brand-600 text-brand-700 dark:text-brand-300'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {tb.label}
                </button>
              ))}
          </div>

          {tab === 'materials' && <MaterialsTab classId={klass.id} canManage={!!canManage} />}
          {tab === 'schedule' && <ScheduleTab classId={klass.id} canManage={!!canManage} />}
          {tab === 'quizzes' && <QuizzesTab classId={klass.id} canManage={!!canManage} isStudent={isStudent} />}
          {tab === 'submissions' && (
            <SubmissionsTab classId={klass.id} isStudent={isStudent} canManage={!!canManage} />
          )}
          {tab === 'grades' && <GradebookTab classId={klass.id} />}
          {tab === 'roster' && canManage && <RosterTab classId={klass.id} classTitle={klass.title} />}
        </div>
      ) : (
        !isStudent && <Card>You do not have access to this class content.</Card>
      )}
    </div>
  );
}
