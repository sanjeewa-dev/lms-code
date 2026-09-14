import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { AuthShell } from '../components/AuthShell';
import { Button, Input, Spinner } from '../components/ui';
import { PasswordRequirements, passwordMismatchError } from '../components/PasswordRequirements';
import { validatePassword } from '../lib/passwordValidation';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const tokenQuery = useQuery({
    queryKey: ['reset-password-token', token],
    enabled: Boolean(token),
    queryFn: async () =>
      (await api.get<{ email: string; instituteName: string; expiresAt: string }>(
        `/auth/reset-password/${encodeURIComponent(token)}`
      )).data,
    retry: false,
  });

  useDocumentMeta({
    title: 'Reset Password — Mindspark LMS',
    description: 'Choose a new password for your Mindspark LMS account.',
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const pwdErr = validatePassword(password);
    if (pwdErr) {
      setError(pwdErr);
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password, confirmPassword });
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Invalid link">
        <p className="text-sm text-slate-300">This password reset link is missing or malformed.</p>
        <Link
          to="/forgot-password"
          className="mt-4 inline-flex text-sm font-semibold text-brand-300 hover:text-brand-200 hover:underline"
        >
          Request a new reset link
        </Link>
      </AuthShell>
    );
  }

  if (tokenQuery.isLoading) {
    return (
      <AuthShell title="Reset password">
        <Spinner label="Checking reset link..." />
      </AuthShell>
    );
  }

  if (tokenQuery.isError) {
    return (
      <AuthShell title="Link expired">
        <p className="text-sm text-slate-300">
          This reset link is invalid or has expired. Request a new one to continue.
        </p>
        <Link
          to="/forgot-password"
          className="mt-4 inline-flex text-sm font-semibold text-brand-300 hover:text-brand-200 hover:underline"
        >
          Request a new reset link
        </Link>
      </AuthShell>
    );
  }

  const info = tokenQuery.data!;

  if (done) {
    return (
      <AuthShell title="Password updated">
        <p className="text-sm text-slate-300">
          Your password for <strong className="text-white">{info.instituteName}</strong> has been updated.
          Sign in with your new password.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-flex text-sm font-semibold text-brand-300 hover:text-brand-200 hover:underline"
        >
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle={info.instituteName}>
      <form onSubmit={onSubmit} className="space-y-4 [&_label>span]:text-slate-200">
        <p className="text-sm text-slate-400">
          Resetting password for <strong className="text-slate-200">{info.email}</strong>
        </p>
        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
        <PasswordRequirements password={password} />
        <Input
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
          error={passwordMismatchError(password, confirmPassword)}
        />

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={loading || Boolean(validatePassword(password)) || password !== confirmPassword}
          className="w-full"
        >
          {loading ? 'Saving...' : 'Update password'}
        </Button>
      </form>
    </AuthShell>
  );
}
