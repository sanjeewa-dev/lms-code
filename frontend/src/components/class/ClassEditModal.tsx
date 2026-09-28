import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../../hooks/useTenantApi';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage } from '../../api/client';
import { Button, Input, Modal, Select, Textarea } from '../ui';
import { isInstituteAdmin } from '../../lib/roles';
import type { Batch, ClassSummary, Teacher } from '../../api/types';

type ClassFormState = {
  title: string;
  description: string;
  subject: string;
  price: string;
  batchId: string;
  teacherId: string;
  isPublished: boolean;
};

function formFromClass(klass: ClassSummary): ClassFormState {
  return {
    title: klass.title,
    description: klass.description ?? '',
    subject: klass.subject ?? '',
    price: String(klass.price ?? 0),
    batchId: klass.batch?.id ?? '',
    teacherId: klass.teacher?.id ?? '',
    isPublished: klass.isPublished !== false,
  };
}

export function ClassEditModal({
  open,
  klass,
  onClose,
  onSaved,
}: {
  open: boolean;
  klass: ClassSummary | null;
  onClose: () => void;
  onSaved?: (klass: ClassSummary) => void;
}) {
  const t = useTenantApi();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canAssignTeacher = isInstituteAdmin(user?.role);
  const [form, setForm] = useState<ClassFormState>({
    title: '',
    description: '',
    subject: '',
    price: '0',
    batchId: '',
    teacherId: '',
    isPublished: true,
  });
  const [error, setError] = useState('');

  const batchesQuery = useQuery({
    queryKey: ['batches', t.slug],
    enabled: open,
    queryFn: async () => (await t.get<{ batches: Batch[] }>('/batches')).data.batches,
  });

  const teachersQuery = useQuery({
    queryKey: ['teachers', t.slug],
    enabled: open && canAssignTeacher,
    queryFn: async () => (await t.get<{ teachers: Teacher[] }>('/teachers')).data.teachers,
  });

  useEffect(() => {
    if (open && klass) {
      setForm(formFromClass(klass));
      setError('');
    }
  }, [open, klass]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!klass) throw new Error('No class selected');
      const payload: Record<string, unknown> = {
          title: form.title.trim(),
          description: form.description,
          subject: form.subject.trim(),
          price: Number(form.price) || 0,
          batchId: form.batchId || '',
          isPublished: form.isPublished,
      };
      if (canAssignTeacher && form.teacherId) payload.teacherId = form.teacherId;
      return (await t.patch<{ class: ClassSummary }>(`/classes/${klass.id}`, payload)).data.class;
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['classes', t.slug] });
      qc.invalidateQueries({ queryKey: ['class', klass?.id] });
      qc.invalidateQueries({ queryKey: ['classes-catalog', t.slug] });
      qc.invalidateQueries({ queryKey: ['question-bank-meta', t.slug] });
      onSaved?.(updated);
      onClose();
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  if (!klass) return null;

  return (
    <Modal open={open} onClose={onClose} title="Edit class" className="max-w-lg">
      <div className="space-y-3">
        <p className="-mt-2 text-sm text-slate-500">
          Update class details. Inactive classes stay hidden from students.
        </p>
        <Input
          label="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <Input
          label="Subject"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder="e.g. ICT, Combined Maths"
        />
        <Textarea
          label="Description"
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Price (Rs.) — 0 for free"
            type="number"
            min={0}
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
          <Select
            label="Batch (optional)"
            value={form.batchId}
            onChange={(e) => setForm({ ...form, batchId: e.target.value })}
          >
            <option value="">No batch</option>
            {batchesQuery.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.year ? ` (${b.year})` : ''}
              </option>
            ))}
          </Select>
        </div>

        {canAssignTeacher && (
          <Select
            label="Teacher"
            value={form.teacherId}
            onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
          >
            <option value="">Select teacher</option>
            {klass.teacher && !teachersQuery.data?.some((teacher) => teacher.id === klass.teacher?.id) && (
              <option value={klass.teacher.id}>{klass.teacher.name} (current)</option>
            )}
            {teachersQuery.data?.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </option>
            ))}
            {user?.role === 'admin' && user.id && <option value={user.id}>Me (institute admin)</option>}
          </Select>
        )}

        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.isPublished}
            onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
          />
          <span>
            <span className="block font-medium text-slate-800 dark:text-slate-100">
              Class is active
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              When off, students cannot see or open this class (including enrolled students).
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || form.title.trim().length < 2}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
