import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Input } from '../components/ui';
import { BrandMark, useInstituteBrand } from '../components/BrandMark';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { validatePassword } from '../lib/passwordValidation';

type JoinInfo = { class: { id: string; title: string; price: number; teacherName: string | null }; instituteName: string };
type JoinResult = { alreadyEnrolled?: boolean; class?: { id: string; title: string }; enrollment?: { status: string }; pending?: boolean; message?: string };

export default function ClassJoin() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const { user, loginTenant } = useAuth();
  const brand = useInstituteBrand(slug);
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [login, setLogin] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ title: string; message: string; needsPayment: boolean; needsSignIn: boolean } | null>(null);
  const query = useQuery({ queryKey: ['class-join', slug, token], enabled: Boolean(slug && token), retry: false, queryFn: async () => (await api.get<JoinInfo>(`/t/${slug}/join/${token}`)).data });
  const info = query.data;

  useEffect(() => { if (user?.role === 'student' && user.tenantSlug === slug) setMode('login'); }, [user, slug]);
  function complete(result: JoinResult, needsSignIn: boolean) {
    const needsPayment = result.pending || result.enrollment?.status === 'pending';
    const title = result.class?.title ?? info?.class.title ?? 'this class';
    setDone({
      title: result.alreadyEnrolled ? 'Already enrolled' : needsPayment ? 'Payment required' : 'Enrollment complete',
      needsPayment: Boolean(needsPayment),
      needsSignIn,
      message: result.message ?? (needsPayment
        ? `Your enrollment in ${title} is pending payment. Sign in and submit payment to unlock class content.`
        : result.alreadyEnrolled
          ? `You are already in ${title}.`
          : `You joined ${title}.`),
    });
  }
  async function enroll() {
    setError(''); setLoading(true);
    try { complete((await api.post<JoinResult>(`/t/${slug}/join/${token}/enroll`)).data, false); } catch (err) { setError(apiErrorMessage(err)); } finally { setLoading(false); }
  }
  async function register(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const passwordError = validatePassword(form.password);
    if (passwordError) return setError(passwordError);
    setLoading(true);
    try { complete((await api.post<JoinResult>(`/t/${slug}/join/${token}/register`, form)).data, true); } catch (err) { setError(apiErrorMessage(err)); } finally { setLoading(false); }
  }
  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try { if (!(user?.role === 'student' && user.tenantSlug === slug)) await loginTenant(slug!, login.email.trim(), login.password); await enroll(); } catch (err) { setError(apiErrorMessage(err)); } finally { setLoading(false); }
  }
  if (query.isLoading) return <div className="flex min-h-screen items-center justify-center bg-hero-gradient"><p>Loading invite…</p></div>;
  if (query.isError || !info) return <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4"><Card className="text-center"><h1 className="text-xl font-bold">Invite unavailable</h1><p className="mt-2 text-sm text-slate-500">{apiErrorMessage(query.error)}</p></Card></div>;
  if (done) {
    const destination = done.needsPayment ? `/${slug}/payments` : `/${slug}/classes/${info.class.id}`;
    const cta = done.needsSignIn
      ? { to: `/login?next=${encodeURIComponent(destination)}`, label: done.needsPayment ? 'Sign in to pay' : 'Sign in to open class' }
      : { to: destination, label: done.needsPayment ? 'Go to payments' : 'Open class' };
    return (
      <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4">
        <Card className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold">{done.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{done.message}</p>
          <div className="mt-6">
            <Link to={cta.to}><Button>{cta.label}</Button></Link>
          </div>
        </Card>
      </div>
    );
  }
  return <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4 py-10"><Card className="w-full max-w-md"><div className="mb-6 text-center"><BrandMark name={brand.data?.tenant?.name ?? info.instituteName} logoUrl={brand.data?.tenant?.logoUrl} /><h1 className="mt-4 text-2xl font-bold">Join class</h1><p className="mt-1 text-sm text-slate-500">You were invited to <strong>{info.class.title}</strong>{info.class.teacherName ? ` with ${info.class.teacherName}` : ''}.</p>{info.class.price > 0 && <p className="mt-2 text-xs text-slate-500">Class fee: Rs. {info.class.price.toLocaleString()}. Payment is required before access.</p>}</div>{user?.role === 'student' && user.tenantSlug === slug ? <><p className="mb-3 text-sm">Signed in as {user.name}.</p>{error && <p className="text-sm text-red-600">{error}</p>}<Button className="w-full" disabled={loading} onClick={enroll}>{loading ? 'Joining…' : `Join ${info.class.title}`}</Button></> : <><div className="mb-4 flex rounded-lg border p-1"><button className={`flex-1 rounded px-3 py-2 ${mode === 'register' ? 'bg-brand-600 text-white' : ''}`} onClick={() => setMode('register')}>New student</button><button className={`flex-1 rounded px-3 py-2 ${mode === 'login' ? 'bg-brand-600 text-white' : ''}`} onClick={() => setMode('login')}>Existing account</button></div>{mode === 'register' ? <form className="space-y-3" onSubmit={register}><Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /><Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /><Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /><PasswordRequirements password={form.password} />{error && <p className="text-sm text-red-600">{error}</p>}<Button type="submit" className="w-full" disabled={loading}>{loading ? 'Submitting…' : 'Register & join class'}</Button></form> : <form className="space-y-3" onSubmit={signIn}><Input label="Email" type="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} required /><Input label="Password" type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} required />{error && <p className="text-sm text-red-600">{error}</p>}<Button type="submit" className="w-full" disabled={loading}>{loading ? 'Joining…' : 'Sign in & join class'}</Button></form>}</>}</Card></div>;
}
