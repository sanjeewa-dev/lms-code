import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { Button, Card, Input, Spinner } from '../components/ui';
import { validatePassword } from '../lib/passwordValidation';
import { PasswordRequirements, passwordMismatchError } from '../components/PasswordRequirements';

interface AdminInviteDetails {
  email: string;
  instituteName: string;
  expiresAt: string;
}

export default function AdminInvite() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const [form, setForm] = useState({ name: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const inviteQuery = useQuery({
    queryKey: ['admin-invite', slug, token],
    enabled: !!slug && !!token,
    queryFn: async () =>
      (await api.get<{ invite: AdminInviteDetails }>(`/t/${slug}/admin-invites/${token}`)).data
        .invite,
    retry: false,
  });

  const invite = inviteQuery.data;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (form.name.trim().length < 2) {
      setError('Please enter your name');
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
      await api.post(`/t/${slug}/admin-invites/${token}/accept`, {
        name: form.name.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-ink-900">
        <Spinner />
      </div>
    );
  }

  if (inviteQuery.isError || !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-ink-900">
        <Card className="max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Invitation unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">
            This link may have expired or already been used. Contact the platform team for a new
            invite.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
            Go to sign in
          </Link>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-ink-900">
        <Card className="max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">You&apos;re all set</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your admin account for {invite.instituteName} is ready. Sign in with {invite.email}.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Sign in
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-ink-900">
      <Card className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Set up admin account</h1>
          <p className="mt-1 text-sm text-slate-500">{invite.instituteName}</p>
          <p className="mt-1 text-sm text-slate-400">Invite for {invite.email}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input label="Email" type="email" value={invite.email} readOnly className="bg-slate-50 dark:bg-white/5" />
          <Input
            label="Your name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoComplete="name"
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="Create a strong password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
            required
          />
          <PasswordRequirements password={form.password} />
          <Input
            label="Confirm password"
            type="password"
            placeholder="Re-enter your password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            autoComplete="new-password"
            required
            error={passwordMismatchError(form.password, form.confirmPassword)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={
              loading ||
              form.name.trim().length < 2 ||
              !form.password ||
              !form.confirmPassword ||
              Boolean(validatePassword(form.password))
            }
          >
            {loading ? 'Saving…' : 'Complete setup'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
