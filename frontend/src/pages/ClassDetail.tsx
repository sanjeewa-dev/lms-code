import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, Spinner } from '../components/ui';
import { Icon } from '../components/icons';
import { EnrollPanel } from '../components/class/EnrollPanel';
import { ClassEditModal } from '../components/class/ClassEditModal';
import { showToast } from '../components/AppToast';
import type { ClassSummary, Enrollment } from '../api/types';
import { isInstituteAdmin } from '../lib/roles';
import { isClassSection, LEGACY_TAB_TO_SECTION } from './class/classSections';
import { ClassSectionNav } from './class/ClassSectionNav';

export interface ClassOutletContext {
  klass: ClassSummary;
  enrollment: Enrollment | null;
  isStudent: boolean;
  canManage: boolean;
  hasAccess: boolean;
  classBase: string;
}

export default function ClassDetail() {
  const { slug, classId, section } = useParams<{ slug: string; classId: string; section?: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const t = useTenantApi();
  const classBase = `/${slug}/classes/${classId}`;
  const [editOpen, setEditOpen] = useState(false);

  const legacyTab = searchParams.get('tab');
  const legacySection = legacyTab ? LEGACY_TAB_TO_SECTION[legacyTab] : null;

  const detailQuery = useQuery({
    queryKey: ['class', classId],
    queryFn: async () =>
      (await t.get<{ class: ClassSummary; enrollment: Enrollment | null }>(`/classes/${classId}`)).data,
  });

  if (legacySection && !section) {
    return <Navigate to={`${classBase}/${legacySection}`} replace />;
  }

  if (detailQuery.isLoading) return <Spinner label="Loading class..." />;
  if (!detailQuery.data) return <p>Class not found.</p>;

  const { class: klass, enrollment } = detailQuery.data;
  const isStudent = user?.role === 'student';
  const isOwner = user?.role === 'teacher' && klass.teacher?.id === user.id;
  const canManage = isOwner || isInstituteAdmin(user?.role);
  const hasAccess = canManage || enrollment?.status === 'active';

  const outletContext: ClassOutletContext = {
    klass,
    enrollment,
    isStudent,
    canManage,
    hasAccess,
    classBase,
  };

  const activeSection = isClassSection(section) ? section : null;
  const metaBits = [klass.batch?.name, klass.teacher?.name ? `by ${klass.teacher.name}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand-600 dark:text-brand-400">
            <Link to={`/${slug}/classes`} className="hover:underline">
              My Classes
            </Link>
            <span className="text-slate-300 dark:text-slate-600"> › </span>
            <span className="text-slate-500 dark:text-slate-400">{klass.title}</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              {klass.title}
            </h1>
            {!klass.isPublished && <Badge tone="amber">Inactive</Badge>}
          </div>
          {metaBits && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{metaBits}</p>}
          {klass.description && (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {klass.description}
            </p>
          )}
        </div>
        {canManage && (
          <Button variant="secondary" className="shrink-0 gap-2" onClick={() => setEditOpen(true)}>
            <Icon name="edit" width={16} height={16} />
            Class Settings
          </Button>
        )}
      </div>

      {hasAccess && (
        <ClassSectionNav classBase={classBase} canManage={canManage} active={activeSection} />
      )}

      {isStudent && enrollment?.status !== 'active' && <EnrollPanel klass={klass} enrollment={enrollment} />}

      {hasAccess ? (
        <Outlet context={outletContext} />
      ) : (
        !isStudent && <Card>You do not have access to this class content.</Card>
      )}

      <ClassEditModal
        open={editOpen}
        klass={klass}
        onClose={() => setEditOpen(false)}
        onSaved={() => showToast('Class updated')}
      />
    </div>
  );
}
