import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Input } from '../components/ui';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { BrandMark, useInstituteBrand } from '../components/BrandMark';
import { api, apiErrorMessage } from '../api/client';
import { validatePassword } from '../lib/passwordValidation';

type PublicClass = {
  id: string;
  title: string;
  description: string;
  price: number;
  teacher?: { name: string } | null;
};

export default function TenantRegister() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const classIdFromUrl = params.get('classId')?.trim() ?? '';
  const { registerTenant } = useAuth();
  const brandQuery = useInstituteBrand(slug);
  const instituteName = brandQuery.data?.tenant?.name ?? slug;
  const logoUrl = brandQuery.data?.tenant?.logoUrl;
  const selfEnrollmentEnabled = Boolean(brandQuery.data?.tenant?.selfEnrollmentEnabled);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    classId: classIdFromUrl,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const classesQuery = useQuery({
    queryKey: ['public-classes', slug, classIdFromUrl],
    enabled: Boolean(slug) && (Boolean(classIdFromUrl) || selfEnrollmentEnabled),
    queryFn: async () => (await api.get<{ classes: PublicClass[] }>(`/t/${slug}/public/classes${classIdFromUrl ? `?classId=${encodeURIComponent(classIdFromUrl)}` : ''}`)).data.classes,
  });

  const targetClass = classesQuery.data?.find((klass) => klass.id === form.classId) ?? null;
  const canRegister = Boolean(form.classId && targetClass);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!canRegister || !targetClass) {
      setError('Select a class to join or ask your teacher for an invite link.');
      return;
    }
    const pwdErr = validatePassword(form.password);
    if (pwdErr) {
      setError(pwdErr);
      return;
    }
    setLoading(true);
    try {
      await registerTenant(slug!, { ...form, classId: targetClass.id });
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
            Your account is awaiting approval from the institute. You&apos;ll be able to sign in once an
            admin approves it.
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

  const classes = classesQuery.data ?? [];

  if (!selfEnrollmentEnabled && !classIdFromUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4">
        <Card className="w-full max-w-md text-center">
          <div className="mx-auto mb-3 flex justify-center"><BrandMark name={instituteName} logoUrl={logoUrl} size="lg" /></div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Invite required</h1>
          <p className="mt-2 text-sm text-slate-500">Self-registration is not open. Ask your teacher for a personal invite or class join link.</p>
          <div className="mt-5 flex flex-col gap-2"><Link to="/login" className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white">Sign in</Link><Link to={`/${slug}`} className="text-sm font-medium text-brand-600">Back to {instituteName}</Link></div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4">
      <Card className="w-full max-w-md">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <BrandMark name={instituteName} logoUrl={logoUrl} size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Register as a student</h1>
          <p className="text-sm text-slate-500">{instituteName}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Class
            </span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              value={form.classId}
              onChange={(e) => setForm({ ...form, classId: e.target.value })}
              required
              disabled={classesQuery.isLoading || classes.length === 0}
            >
              {classes.length === 0 ? (
                <option value="">No classes open for registration</option>
              ) : (
                <>
                  {!classIdFromUrl && <option value="">Select a class to join</option>}
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                      {c.price > 0 ? ` (LKR ${c.price})` : ' (Free)'}
                      {c.teacher?.name ? ` · ${c.teacher.name}` : ''}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
          <Input
            label="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
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
          <Button type="submit" disabled={loading || !canRegister || classes.length === 0 || Boolean(validatePassword(form.password))} className="w-full">
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
