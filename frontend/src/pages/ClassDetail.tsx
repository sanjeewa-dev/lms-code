import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { Badge, Card, Spinner } from '../components/ui';
import { BrandMark, useInstituteBrand } from '../components/BrandMark';
import { EnrollPanel } from '../components/class/EnrollPanel';
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
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/5 dark:bg-ink-850">
        <div className="bg-brand-gradient px-6 py-6 text-white">
          <div className="flex flex-wrap items-start gap-4">
            <BrandMark name={klass.title} logoUrl={logoUrl} size="lg" className="ring-white/30" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold">{klass.title}</h1>
                <Badge tone="blue">{klass.price > 0 ? `Rs. ${klass.price.toLocaleString()}` : 'Free'}</Badge>
                {klass.batch && <Badge tone="slate">{klass.batch.name}</Badge>}
              </div>
              <p className="mt-1 text-sm text-white/80">by {klass.teacher?.name}</p>
              {klass.description && <p className="mt-3 max-w-3xl text-sm text-white/85">{klass.description}</p>}
            </div>
          </div>
        </div>

        {hasAccess && onDashboard && <Outlet context={outletContext} />}
      </div>

      {isStudent && enrollment?.status !== 'active' && <EnrollPanel klass={klass} enrollment={enrollment} />}

      {hasAccess ? (
        !onDashboard && <Outlet context={outletContext} />
      ) : (
        !isStudent && <Card>You do not have access to this class content.</Card>
      )}
    </div>
  );
}
