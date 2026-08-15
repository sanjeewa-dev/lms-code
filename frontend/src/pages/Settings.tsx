import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { Button, Card, Input, Select, Spinner, Textarea } from '../components/ui';
import { BrandMark } from '../components/BrandMark';
import { PageHeader } from '../components/tenant/TenantUi';
import type { Batch, ClassSummary, SelfEnrollmentRule, SelfEnrollmentSettings } from '../api/types';

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
  selfEnrollment?: SelfEnrollmentSettings;
}

const defaultSelfEnrollment = (): SelfEnrollmentSettings => ({
  enabled: false,
  scope: 'selected_classes',
  rules: [],
});

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
    if (query.data) setForm({ ...query.data, selfEnrollment: query.data.selfEnrollment ?? defaultSelfEnrollment() });
  }, [query.data]);

  const classesQuery = useQuery({
    queryKey: ['classes', t.slug],
    queryFn: async () => (await t.get<{ classes: ClassSummary[] }>('/classes')).data.classes,
  });
  const batchesQuery = useQuery({
    queryKey: ['batches', t.slug],
    queryFn: async () => (await t.get<{ batches: Batch[] }>('/batches')).data.batches,
  });
  const publishedClasses = (classesQuery.data ?? []).filter((klass) => klass.isPublished);
  const selfEnrollment = form.selfEnrollment ?? defaultSelfEnrollment();
  function updateSelfEnrollment(patch: Partial<SelfEnrollmentSettings>) {
    setForm((current) => ({
      ...current,
      selfEnrollment: { ...(current.selfEnrollment ?? defaultSelfEnrollment()), ...patch },
    }));
  }
  function addRule() {
    const target = publishedClasses[0];
    if (!target) return;
    updateSelfEnrollment({
      rules: [...selfEnrollment.rules, { targetClassId: target.id, audience: 'all_students', sourceClassIds: [], sourceBatchIds: [] }],
    });
  }
  function updateRule(index: number, patch: Partial<SelfEnrollmentRule>) {
    const rules = [...selfEnrollment.rules];
    rules[index] = { ...rules[index], ...patch };
    updateSelfEnrollment({ rules });
  }

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

      <SectionCard title="Student self-enrollment" subtitle="Control which students can discover and join classes">
        <div className="space-y-4">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <input type="checkbox" checked={selfEnrollment.enabled} onChange={(e) => updateSelfEnrollment({ enabled: e.target.checked })} />
            Allow students to self-enroll in classes
          </label>
          {selfEnrollment.enabled && (
            <>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="self-enrollment-scope" checked={selfEnrollment.scope === 'all_classes'} onChange={() => updateSelfEnrollment({ scope: 'all_classes', rules: [] })} /> All published classes — every student</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="self-enrollment-scope" checked={selfEnrollment.scope === 'selected_classes'} onChange={() => updateSelfEnrollment({ scope: 'selected_classes' })} /> Selected classes and audiences</label>
              {selfEnrollment.scope === 'selected_classes' && (
                <div className="space-y-3">
                  {selfEnrollment.rules.map((rule, index) => (
                    <div key={`${rule.targetClassId}-${index}`} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
                      <div className="flex items-center justify-between"><p className="text-sm font-semibold">Rule {index + 1}</p><button type="button" className="text-xs text-red-600" onClick={() => updateSelfEnrollment({ rules: selfEnrollment.rules.filter((_, i) => i !== index) })}>Remove</button></div>
                      <Select label="Target class" value={rule.targetClassId} onChange={(e) => updateRule(index, { targetClassId: e.target.value })}>{publishedClasses.map((klass) => <option key={klass.id} value={klass.id}>{klass.title}</option>)}</Select>
                      <Select label="Eligible students" value={rule.audience} onChange={(e) => updateRule(index, { audience: e.target.value as SelfEnrollmentRule['audience'], sourceClassIds: [], sourceBatchIds: [] })}>
                        <option value="all_students">All students</option><option value="batches">Selected batches</option><option value="enrolled_in_classes">Students in selected classes</option>
                      </Select>
                      {rule.audience === 'batches' && <MultiSelect label="Eligible batches" options={(batchesQuery.data ?? []).map((batch) => ({ id: batch.id, label: batch.name }))} selected={rule.sourceBatchIds} onChange={(ids) => updateRule(index, { sourceBatchIds: ids })} />}
                      {rule.audience === 'enrolled_in_classes' && <MultiSelect label="Must already be enrolled in" options={publishedClasses.map((klass) => ({ id: klass.id, label: klass.title }))} selected={rule.sourceClassIds} onChange={(ids) => updateRule(index, { sourceClassIds: ids })} />}
                    </div>
                  ))}
                  <Button type="button" variant="secondary" disabled={!publishedClasses.length} onClick={addRule}>Add class rule</Button>
                </div>
              )}
            </>
          )}
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

function MultiSelect({ label, options, selected, onChange }: { label: string; options: { id: string; label: string }[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <div><p className="mb-1 text-sm font-medium">{label}</p><div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-white/10">{options.map((option) => <label key={option.id} className="flex gap-2 text-sm"><input type="checkbox" checked={selected.includes(option.id)} onChange={(e) => onChange(e.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))} />{option.label}</label>)}</div></div>;
}
