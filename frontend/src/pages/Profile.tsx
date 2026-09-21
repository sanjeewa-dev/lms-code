import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage, authFetchBlob } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTenantApi } from '../hooks/useTenantApi';
import { Badge, Button, Card, Input, Select, Spinner } from '../components/ui';
import { Icon } from '../components/icons';
import { PasswordRequirements, passwordMismatchError } from '../components/PasswordRequirements';
import { validatePassword } from '../lib/passwordValidation';
import { PageHeader } from '../components/tenant/TenantUi';
import { showToast } from '../components/AppToast';
import { SRI_LANKAN_DISTRICTS } from '../lib/districts';
import type { UserProfile } from '../api/types';

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === 'superadmin';
  const slug = t.slug;

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    guardianName: '',
    guardianPhone: '',
    guardianEmail: '',
    area: '',
    district: '',
    school: '',
    address: '',
    shippingLabelPhotoOnly: false,
  });
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoObjectUrlRef = useRef<string | null>(null);
  const loadedPhotoKeyRef = useRef<string | null>(null);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const profileQuery = useQuery({
    queryKey: ['profile', isSuperAdmin ? 'platform' : slug],
    queryFn: async () => {
      if (isSuperAdmin) {
        return (await api.get<{ profile: UserProfile }>('/admin/profile')).data.profile;
      }
      return (await t.get<{ profile: UserProfile }>('/profile')).data.profile;
    },
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const photoKey = profileQuery.data?.shippingLabelPhotoUrl ?? null;

  useEffect(() => {
    const p = profileQuery.data;
    if (!p) return;
    setForm((prev) => {
      const next = {
        name: p.name,
        email: p.email,
        phone: p.phone ?? '',
        subject: p.subject ?? '',
        guardianName: p.guardianName ?? '',
        guardianPhone: p.guardianPhone ?? '',
        guardianEmail: (p as { guardianEmail?: string | null }).guardianEmail ?? '',
        area: p.area ?? '',
        district: p.district ?? '',
        school: p.school ?? '',
        address: p.address ?? '',
        shippingLabelPhotoOnly: Boolean(p.shippingLabelPhotoOnly),
      };
      const same = (Object.keys(next) as (keyof typeof next)[]).every((k) => prev[k] === next[k]);
      return same ? prev : next;
    });
  }, [profileQuery.data]);

  // Load shipping-label photo once per photoKey; never revoke the active blob in effect cleanup
  // (that caused StrictMode / remount flicker loops).
  useEffect(() => {
    if (user?.role !== 'teacher' || !slug || !photoKey) {
      if (photoObjectUrlRef.current) {
        URL.revokeObjectURL(photoObjectUrlRef.current);
        photoObjectUrlRef.current = null;
      }
      loadedPhotoKeyRef.current = null;
      setPhotoPreviewUrl(null);
      return;
    }

    if (loadedPhotoKeyRef.current === photoKey && photoObjectUrlRef.current) {
      return;
    }

    let cancelled = false;
    const path = photoKey.startsWith('/api/') ? photoKey.slice(4) : photoKey;

    void (async () => {
      try {
        const blob = await authFetchBlob(path);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (photoObjectUrlRef.current) URL.revokeObjectURL(photoObjectUrlRef.current);
        photoObjectUrlRef.current = url;
        loadedPhotoKeyRef.current = photoKey;
        setPhotoPreviewUrl(url);
      } catch {
        if (!cancelled) {
          loadedPhotoKeyRef.current = null;
          setPhotoPreviewUrl(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [photoKey, slug, user?.role]);

  useEffect(() => {
    return () => {
      if (photoObjectUrlRef.current) {
        URL.revokeObjectURL(photoObjectUrlRef.current);
        photoObjectUrlRef.current = null;
      }
    };
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isSuperAdmin) {
        return (
          await api.patch<{ profile: UserProfile; user: typeof user }>('/admin/profile', {
            name: form.name.trim(),
            email: form.email.trim(),
          })
        ).data;
      }

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      };

      if (user?.role === 'teacher') {
        payload.subject = form.subject.trim();
        payload.address = form.address.trim();
        payload.shippingLabelPhotoOnly = form.shippingLabelPhotoOnly;
      }
      if (user?.role === 'student') {
        payload.guardianName = form.guardianName.trim();
        payload.guardianPhone = form.guardianPhone.trim();
        payload.guardianEmail = form.guardianEmail.trim();
        payload.area = form.area.trim();
        if (form.district) payload.district = form.district;
        payload.school = form.school.trim();
        payload.address = form.address.trim();
      }

      return (await t.patch<{ profile: UserProfile; user: typeof user }>('/profile', payload)).data;
    },
    onSuccess: (data) => {
      setProfileError('');
      setProfileSuccess('Profile updated successfully.');
      showToast('Profile updated.');
      if (data.user) updateUser(data.user);
      queryClient.invalidateQueries({ queryKey: ['profile', isSuperAdmin ? 'platform' : t.slug] });
    },
    onError: (err) => {
      const msg = apiErrorMessage(err);
      setProfileError(msg);
      showToast(msg, 'error');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        currentPassword: pwd.current,
        newPassword: pwd.next,
        confirmPassword: pwd.confirm,
      };
      if (isSuperAdmin) {
        return (await api.post('/admin/profile/password', payload)).data;
      }
      return (await t.post('/profile/password', payload)).data;
    },
    onSuccess: () => {
      setPwdError('');
      setPwdSuccess('Password changed successfully.');
      showToast('Password changed.');
      setPwd({ current: '', next: '', confirm: '' });
    },
    onError: (err) => {
      const msg = apiErrorMessage(err);
      setPwdError(msg);
      showToast(msg, 'error');
    },
  });

  function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSuccess('');
    saveMutation.mutate();
  }

  function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdSuccess('');
    const err = validatePassword(pwd.next);
    if (err) {
      setPwdError(err);
      return;
    }
    if (pwd.next !== pwd.confirm) {
      setPwdError('New passwords do not match');
      return;
    }
    passwordMutation.mutate();
  }

  const profile = profileQuery.data;
  const initials = (form.name || 'U')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        icon="user"
        tone="blue"
        title="My profile"
        subtitle="Manage your account details and password"
      />

      {profileQuery.isLoading ? (
        <Spinner label="Loading profile..." />
      ) : (
        <>
          <Card className="overflow-hidden rounded-2xl p-0">
            <div className="bg-brand-gradient px-6 py-6 text-white">
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20 text-xl font-bold">
                  {initials}
                </span>
                <div>
                  <h2 className="text-xl font-bold">{form.name || 'Your account'}</h2>
                  <p className="text-sm text-white/80">{form.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profile && (
                      <Badge tone="slate" onGradient>
                        {profile.role}
                      </Badge>
                    )}
                    {profile?.tenantName && (
                      <Badge tone="blue" onGradient>
                        {profile.tenantName}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={submitProfile} className="space-y-4 p-6">
              <h3 className="font-semibold text-slate-900 dark:text-white">Personal information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Full name *</span>
                  <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email *</span>
                  <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </label>
              </div>

              {!isSuperAdmin && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</span>
                  <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </label>
              )}

              {user?.role === 'teacher' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Subject</span>
                    <input className={inputCls} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Shipping / sender address
                    </span>
                    <textarea
                      className={inputCls}
                      rows={2}
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Address printed as FROM on tute shipping labels"
                      disabled={form.shippingLabelPhotoOnly}
                    />
                    <span className="mt-1 block text-xs text-slate-400">
                      {form.shippingLabelPhotoOnly
                        ? 'Not used while photo-only shipping labels are enabled.'
                        : 'Used as the sender address on material order shipping labels.'}
                    </span>
                  </label>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Shipping label photo
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Upload your branded flyer / photo used on tute delivery labels (like a mail-merge insert).
                      </p>
                    </div>

                    {photoPreviewUrl ? (
                      <img
                        src={photoPreviewUrl}
                        alt="Shipping label photo preview"
                        className="max-h-56 w-full rounded-lg border border-slate-200 object-contain bg-white dark:border-white/10"
                      />
                    ) : (
                      <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 dark:border-white/15">
                        No photo uploaded yet
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer">
                        <span className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
                          {photoBusy ? 'Uploading…' : photoPreviewUrl ? 'Replace photo' : 'Upload photo'}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          disabled={photoBusy}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            setPhotoBusy(true);
                            const localPreview = URL.createObjectURL(file);
                            if (photoObjectUrlRef.current) URL.revokeObjectURL(photoObjectUrlRef.current);
                            photoObjectUrlRef.current = localPreview;
                            loadedPhotoKeyRef.current = null;
                            setPhotoPreviewUrl(localPreview);
                            try {
                              const body = new FormData();
                              body.append('photo', file);
                              await t.post('/profile/shipping-label-photo', body);
                              showToast('Shipping label photo uploaded');
                              await queryClient.invalidateQueries({
                                queryKey: ['profile', isSuperAdmin ? 'platform' : slug],
                              });
                            } catch (err) {
                              if (photoObjectUrlRef.current === localPreview) {
                                URL.revokeObjectURL(localPreview);
                                photoObjectUrlRef.current = null;
                              }
                              setPhotoPreviewUrl(null);
                              showToast(apiErrorMessage(err), 'error');
                            } finally {
                              setPhotoBusy(false);
                            }
                          }}
                        />
                      </label>
                      {photoPreviewUrl && (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={photoBusy}
                          onClick={async () => {
                            setPhotoBusy(true);
                            try {
                              await t.del('/profile/shipping-label-photo');
                              if (photoObjectUrlRef.current) {
                                URL.revokeObjectURL(photoObjectUrlRef.current);
                                photoObjectUrlRef.current = null;
                              }
                              loadedPhotoKeyRef.current = null;
                              setPhotoPreviewUrl(null);
                              setForm((f) => ({ ...f, shippingLabelPhotoOnly: false }));
                              showToast('Shipping label photo removed');
                              queryClient.invalidateQueries({
                                queryKey: ['profile', isSuperAdmin ? 'platform' : slug],
                              });
                            } catch (err) {
                              showToast(apiErrorMessage(err), 'error');
                            } finally {
                              setPhotoBusy(false);
                            }
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>

                    <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={form.shippingLabelPhotoOnly}
                        disabled={!photoPreviewUrl && !form.shippingLabelPhotoOnly}
                        onChange={(e) =>
                          setForm({ ...form, shippingLabelPhotoOnly: e.target.checked })
                        }
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                          Prefer photo labels (skip text-only 4-up)
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                          When enabled, printing uses your photo on the left and full delivery details on
                          the right (even without a sender address). Turn off to allow classic text-only
                          labels when no photo is used.
                        </span>
                      </span>
                    </label>
                  </div>
                </>
              )}

              {user?.role === 'student' && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Guardian & location</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">Guardian name</span>
                      <input className={inputCls} value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">Guardian phone</span>
                      <input className={inputCls} value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">Guardian email (for digests)</span>
                    <input type="email" className={inputCls} value={form.guardianEmail} onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })} placeholder="parent@email.com" />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">Area</span>
                      <input className={inputCls} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
                    </label>
                    <Select label="District" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })}>
                      <option value="">Select district</option>
                      {SRI_LANKAN_DISTRICTS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </Select>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">School (optional)</span>
                    <input
                      className={inputCls}
                      value={form.school}
                      onChange={(e) => setForm({ ...form, school: e.target.value })}
                      placeholder="e.g. Royal College, Colombo"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">Delivery address</span>
                    <textarea
                      className={inputCls}
                      rows={2}
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Full address for tute / material delivery"
                    />
                  </label>
                </div>
              )}

              {profileError && <p className="text-sm text-red-600">{profileError}</p>}
              {profileSuccess && <p className="text-sm text-emerald-600">{profileSuccess}</p>}

              <Button type="submit" disabled={saveMutation.isPending || !form.name.trim()}>
                {saveMutation.isPending ? 'Saving...' : 'Save changes'}
              </Button>
            </form>
          </Card>

          <Card className="rounded-2xl">
            <div className="mb-4 flex items-center gap-2">
              <Icon name="note" width={18} height={18} className="text-brand-600" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Change password</h2>
            </div>
            <form onSubmit={submitPassword} className="space-y-4">
              <Input label="Current password" type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} required />
              <Input label="New password" type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} required />
              <PasswordRequirements password={pwd.next} />
              <Input
                label="Confirm new password"
                type="password"
                value={pwd.confirm}
                onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
                required
                error={passwordMismatchError(pwd.next, pwd.confirm)}
              />
              {pwdError && <p className="text-sm text-red-600">{pwdError}</p>}
              {pwdSuccess && <p className="text-sm text-emerald-600">{pwdSuccess}</p>}
              <Button
                type="submit"
                disabled={
                  passwordMutation.isPending ||
                  !pwd.current ||
                  !pwd.next ||
                  !pwd.confirm ||
                  Boolean(validatePassword(pwd.next))
                }
              >
                {passwordMutation.isPending ? 'Updating...' : 'Update password'}
              </Button>
            </form>
          </Card>

          {profile && (
            <p className="text-center text-xs text-slate-400">
              Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
