import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Input, Select } from '../components/ui';
import { apiErrorMessage } from '../api/client';

export default function PlatformHome() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tenantChoices, setTenantChoices] = useState<{ slug: string; name: string }[] | null>(null);
  const [chosenSlug, setChosenSlug] = useState('');

  async function doLogin(tenantSlug?: string) {
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password, tenantSlug);
      if (result.kind === 'multiple') {
        setTenantChoices(result.tenants);
        setChosenSlug(result.tenants[0]?.slug ?? '');
        return;
      }
      if (result.user.role === 'superadmin') {
        navigate('/admin');
      } else if (result.tenant) {
        navigate(`/${result.tenant.slug}/dashboard`);
      } else {
        navigate('/login');
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    doLogin(tenantChoices ? chosenSlug : undefined);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-hero-gradient px-4">
      <div className="text-center">
        <div className="brand-chip mx-auto mb-3 h-14 w-14 text-2xl font-extrabold">M</div>
        <h1 className="text-3xl font-bold text-white">Mindspark LMS</h1>
        <p className="mt-1 text-slate-300">Sign in to continue</p>
      </div>

      <Card className="w-full max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setTenantChoices(null);
            }}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setTenantChoices(null);
            }}
            required
          />

          {tenantChoices && (
            <Select label="Choose your institute" value={chosenSlug} onChange={(e) => setChosenSlug(e.target.value)}>
              {tenantChoices.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
          <p className="font-medium text-slate-600 dark:text-slate-300">Demo accounts (password: 1234)</p>
          <p>superadmin@lms.test</p>
          <p>admin@topmaths.lms &middot; teacher@topmaths.lms &middot; student@topmaths.lms</p>
          <p>admin@ictpasidu.lms &middot; teacher@ictpasidu.lms &middot; student@ictpasidu.lms</p>
          <p className="mt-1">New student? Open your institute at /your-code to register.</p>
        </div>
      </Card>
    </div>
  );
}
