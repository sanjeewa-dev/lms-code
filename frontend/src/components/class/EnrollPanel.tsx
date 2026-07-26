import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../api/client';
import { currentMonth } from '../../lib/paymentUtils';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Badge, Button, Card, statusTone } from '../ui';
import type { ClassSummary, Enrollment } from '../../api/types';

export function EnrollPanel({ klass, enrollment }: { klass: ClassSummary; enrollment: Enrollment | null }) {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['class', klass.id] });

  const enrollMutation = useMutation({
    mutationFn: async () => (await t.post(`/classes/${klass.id}/enroll`)).data,
    onSuccess: invalidate,
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('Please choose a payment slip file');
      const body = new FormData();
      body.append('slip', file);
      body.append('forMonth', currentMonth());
      return (await t.post(`/enrollments/${enrollment!.id}/payment`, body)).data;
    },
    onSuccess: invalidate,
    onError: (err) => setError(apiErrorMessage(err)),
  });

  if (!enrollment) {
    return (
      <Card>
        <h3 className="mb-2 text-lg font-semibold">Enroll in this class</h3>
        <p className="mb-3 text-sm text-slate-500">
          {klass.price > 0
            ? `This class costs Rs. ${klass.price.toLocaleString()}. After requesting enrollment you can upload your bank transfer slip for verification.`
            : 'This class is free. Enroll to get instant access.'}
        </p>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <Button onClick={() => enrollMutation.mutate()} disabled={enrollMutation.isPending}>
          {enrollMutation.isPending ? 'Requesting...' : 'Request enrollment'}
        </Button>
      </Card>
    );
  }

  const latestPayment = enrollment.payments?.[0];

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Enrollment</h3>
        <Badge tone={statusTone(enrollment.status)}>{enrollment.status}</Badge>
      </div>

      {enrollment.status === 'active' ? (
        <p className="text-sm text-green-700 dark:text-emerald-300">
          You have full access to this class. Scroll down for content.
        </p>
      ) : (
        <div className="space-y-3">
          {latestPayment && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-white/5">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Last payment</span>
                <Badge tone={statusTone(latestPayment.status)}>{latestPayment.status}</Badge>
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                Amount: Rs. {latestPayment.amount.toLocaleString()}
              </p>
              {latestPayment.note && <p className="text-slate-500">Note: {latestPayment.note}</p>}
            </div>
          )}
          <p className="text-sm text-slate-500">
            Upload your bank transfer slip for{' '}
            <strong>Rs. {klass.price.toLocaleString()}</strong>. An admin or teacher will verify it to
            unlock the class.
          </p>
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Payment slip (image or PDF)
            </span>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button onClick={() => payMutation.mutate()} disabled={payMutation.isPending}>
            {payMutation.isPending ? 'Uploading...' : 'Upload payment slip'}
          </Button>
        </div>
      )}
    </Card>
  );
}
