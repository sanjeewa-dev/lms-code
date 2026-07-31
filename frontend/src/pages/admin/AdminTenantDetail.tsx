import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage, tokenStore } from '../../api/client';
import { Badge, Button, Card, Input, Modal, Spinner } from '../../components/ui';
import { PasswordRequirements, passwordMismatchError } from '../../components/PasswordRequirements';
import { useAuth } from '../../context/AuthContext';
import { AdminStatCard } from '../../components/admin/AdminUi';
import { showToast } from '../../components/AppToast';
import type { IconName } from '../../components/icons';
import { validatePassword } from '../../lib/passwordValidation';

type TenantAdmin = { id: string; name: string; email: string; invitePending?: boolean };

const FEATURE_OPTIONS = [
  ['aiStudent', 'AI Student Area'],
  ['aiTeacher', 'AI Teacher Copilot'],
  ['parentTrust', 'Parent Trust Center'],
  ['interventions', 'Interventions'],
  ['smartJobs', 'Smart Jobs'],
] as const;

type FeatureKey = (typeof FEATURE_OPTIONS)[number][0];
type FeatureMap = Record<FeatureKey, boolean>;

type InstituteDraft = {
  name: string;
  plan: 'pro' | 'enterprise';
  isActive: boolean;
  features: FeatureMap;
};

function emptyFeatures(src?: Record<string, unknown>): FeatureMap {
  return {
    aiStudent: Boolean(src?.aiStudent),
    aiTeacher: Boolean(src?.aiTeacher),
    parentTrust: Boolean(src?.parentTrust),
    interventions: Boolean(src?.interventions),
    smartJobs: Boolean(src?.smartJobs),
  };
}

function draftsEqual(a: InstituteDraft, b: InstituteDraft) {
  if (a.name !== b.name || a.plan !== b.plan || a.isActive !== b.isActive) return false;
  return FEATURE_OPTIONS.every(([key]) => a.features[key] === b.features[key]);
}

function draftFromTenant(tenant: {
  name?: string;
  plan?: string;
  isActive?: boolean;
  features?: Record<string, unknown>;
}): InstituteDraft {
  return {
    name: tenant.name ?? '',
    plan: tenant.plan === 'enterprise' ? 'enterprise' : 'pro',
    isActive: Boolean(tenant.isActive),
    features: emptyFeatures(tenant.features ?? {}),
  };
}

export default function AdminTenantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteErr, setInviteErr] = useState('');
  const [supportReason, setSupportReason] = useState('');
  const [showSupport, setShowSupport] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<TenantAdmin | null>(null);
  const [overridePassword, setOverridePassword] = useState('');
  const [overrideConfirmPassword, setOverrideConfirmPassword] = useState('');
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [overrideErr, setOverrideErr] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState<InstituteDraft | null>(null);
  const [baseline, setBaseline] = useState<InstituteDraft | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const dirtyRef = useRef(false);
  const pendingHrefRef = useRef<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['admin-tenant-detail', id],
    queryFn: async () => (await api.get(`/admin/tenants/${id}/detail`)).data,
    enabled: !!id,
  });

  const isDirty = Boolean(draft && baseline && !draftsEqual(draft, baseline));
  dirtyRef.current = isDirty;

  useEffect(() => {
    const tenant = detailQuery.data?.tenant;
    if (!tenant || dirtyRef.current) return;
    const next = draftFromTenant(tenant);
    setDraft(next);
    setBaseline(next);
  }, [id, detailQuery.dataUpdatedAt]);

  // Block in-app link navigation while dirty (works with BrowserRouter).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };

    const onDocClick = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const el = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!el) return;
      const href = el.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }
      if (href.startsWith('http') && !href.includes(window.location.host)) return;

      try {
        const url = new URL(href, window.location.origin);
        if (url.pathname + url.search === window.location.pathname + window.location.search) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        pendingHrefRef.current = url.pathname + url.search + url.hash;
        setLeaveOpen(true);
      } catch {
        /* ignore invalid href */
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onDocClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onDocClick, true);
    };
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      return (
        await api.patch(`/admin/tenants/${id}`, {
          name: draft.name.trim(),
          plan: draft.plan,
          isActive: draft.isActive,
          planFeatures: draft.features,
        })
      ).data;
    },
    onSuccess: async () => {
      setMsg('Institute changes saved');
      setErr('');
      const refreshed = await qc.fetchQuery({
        queryKey: ['admin-tenant-detail', id],
        queryFn: async () => (await api.get(`/admin/tenants/${id}/detail`)).data,
      });
      const next = draftFromTenant(refreshed.tenant);
      setDraft(next);
      setBaseline(next);
      dirtyRef.current = false;
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
    },
    onError: (e) => {
      setErr(apiErrorMessage(e));
      setMsg('');
    },
  });

  function closeInviteModal() {
    setInviteOpen(false);
    setInviteEmail('');
    setInviteErr('');
  }

  const inviteAdminMutation = useMutation({
    mutationFn: async () =>
      (await api.post<{ invited: boolean }>(`/admin/tenants/${id}/admins/invite`, {
        email: inviteEmail.trim(),
      })).data,
    onSuccess: () => {
      closeInviteModal();
      qc.invalidateQueries({ queryKey: ['admin-tenant-detail', id] });
      showToast('Invite email sent — they can set up their account from the link');
      setErr('');
      setMsg('');
    },
    onError: (e) => setInviteErr(apiErrorMessage(e)),
  });

  function closeOverrideModal() {
    setOverrideTarget(null);
    setOverridePassword('');
    setOverrideConfirmPassword('');
    setOverrideConfirmed(false);
    setOverrideErr('');
  }

  const overridePasswordMutation = useMutation({
    mutationFn: async () => {
      if (!overrideTarget) throw new Error('No admin selected');
      const pwdErr = validatePassword(overridePassword);
      if (pwdErr) throw new Error(pwdErr);
      if (overridePassword !== overrideConfirmPassword) {
        throw new Error('Passwords do not match');
      }
      if (!overrideConfirmed) throw new Error('Please confirm the override');
      return (
        await api.post(`/admin/tenants/${id}/admins/${overrideTarget.id}/override-password`, {
          password: overridePassword,
          confirm: true,
        })
      ).data;
    },
    onSuccess: () => {
      const name = overrideTarget?.name ?? 'admin';
      closeOverrideModal();
      setMsg(`Password overridden for ${name}`);
      setErr('');
    },
    onError: (e) => setOverrideErr(apiErrorMessage(e)),
  });

  const supportMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/admin/tenants/${id}/support-session`, { reason: supportReason })
      ).data as {
        accessToken: string;
        session: { id: string; tenantId: string; tenantSlug: string; tenantName: string };
      },
    onSuccess: async (data) => {
      tokenStore.beginSupport(data.accessToken, {
        sessionId: data.session.id,
        tenantId: data.session.tenantId,
        tenantSlug: data.session.tenantSlug,
        tenantName: data.session.tenantName,
      });
      await refreshUser();
      navigate(`/${data.session.tenantSlug}/dashboard`);
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  function discardDraft() {
    if (!baseline) return;
    setDraft({ ...baseline, features: { ...baseline.features } });
    dirtyRef.current = false;
    setMsg('');
    setErr('');
  }

  function goPending() {
    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;
    setLeaveOpen(false);
    if (href) navigate(href);
  }

  async function saveAndProceed() {
    try {
      await saveMutation.mutateAsync();
      goPending();
    } catch {
      /* error shown via mutation */
    }
  }

  function discardAndProceed() {
    discardDraft();
    goPending();
  }

  function stayEditing() {
    pendingHrefRef.current = null;
    setLeaveOpen(false);
  }

  const canSave = useMemo(() => {
    if (!isDirty || !draft) return false;
    return draft.name.trim().length >= 2;
  }, [isDirty, draft]);

  if (detailQuery.isLoading || !detailQuery.data || !draft) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const { tenant, stats, admins, classes, students, teachers, atRisk } = detailQuery.data;

  const statItems: {
    label: string;
    value: number;
    icon: IconName;
    tone: 'blue' | 'green' | 'purple' | 'amber' | 'sky' | 'pink';
  }[] = [
    { label: 'Students', value: stats.students, icon: 'users', tone: 'blue' },
    { label: 'Teachers', value: stats.teachers, icon: 'teacher', tone: 'purple' },
    { label: 'Classes', value: stats.classes, icon: 'classes', tone: 'sky' },
    { label: 'Pending payments', value: stats.pendingPayments, icon: 'payments', tone: 'amber' },
    { label: 'Enrollments', value: stats.enrollments, icon: 'idcard', tone: 'green' },
    { label: 'AI tokens', value: stats.aiTokensUsed, icon: 'spark', tone: 'purple' },
    { label: 'Open interventions', value: stats.openInterventions, icon: 'bell', tone: 'pink' },
    { label: 'At-risk', value: stats.atRiskCount, icon: 'chart', tone: 'amber' },
  ];

  return (
    <div className={`space-y-6 ${isDirty ? 'pb-24' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/tenants" className="text-sm text-slate-500 hover:text-brand-600">
            ← Institutes
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <span className="brand-chip h-12 w-12 text-lg font-extrabold">
              {draft.name[0]?.toUpperCase() ?? 'I'}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {draft.name || tenant.name}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">/{tenant.slug}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDirty && <Badge tone="amber">Unsaved changes</Badge>}
          <Badge tone={draft.isActive ? 'green' : 'red'}>{draft.isActive ? 'active' : 'inactive'}</Badge>
          <Badge tone="blue">{draft.plan.toUpperCase()}</Badge>
          <Button onClick={() => setShowSupport(true)}>Enter as support</Button>
        </div>
      </div>

      {(msg || err) && (
        <p className={`text-sm ${err ? 'text-red-600' : 'text-emerald-600'}`}>{err || msg}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statItems.map((s) => (
          <AdminStatCard key={s.label} label={s.label} value={s.value} icon={s.icon} tone={s.tone} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Institute settings</h2>
            {isDirty && <span className="text-xs font-medium text-amber-600">Edit in progress</span>}
          </div>

          <div className="space-y-4">
            <Input
              label="Institute name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />

            <div>
              <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Status</p>
              <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
                <span className="text-slate-700 dark:text-slate-300">Institute active</span>
                <input
                  type="checkbox"
                  className="accent-brand-600"
                  checked={draft.isActive}
                  onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                />
              </label>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Plan</p>
              <div className="flex gap-2">
                {(['pro', 'enterprise'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setDraft({ ...draft, plan: p })}
                    className={`rounded-lg border px-4 py-1.5 text-sm font-semibold transition ${
                      draft.plan === p
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-brand-300 dark:border-white/10 dark:text-slate-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Feature overrides
              </h3>
              <div className="space-y-2">
                {FEATURE_OPTIONS.map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/5"
                  >
                    <span className="text-slate-700 dark:text-slate-300">{label}</span>
                    <input
                      type="checkbox"
                      className="accent-brand-600"
                      checked={draft.features[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          features: { ...draft.features, [key]: e.target.checked },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!canSave || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              <Button
                variant="secondary"
                onClick={discardDraft}
                disabled={!isDirty || saveMutation.isPending}
              >
                Discard
              </Button>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            PayHere: {tenant.payhereEnabled ? 'enabled' : 'off'}
            {tenant.hasPayhereSecret ? ' · secret set' : ' · no secret'}
          </p>
        </Card>

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Admins</h2>
            <Button onClick={() => setInviteOpen(true)}>Add admin</Button>
          </div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Passwords are never shown. Invite by email — they set up their own account. Use override
            only if an admin forgets their password.
          </p>
          <ul className="space-y-4">
            {(admins as TenantAdmin[]).map((a) => (
              <li
                key={a.id}
                className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {a.invitePending ? <Badge tone="amber">Invite pending</Badge> : null}
                </div>
                <Input label="Name" value={a.name} readOnly autoComplete="off" />
                <Input label="Email" value={a.email} readOnly autoComplete="off" />
                {!a.invitePending ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setOverrideTarget(a);
                      setOverridePassword('');
                      setOverrideConfirmPassword('');
                      setOverrideConfirmed(false);
                      setOverrideErr('');
                    }}
                  >
                    Override password
                  </Button>
                ) : (
                  <p className="text-xs text-slate-500">
                    Waiting for them to complete setup from the invite email.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Class health</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-2 font-medium">Class</th>
                <th className="font-medium">Teacher</th>
                <th className="font-medium">Enrollments</th>
                <th className="font-medium">Attempts</th>
                <th className="font-medium">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c: any) => (
                <tr key={c.id} className="border-t border-slate-100 dark:border-white/5">
                  <td className="py-2.5 font-medium text-slate-800 dark:text-slate-100">{c.title}</td>
                  <td className="text-slate-600 dark:text-slate-300">{c.teacher?.name ?? '—'}</td>
                  <td>{c.enrollments}</td>
                  <td>{c.quizAttempts}</td>
                  <td>{c.attendanceRate != null ? `${c.attendanceRate}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Teachers</h2>
          <ul className="space-y-2 text-sm">
            {teachers.map((t: any) => (
              <li
                key={t.id}
                className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5"
              >
                <span className="font-medium">{t.name}</span>
                <span className="text-slate-400">{t._count.classesOwned} classes</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">
            Students (recent)
          </h2>
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {students.map((s: any) => (
              <li
                key={s.id}
                className="flex justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5"
              >
                <span>
                  <span className="font-medium">{s.name}</span>{' '}
                  <span className="text-xs text-slate-400">
                    {s.status}
                    {s.guardianEmail ? ' · guardian' : ''}
                  </span>
                </span>
                <span className="text-slate-400">{s._count.enrollments} enr.</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {atRisk?.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">
            At-risk snapshot
          </h2>
          <ul className="space-y-2 text-sm">
            {atRisk.map((s: any) => (
              <li
                key={s.studentId}
                className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 dark:border-amber-900/30 dark:bg-amber-950/20"
              >
                <span className="font-medium text-slate-800 dark:text-slate-100">{s.name}</span>
                <span className="text-slate-500"> — {s.reasons.join(', ')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isDirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-200/80 bg-amber-50/95 px-4 py-3 shadow-lg backdrop-blur dark:border-amber-900/40 dark:bg-ink-850/95">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              You have unsaved institute changes. Save before leaving this page.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={discardDraft} disabled={saveMutation.isPending}>
                Discard
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!canSave || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal open={leaveOpen} onClose={stayEditing} title="Unsaved changes" className="max-w-md">
        <p className="-mt-1 mb-4 text-sm text-slate-600 dark:text-slate-300">
          You edited this institute but haven&apos;t saved. Save your changes, discard them, or stay on
          this page.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={stayEditing}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={discardAndProceed} disabled={saveMutation.isPending}>
            Discard & leave
          </Button>
          <Button onClick={saveAndProceed} disabled={!canSave || saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save & leave'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={inviteOpen}
        onClose={closeInviteModal}
        title="Invite institute admin"
        className="max-w-md"
      >
        <div className="space-y-4">
          <p className="-mt-2 text-sm text-slate-500">
            Enter their email. They&apos;ll receive a link to set their name and password.
          </p>
          <Input
            label="Email"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="admin@institute.com"
            autoComplete="off"
          />
          {inviteErr && <p className="text-sm text-red-600">{inviteErr}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeInviteModal}>
              Cancel
            </Button>
            <Button
              onClick={() => inviteAdminMutation.mutate()}
              disabled={!inviteEmail.trim() || inviteAdminMutation.isPending}
            >
              {inviteAdminMutation.isPending ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(overrideTarget)}
        onClose={closeOverrideModal}
        title="Override admin password"
        className="max-w-md"
      >
        <div className="space-y-4">
          <p className="-mt-2 text-sm text-slate-500">
            Their current password cannot be viewed and will be replaced immediately. Active sessions
            will be signed out.
          </p>
          <Input label="Name" value={overrideTarget?.name ?? ''} readOnly />
          <Input label="Email" value={overrideTarget?.email ?? ''} readOnly />
          <Input
            label="New password"
            type="password"
            placeholder="Create a strong password"
            value={overridePassword}
            onChange={(e) => setOverridePassword(e.target.value)}
            autoComplete="new-password"
          />
          <PasswordRequirements password={overridePassword} />
          <Input
            label="Confirm new password"
            type="password"
            placeholder="Re-enter your password"
            value={overrideConfirmPassword}
            onChange={(e) => setOverrideConfirmPassword(e.target.value)}
            autoComplete="new-password"
            error={passwordMismatchError(overridePassword, overrideConfirmPassword)}
          />
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="mt-1"
              checked={overrideConfirmed}
              onChange={(e) => setOverrideConfirmed(e.target.checked)}
            />
            <span>
              I understand this permanently replaces their password and cannot be undone.
            </span>
          </label>
          {overrideErr && <p className="text-sm text-red-600">{overrideErr}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeOverrideModal}>
              Cancel
            </Button>
            <Button
              onClick={() => overridePasswordMutation.mutate()}
              disabled={
                !overrideConfirmed ||
                !overridePassword ||
                !overrideConfirmPassword ||
                Boolean(validatePassword(overridePassword)) ||
                overridePasswordMutation.isPending
              }
            >
              {overridePasswordMutation.isPending ? 'Overriding…' : 'Override password'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showSupport}
        onClose={() => setShowSupport(false)}
        title="Enter as support"
        className="max-w-md"
      >
        <div className="space-y-4">
          <p className="-mt-2 text-sm text-slate-500">
            Reason is required and will be audited (session lasts 2 hours).
          </p>
          <textarea
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            rows={3}
            placeholder="Why are you entering this institute?"
            value={supportReason}
            onChange={(e) => setSupportReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowSupport(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => supportMutation.mutate()}
              disabled={supportReason.trim().length < 5 || supportMutation.isPending || isDirty}
              title={isDirty ? 'Save or discard institute changes first' : undefined}
            >
              {supportMutation.isPending ? 'Starting…' : 'Start support session'}
            </Button>
          </div>
          {isDirty && (
            <p className="text-xs text-amber-600">
              Save or discard institute edits before entering support.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
