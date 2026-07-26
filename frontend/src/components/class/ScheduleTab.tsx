import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Button, Card, Input, Select, Spinner, Textarea } from '../ui';
import { Icon } from '../icons';
import { apiErrorMessage } from '../../api/client';
import type { ClassSchedule, MeetingPlatform } from '../../api/types';

const PLATFORMS: { value: MeetingPlatform; label: string; color: string }[] = [
  { value: 'zoom', label: 'Zoom', color: 'bg-blue-100 text-blue-700' },
  { value: 'teams', label: 'Microsoft Teams', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'google_meet', label: 'Google Meet', color: 'bg-emerald-100 text-emerald-700' },
];

const EMPTY_FORM = {
  classDate: '',
  classTime: '',
  platform: 'zoom' as MeetingPlatform,
  meetingText: '',
};

function platformMeta(platform: MeetingPlatform) {
  return PLATFORMS.find((p) => p.value === platform) ?? PLATFORMS[0];
}

function formatScheduleDate(classDate: string) {
  const [year, month, day] = classDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatScheduleTime(classTime: string) {
  const [hours, minutes] = classTime.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function extractMeetingUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match?.[0] ?? null;
}

function PlatformIcon({ platform, size = 18 }: { platform: MeetingPlatform; size?: number }) {
  if (platform === 'zoom') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <rect x="2" y="6" width="14" height="12" rx="3" fill="#2D8CFF" />
        <path d="M16 10l6-3v10l-6-3v-4z" fill="#2D8CFF" />
      </svg>
    );
  }
  if (platform === 'teams') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <rect x="3" y="5" width="12" height="14" rx="2" fill="#5059C9" />
        <circle cx="17" cy="9" r="3" fill="#7B83EB" />
        <path d="M14 14h8v6h-8z" fill="#7B83EB" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M5 5h8l3 3v11H5z"
        fill="#00AC47"
      />
      <path d="M13 5h6v14h-6z" fill="#00832D" />
      <path d="M9 11l2.5 2L14 10l4 5H6z" fill="#fff" />
    </svg>
  );
}

function normalizeClassTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : value;
}

function ScheduleForm({
  initial,
  onCancel,
  onSave,
  saving,
}: {
  initial: typeof EMPTY_FORM;
  onCancel: () => void;
  onSave: (data: typeof EMPTY_FORM) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);

  return (
    <Card className="space-y-4">
      <h4 className="font-semibold text-slate-900 dark:text-white">
        {initial.classDate ? 'Edit class schedule' : 'New class schedule'}
      </h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Class date"
          type="date"
          value={form.classDate}
          onChange={(e) => setForm((f) => ({ ...f, classDate: e.target.value }))}
          required
        />
        <Input
          label="Class time"
          type="time"
          value={form.classTime}
          onChange={(e) => setForm((f) => ({ ...f, classTime: e.target.value }))}
          required
        />
      </div>
      <Select
        label="Platform"
        value={form.platform}
        onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as MeetingPlatform }))}
      >
        {PLATFORMS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
        <PlatformIcon platform={form.platform} />
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${platformMeta(form.platform).color}`}>
          {platformMeta(form.platform).label}
        </span>
      </div>
      <Textarea
        label="Meeting link / invitation text"
        value={form.meetingText}
        onChange={(e) => setForm((f) => ({ ...f, meetingText: e.target.value }))}
        rows={4}
        placeholder="Paste the meeting link or full invitation message for students"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            onSave({
              ...form,
              classTime: normalizeClassTime(form.classTime),
            })
          }
          disabled={saving || !form.classDate || !form.classTime}
        >
          {saving ? 'Saving...' : 'Save schedule'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export function ScheduleTab({
  classId,
  canManage,
}: {
  classId: string;
  canManage: boolean;
}) {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');

  const schedulesQuery = useQuery({
    queryKey: ['schedules', t.slug, classId],
    queryFn: async () =>
      (await t.get<{ schedules: ClassSchedule[] }>(`/classes/${classId}/schedules`)).data.schedules,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) =>
      (await t.post(`/classes/${classId}/schedules`, data)).data,
    onSuccess: () => {
      setSaveError('');
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ['schedules', t.slug, classId] });
    },
    onError: (err) => setSaveError(apiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof EMPTY_FORM }) =>
      (await t.patch(`/classes/${classId}/schedules/${id}`, data)).data,
    onSuccess: () => {
      setSaveError('');
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['schedules', t.slug, classId] });
    },
    onError: (err) => setSaveError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await t.del(`/classes/${classId}/schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', t.slug, classId] });
    },
  });

  const schedules = schedulesQuery.data ?? [];
  const editingSchedule = schedules.find((s) => s.id === editingId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Class schedule</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Upcoming live sessions with date, time, and meeting details
          </p>
        </div>
        {canManage && !creating && !editingId && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <span className="text-lg leading-none">+</span> New schedule
          </button>
        )}
      </div>

      {creating && (
        <ScheduleForm
          initial={EMPTY_FORM}
          saving={createMutation.isPending}
          onCancel={() => {
            setCreating(false);
            setSaveError('');
          }}
          onSave={(data) => createMutation.mutate(data)}
        />
      )}

      {editingSchedule && (
        <ScheduleForm
          initial={{
            classDate: editingSchedule.classDate,
            classTime: editingSchedule.classTime,
            platform: editingSchedule.platform,
            meetingText: editingSchedule.meetingText,
          }}
          saving={updateMutation.isPending}
          onCancel={() => {
            setEditingId(null);
            setSaveError('');
          }}
          onSave={(data) => updateMutation.mutate({ id: editingSchedule.id, data })}
        />
      )}

      {saveError && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{saveError}</p>
      )}

      <Card>
        {schedulesQuery.isLoading ? (
          <Spinner />
        ) : schedules.length > 0 ? (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {schedules.map((schedule) => {
              const meta = platformMeta(schedule.platform);
              const meetingUrl = extractMeetingUrl(schedule.meetingText);

              return (
                <li key={schedule.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 dark:border-white/10 dark:bg-white/5">
                          <PlatformIcon platform={schedule.platform} />
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.color}`}>
                            {meta.label}
                          </span>
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {formatScheduleDate(schedule.classDate)}
                        </p>
                        <p className="text-sm text-slate-500">{formatScheduleTime(schedule.classTime)}</p>
                      </div>
                      {schedule.meetingText && (
                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
                          <p className="whitespace-pre-wrap break-words">{schedule.meetingText}</p>
                          {meetingUrl && (
                            <a
                              href={meetingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
                            >
                              <Icon name="live" width={14} height={14} />
                              Join meeting
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Edit schedule"
                          onClick={() => {
                            setCreating(false);
                            setEditingId(schedule.id);
                          }}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 dark:border-white/10 dark:bg-white/5"
                        >
                          <Icon name="note" width={16} height={16} />
                        </button>
                        <button
                          type="button"
                          title="Delete schedule"
                          onClick={() => {
                            if (window.confirm('Delete this schedule entry?')) {
                              deleteMutation.mutate(schedule.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="grid h-8 w-8 place-items-center rounded-lg bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-40"
                        >
                          <Icon name="trash" width={16} height={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            {canManage ? 'No class schedules yet. Add the first session above.' : 'No class schedules published yet.'}
          </p>
        )}
      </Card>
    </div>
  );
}
