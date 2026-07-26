import { Navigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';
import type { Role } from '../api/types';

export function ProtectedAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading..." />;
  if (!user || user.role !== 'superadmin') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function ProtectedTenant({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const { slug } = useParams<{ slug: string }>();

  if (loading) return <Spinner label="Loading..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'superadmin') return <Navigate to="/admin" replace />;
  // Path security: a tenant user may only access their own institute's space.
  if (user.tenantSlug && slug && slug !== user.tenantSlug) {
    return <Navigate to={`/${user.tenantSlug}/dashboard`} replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={`/${slug}/dashboard`} replace />;
  return <>{children}</>;
}
