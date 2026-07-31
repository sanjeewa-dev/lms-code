import { useEffect, useState } from 'react';
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
  const { registerTenant } = useAuth();
  const brandQuery = useInstituteBrand(slug);
  const instituteName = brandQuery.data?.tenant?.name ?? slug;
  const logoUrl = brandQuery.data?.tenant?.logoUrl;
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    classId: params.get('classId') ?? '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const classesQuery = useQuery({
    queryKey: ['public-classes', slug],
    enabled: Boolean(slug),
    queryFn: async () =>
      (await api.get<{ classes: PublicClass[] }>(`/t/${slug}/public/classes`)).data.classes,
  });

  useEffect(() => {
    const list = classesQuery.data;
    if (!list?.length) return;
    if (form.classId && list.some((c) => c.id === form.classId)) return;
    setForm((f) => ({ ...f, classId: list[0].id }));
  }, [classesQuery.data, form.classId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.classId) {
      setError('Select a class to join. Students must enroll in a class.');
      return;
    }
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4">
      <Card className="w-full max-w-md">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <BrandMark name={instituteName} logoUrl={logoUrl} size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Register as a student</h1>
          <p className="text-sm text-slate-500">{instituteName}</p>
          <p className="mt-1 text-xs text-slate-400">You must choose a class to join.</p>
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
                <option value="">No published classes available</option>
              ) : (
                classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                    {c.price > 0 ? ` (LKR ${c.price})` : ' (Free)'}
                    {c.teacher?.name ? ` · ${c.teacher.name}` : ''}
                  </option>
                ))
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
          <Button type="submit" disabled={loading || !form.classId || classes.length === 0 || Boolean(validatePassword(form.password))} className="w-full">
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
