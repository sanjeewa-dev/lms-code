import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Button, Card, Input, Select } from '../components/ui';
import { SRI_LANKAN_DISTRICTS } from '../lib/districts';
import { validatePassword } from '../lib/passwordValidation';
import { PasswordRequirements } from '../components/PasswordRequirements';

interface InviteDetails {
  email: string;
  name: string;
  phone: string;
  phones: string[];
  guardianName: string;
  guardianPhone: string;
  area: string;
  district: string;
  address: string;
  freeIdCard: boolean;
  classTitle: string | null;
  instituteName: string;
}

export default function StudentInvite() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const [form, setForm] = useState({
    phones: [''],
    guardianName: '',
    guardianPhone: '',
    area: '',
    district: '',
    address: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const inviteQuery = useQuery({
    queryKey: ['invite', slug, token],
    enabled: !!slug && !!token,
    queryFn: async () =>
      (await api.get<{ invite: InviteDetails }>(`/t/${slug}/invites/${token}`)).data.invite,
    retry: false,
  });

  const invite = inviteQuery.data;

  useEffect(() => {
    if (!invite) return;
    const phones =
      invite.phones?.length > 0 ? invite.phones : invite.phone ? [invite.phone] : [''];
    setForm((f) => ({
      ...f,
      phones: f.phones[0] ? f.phones : phones,
      guardianName: f.guardianName || invite.guardianName,
      guardianPhone: f.guardianPhone || invite.guardianPhone,
      area: f.area || invite.area,
      district: f.district || invite.district,
      address: f.address || invite.address,
    }));
  }, [invite]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const phones = form.phones.map((p) => p.trim()).filter(Boolean);
    if (phones.length === 0) {
      setError('Please enter at least one telephone number');
      return;
    }
    if (!form.address.trim()) {
      setError('Please enter your address');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const pwdErr = validatePassword(form.password);
    if (pwdErr) {
      setError(pwdErr);
      return;
    }
    setLoading(true);
    try {
      await api.post(`/t/${slug}/invites/${token}/accept`, {
        ...form,
        phones,
        phone: phones[0],
        address: form.address.trim(),
      });
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (inviteQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4">
        <p className="text-white">Loading invitation...</p>
      </div>
    );
  }

  if (inviteQuery.isError || !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4">
        <Card className="w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Invalid invitation</h1>
          <p className="mt-2 text-sm text-slate-500">
            This link may have expired or already been used. Contact your institute for a new invite.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            Go to sign in
          </Link>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4">
        <Card className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-2xl text-emerald-600">
            ✓
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Registration complete</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your account is ready. You can now sign in and access
            {invite.classTitle ? ` ${invite.classTitle}` : ' your classes'}.
          </p>
          {invite.freeIdCard && (
            <p className="mt-2 text-sm font-medium text-emerald-600">
              You have been offered a free student ID card.
            </p>
          )}
          <Link
            to="/login"
            className="mt-5 inline-block rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Sign in
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4 py-10">
      <Card className="w-full max-w-lg">
        <div className="mb-5 text-center">
          <div className="brand-chip mx-auto mb-3 h-12 w-12 text-xl font-extrabold">
            {slug?.[0]?.toUpperCase() ?? 'L'}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Complete your registration</h1>
          <p className="text-sm text-slate-500">{invite.instituteName}</p>
          {invite.classTitle && (
            <p className="mt-1 text-sm font-medium text-brand-600">Class: {invite.classTitle}</p>
          )}
          {invite.freeIdCard && (
            <p className="mt-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              Free student ID card offered
            </p>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input label="Student name" value={invite.name} readOnly className="bg-slate-50 dark:bg-white/5" />
          <Input label="Email" type="email" value={invite.email} readOnly className="bg-slate-50 dark:bg-white/5" />

          <div className="space-y-2">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Telephone *</span>
            {form.phones.map((phone, index) => (
              <div key={index} className="flex gap-2">
                <input
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:ring-brand-900/40"
                  placeholder={`e.g. 0771234567${index === 0 ? ' (primary)' : ''}`}
                  value={phone}
                  onChange={(e) =>
                    setForm((f) => {
                      const phones = [...f.phones];
                      phones[index] = e.target.value;
                      return { ...f, phones };
                    })
                  }
                  required={index === 0}
                />
                {form.phones.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        phones: f.phones.filter((_, i) => i !== index),
                      }))
                    }
                    className="rounded-lg px-3 text-sm text-red-500 hover:bg-red-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {form.phones.length < 5 && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, phones: [...f.phones, ''] }))}
                className="text-sm font-semibold text-brand-600 hover:underline"
              >
                + Add another phone no
              </button>
            )}
          </div>

          <Input
            label="Address *"
            placeholder="Street, town, postal details"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            required
          />

          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Contact person / Guardian</p>
            <div className="space-y-3">
              <Input
                label="Guardian name"
                placeholder="e.g. Mother / Father / Guardian"
                value={form.guardianName}
                onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                required
              />
              <Input
                label="Guardian telephone"
                placeholder="e.g. 0771234567"
                value={form.guardianPhone}
                onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
                required
              />
            </div>
          </div>

          <Input
            label="Area / town"
            placeholder="e.g. Maharagama"
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })}
            required
          />

          <Select
            label="District"
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
            required
          >
            <option value="">Select district</option>
            {SRI_LANKAN_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>

          <Input
            label="Password"
            type="password"
            placeholder="Create a strong password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <PasswordRequirements password={form.password} />
          <Input
            label="Confirm password"
            type="password"
            placeholder="Re-enter your password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            required
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Complete registration'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
