import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Input } from '../components/ui';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { apiErrorMessage } from '../api/client';
import { validatePassword } from '../lib/passwordValidation';

export default function TenantRegister() {
  const { slug } = useParams<{ slug: string }>();
  const { registerTenant } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const pwdErr = validatePassword(form.password);
    if (pwdErr) {
      setError(pwdErr);
      return;
    }
    setLoading(true);
    try {
      await registerTenant(slug!, form);
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4">
        <Card className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-2xl text-emerald-600">
            ✓
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Registration submitted</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your account is awaiting approval from the institute. You'll be able to sign in once an admin approves it.
          </p>
          <Link
            to="/login"
            className="mt-5 inline-block rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Back to sign in
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4">
      <Card className="w-full max-w-md">
        <div className="mb-5 text-center">
          <div className="brand-chip mx-auto mb-3 h-12 w-12 text-xl font-extrabold">
            {slug?.[0]?.toUpperCase() ?? 'L'}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Register as a student</h1>
          <p className="text-sm capitalize text-slate-500">Institute: {slug}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="Create a strong password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <PasswordRequirements password={form.password} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating...' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
