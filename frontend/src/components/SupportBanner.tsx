import { useNavigate } from 'react-router-dom';
import { api, tokenStore } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui';

/** Persistent banner while a superadmin is inside a tenant via support mode. */
export function SupportBanner() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const meta = tokenStore.getSupportMeta();
  const session = user?.supportSession ?? (meta
    ? { id: meta.sessionId, tenantName: meta.tenantName, tenantSlug: meta.tenantSlug, tenantId: meta.tenantId, expiresAt: '' }
    : null);

  if (!session || user?.role !== 'superadmin') return null;

  async function endSession() {
    try {
      if (session) await api.post(`/admin/support-sessions/${session.id}/end`);
    } catch {
      /* still exit locally */
    }
    tokenStore.endSupport();
    await refreshUser();
    navigate(`/admin/tenants/${session!.tenantId}`);
  }

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-ink-900">
      <span>
        Support mode — {session.tenantName || session.tenantSlug}. Actions are audited.
      </span>
      <Button className="!bg-ink-900 !text-white !px-3 !py-1 !text-xs" onClick={endSession}>
        End session
      </Button>
    </div>
  );
}
