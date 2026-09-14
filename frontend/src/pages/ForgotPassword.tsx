import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { AuthShell } from '../components/AuthShell';
import { Button, Input, Select } from '../components/ui';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [tenantChoices, setTenantChoices] = useState<{ slug: string; name: string }[] | null>(null);
  const [chosenSlug, setChosenSlug] = useState('');

  useDocumentMeta({
    title: 'Forgot Password — Mindspark LMS',
    description: 'Request a password reset link for your Mindspark LMS account.',
  });

  async function submit(tenantSlug?: string) {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post<{
        message: string;
        multiple?: boolean;
        tenants?: { slug: string; name: string }[];
      }>('/auth/forgot-password', { email, tenantSlug });

      if (data.multiple && data.tenants?.length) {
        setTenantChoices(data.tenants);
        setChosenSlug(data.tenants[0]?.slug ?? '');
        return;
      }

      setSent(true);
      setTenantChoices(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(tenantChoices ? chosenSlug : undefined);
  }

  return (
    <AuthShell title="Forgot password" subtitle="We'll email you a reset link">
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-300">
            If an account exists for <strong className="text-white">{email}</strong>, we sent password
            reset instructions. Check your inbox and spam folder.
          </p>
          <p className="text-xs text-slate-400">The link expires in 1 hour.</p>
          <Link
            to="/login"
            className="inline-flex text-sm font-semibold text-brand-300 hover:text-brand-200 hover:underline"
          >
            Return to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4 [&_label>span]:text-slate-200">
          <p className="text-sm text-slate-400">
            Enter the email you use to sign in. We'll send a link to reset your password.
          </p>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setTenantChoices(null);
            }}
            required
            autoComplete="email"
          />

          {tenantChoices && (
            <Select
              label="Choose your institute"
              value={chosenSlug}
              onChange={(e) => setChosenSlug(e.target.value)}
            >
              {tenantChoices.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Sending...' : tenantChoices ? 'Send reset link' : 'Continue'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
