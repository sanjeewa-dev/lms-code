import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { Button, Card, Input, Spinner, Textarea } from '../components/ui';

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
  payhereEnabled: boolean;
}

export default function Settings() {
  const t = useTenantApi();
  const queryClient = useQueryClient();
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
    mutationFn: async () => (await t.patch<{ settings: InstituteSettings }>('/settings', form)).data.settings,
    onSuccess: (settings) => {
      setForm(settings);
      setError('');
      setSuccess('Settings saved.');
      queryClient.invalidateQueries({ queryKey: ['settings', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  if (query.isLoading) return <Spinner label="Loading settings..." />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Institute settings</h1>
        <p className="text-slate-500 dark:text-slate-400">Branding, bank details, and fee rules</p>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">General</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Institute name"
            value={form.name ?? ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Logo URL"
            value={form.logoUrl ?? ''}
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
            placeholder="https://..."
          />
          <Input
            label="Contact email"
            type="email"
            value={form.contactEmail ?? ''}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
          <Input
            label="Contact phone"
            value={form.contactPhone ?? ''}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Bank transfer details</h2>
        <p className="mb-4 text-sm text-slate-500">Shown to students when they upload payment slips</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Bank name"
            value={form.bankName ?? ''}
            onChange={(e) => setForm({ ...form, bankName: e.target.value })}
          />
          <Input
            label="Account name"
            value={form.bankAccountName ?? ''}
            onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })}
          />
          <Input
            label="Account number"
            value={form.bankAccountNumber ?? ''}
            onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
          />
          <Input
            label="Branch"
            value={form.bankBranch ?? ''}
            onChange={(e) => setForm({ ...form, bankBranch: e.target.value })}
          />
        </div>
        <Textarea
          label="Payment instructions"
          className="mt-3"
          rows={3}
          value={form.paymentInstructions ?? ''}
          onChange={(e) => setForm({ ...form, paymentInstructions: e.target.value })}
          placeholder="e.g. Use student name as transfer reference"
        />
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Fee rules</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
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
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">PayHere (optional)</h2>
        <p className="mb-4 text-sm text-slate-500">Enable sandbox online checkout alongside bank slips</p>
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
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
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}
      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Saving...' : 'Save settings'}
      </Button>
    </div>
  );
}
