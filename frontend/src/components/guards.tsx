import { Navigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';
import type { Role } from '../api/types';

export function ProtectedAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading..." />;
  if (!user || user.role !== 'superadmin') {
    const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
    return <Navigate to={next.startsWith('/') ? `/login?next=${encodeURIComponent(next)}` : '/login'} replace />;
  }
  return <>{children}</>;
}

export function ProtectedTenant({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const { slug } = useParams<{ slug: string }>();

  if (loading) return <Spinner label="Loading..." />;
  if (!user) {
    const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
    return <Navigate to={next.startsWith('/') ? `/login?next=${encodeURIComponent(next)}` : '/login'} replace />;
  }

  const inSupport =
    user.role === 'superadmin' &&
    Boolean(user.supportSession || (typeof window !== 'undefined' && localStorage.getItem('lms_support_meta')));

  if (user.role === 'superadmin' && !inSupport) return <Navigate to="/admin" replace />;

  // Path security: a tenant user may only access their own institute's space.
  // Support sessions may enter the tenant slug stored on the session.
  if (user.role !== 'superadmin') {
    if (user.tenantSlug && slug && slug !== user.tenantSlug) {
      return <Navigate to={`/${user.tenantSlug}/dashboard`} replace />;
    }
  } else if (inSupport) {
    const supportSlug = user.supportSession?.tenantSlug ?? user.tenantSlug;
    if (supportSlug && slug && slug !== supportSlug) {
      return <Navigate to={`/${supportSlug}/dashboard`} replace />;
    }
  }

  if (roles && user.role !== 'superadmin' && !roles.includes(user.role)) {
    return <Navigate to={`/${slug}/dashboard`} replace />;
  }
  // Support mode: treat superadmin as staff for role-gated pages
  return <>{children}</>;
}
