import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { Button, Card, Input, Spinner, Textarea } from '../components/ui';
import { BrandMark } from '../components/BrandMark';
import { PageHeader } from '../components/tenant/TenantUi';

interface InstituteSettings {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankBranch: string | null;
  paymentInstructions: string | null;
  graceDays: number;
  requireMonthlyPayment: boolean;
  payhereMerchantId: string | null;
  payhereMerchantSecret?: string | null;
  hasPayhereSecret?: boolean;
  payhereEnabled: boolean;
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl p-0">
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-white/5 dark:bg-white/5">
        <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

export default function Settings() {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Partial<InstituteSettings>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const query = useQuery({
    queryKey: ['settings', t.slug],
    queryFn: async () => (await t.get<{ settings: InstituteSettings }>('/settings')).data.settings,
  });

  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { hasPayhereSecret: _h, ...payload } = form;
      if (!payload.payhereMerchantSecret || payload.payhereMerchantSecret === '••••••••') {
        delete payload.payhereMerchantSecret;
      }
      return (await t.patch<{ settings: InstituteSettings }>('/settings', payload)).data.settings;
    },
    onSuccess: (settings) => {
      setForm(settings);
      setError('');
      setSuccess('Settings saved.');
      queryClient.invalidateQueries({ queryKey: ['settings', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['public', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const logoUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append('logo', file);
      return (await t.post<{ settings: InstituteSettings }>('/settings/logo', body)).data.settings;
    },
    onSuccess: (settings) => {
      setForm(settings);
      setError('');
      setSuccess('Logo uploaded.');
      if (logoInputRef.current) logoInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['settings', t.slug] });
      queryClient.invalidateQueries({ queryKey: ['public', t.slug] });
    },
    onError: (err) => {
      setSuccess('');
      setError(apiErrorMessage(err));
    },
  });

  if (query.isLoading) return <Spinner label="Loading settings..." />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        icon="building"
        tone="purple"
        title="Institute settings"
        subtitle="Branding, bank details, and fee rules"
      />

      <SectionCard title="General" subtitle="Institute name, logo, and contact details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Institute name" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="sm:col-span-2 space-y-3">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Upload logo from device
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={logoUploadMutation.isPending}
                  className="block w-full max-w-md text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100 dark:text-slate-300 dark:file:bg-brand-900/40 dark:file:text-brand-200"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) logoUploadMutation.mutate(file);
                  }}
                />
                {logoUploadMutation.isPending && (
                  <span className="text-sm text-slate-500">Uploading...</span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">JPEG, PNG, WebP, or GIF. Uploads as soon as you choose a file.</p>
            </div>
            <div>
              <Input
                label="Or paste logo URL"
                value={form.logoUrl ?? ''}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
              <p className="mt-1 text-xs text-slate-500">
                Use a direct image link (.png, .jpg, .webp) — not a webpage URL. Saved with “Save settings”.
              </p>
            </div>
          </div>
          {(form.logoUrl || form.name) && (
            <div className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <BrandMark name={form.name} logoUrl={form.logoUrl} size="lg" />
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Logo preview</p>
                <p className="text-xs text-slate-500">Shown in the sidebar, classes, and public pages</p>
              </div>
            </div>
          )}
          <Input label="Contact email" type="email" value={form.contactEmail ?? ''} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          <Input label="Contact phone" value={form.contactPhone ?? ''} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
        </div>
      </SectionCard>

      <SectionCard title="Bank transfer details" subtitle="Shown to students when they upload payment slips">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Bank name" value={form.bankName ?? ''} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          <Input label="Account name" value={form.bankAccountName ?? ''} onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })} />
          <Input label="Account number" value={form.bankAccountNumber ?? ''} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} />
          <Input label="Branch" value={form.bankBranch ?? ''} onChange={(e) => setForm({ ...form, bankBranch: e.target.value })} />
        </div>
        <Textarea
          label="Payment instructions"
          className="mt-3"
          rows={3}
          value={form.paymentInstructions ?? ''}
          onChange={(e) => setForm({ ...form, paymentInstructions: e.target.value })}
          placeholder="e.g. Use student name as transfer reference"
        />
      </SectionCard>

      <SectionCard title="Fee rules" subtitle="Control monthly payment requirements">
        <div className="space-y-3">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(form.requireMonthlyPayment)}
              onChange={(e) => setForm({ ...form, requireMonthlyPayment: e.target.checked })}
            />
            Require monthly payment to access class content
          </label>
          <Input
            label="Grace days (start of each month)"
            type="number"
            min={0}
            max={28}
            value={String(form.graceDays ?? 7)}
            onChange={(e) => setForm({ ...form, graceDays: Number(e.target.value) })}
          />
          <p className="text-xs text-slate-400">
            Students can access content without this month&apos;s payment until day {form.graceDays ?? 7} of the month.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="PayHere (optional)" subtitle="Enable sandbox online checkout alongside bank slips">
        <label className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          <input
            type="checkbox"
            checked={Boolean(form.payhereEnabled)}
            onChange={(e) => setForm({ ...form, payhereEnabled: e.target.checked })}
          />
          Enable PayHere checkout
        </label>
        <Input
          label="Merchant ID"
          value={form.payhereMerchantId ?? ''}
          onChange={(e) => setForm({ ...form, payhereMerchantId: e.target.value })}
          placeholder="Sandbox merchant ID"
        />
        <Input
          label={form.hasPayhereSecret ? 'Merchant secret (saved — enter to replace)' : 'Merchant secret'}
          type="password"
          className="mt-3"
          value={form.payhereMerchantSecret === '••••••••' ? '' : form.payhereMerchantSecret ?? ''}
          onChange={(e) => setForm({ ...form, payhereMerchantSecret: e.target.value })}
          placeholder="PayHere merchant secret for IPN verification"
        />
      </SectionCard>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}
      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Saving...' : 'Save settings'}
      </Button>
    </div>
  );
}
