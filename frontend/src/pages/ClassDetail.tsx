import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, Spinner } from '../components/ui';
import { BrandMark, useInstituteBrand } from '../components/BrandMark';
import { Icon } from '../components/icons';
import { EnrollPanel } from '../components/class/EnrollPanel';
import { ClassEditModal } from '../components/class/ClassEditModal';
import { showToast } from '../components/AppToast';
import type { ClassSummary, Enrollment } from '../api/types';
import { LEGACY_TAB_TO_SECTION } from './class/classSections';

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
  const brandQuery = useInstituteBrand(slug);
  const logoUrl = brandQuery.data?.tenant.logoUrl;
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
  const canManage = isOwner || user?.role === 'admin';
  const hasAccess = canManage || enrollment?.status === 'active';

  const outletContext: ClassOutletContext = {
    klass,
    enrollment,
    isStudent,
    canManage,
    hasAccess,
    classBase,
  };

  const onDashboard = !section;

  return (
    <div className="space-y-6">
      {onDashboard ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/5 dark:bg-ink-850">
          <div className="bg-brand-gradient px-6 py-6 text-white">
            <div className="flex flex-wrap items-start gap-4">
              <BrandMark name={klass.title} logoUrl={logoUrl} size="lg" className="ring-white/30" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold">{klass.title}</h1>
                  {klass.batch && <Badge onGradient>{klass.batch.name}</Badge>}
                  {!klass.isPublished && (
                    <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-semibold text-amber-50 ring-1 ring-amber-200/40">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-white/80">by {klass.teacher?.name}</p>
                {klass.description && (
                  <p className="mt-3 max-w-3xl text-sm text-white/85">{klass.description}</p>
                )}
              </div>
              {canManage && (
                <Button variant="ghostLight" className="shrink-0" onClick={() => setEditOpen(true)}>
                  Edit class
                </Button>
              )}
            </div>
          </div>

          {hasAccess && <Outlet context={outletContext} />}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={classBase}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
          >
            <Icon name="chevron" width={14} height={14} className="rotate-180" />
            Class
          </Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{klass.title}</h1>
          {!klass.isPublished && <Badge tone="amber">Inactive</Badge>}
          {canManage && (
            <Button
              variant="secondary"
              className="ml-auto !px-3 !py-1.5 !text-xs"
              onClick={() => setEditOpen(true)}
            >
              Edit class
            </Button>
          )}
        </div>
      )}

      {isStudent && enrollment?.status !== 'active' && <EnrollPanel klass={klass} enrollment={enrollment} />}

      {hasAccess ? (
        !onDashboard && <Outlet context={outletContext} />
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
