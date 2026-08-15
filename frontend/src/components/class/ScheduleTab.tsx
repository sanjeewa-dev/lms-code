import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Button, Card, Input, Select, Spinner, Textarea } from '../ui';
import { Icon } from '../icons';
import { apiErrorMessage } from '../../api/client';
import { LiveClassRoom } from '../LiveClassRoom';
import { useAuth } from '../../context/AuthContext';
import type { ClassSchedule, MeetingPlatform } from '../../api/types';

const PLATFORMS: { value: MeetingPlatform; label: string; color: string }[] = [
  { value: 'zoom', label: 'Zoom', color: 'bg-blue-100 text-blue-700' },
  { value: 'teams', label: 'Microsoft Teams', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'google_meet', label: 'Google Meet', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'jitsi', label: 'Live Class (Jitsi)', color: 'bg-red-100 text-red-700' },
];

const EMPTY_FORM = {
  classDate: '',
  classTime: '',
  platform: 'zoom' as MeetingPlatform,
  meetingText: '',
  externalMeetingUrl: '',
  repeat: 'once' as 'once' | 'daily' | 'weekly' | 'weekdays' | 'weekends' | 'custom',
  repeatUntil: '',
  customDays: [] as number[],
};

const REPEAT_OPTIONS: { value: typeof EMPTY_FORM.repeat; label: string }[] = [
  { value: 'once', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly (same weekday)' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekends', label: 'Weekends (Sat–Sun)' },
  { value: 'custom', label: 'Custom days' },
];

const WEEKDAY_CHOICES: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 0, label: 'Sunday', short: 'Sun' },
];

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
  if (platform === 'jitsi') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="#E53E3E" />
        <rect x="7" y="9" width="7" height="6" rx="1.5" fill="#fff" />
        <path d="M14 11l4-2v6l-4-2v-2z" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M5 5h8l3 3v11H5z" fill="#00AC47" />
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
  allowRepeat = false,
}: {
  initial: typeof EMPTY_FORM;
  onCancel: () => void;
  onSave: (data: typeof EMPTY_FORM) => void;
  saving: boolean;
  allowRepeat?: boolean;
}) {
  const [form, setForm] = useState(initial);
  const isRecurring = allowRepeat && form.repeat !== 'once';
  const canSave =
    Boolean(form.classDate && form.classTime) &&
    (!isRecurring || Boolean(form.repeatUntil)) &&
    (form.repeat !== 'custom' || form.customDays.length > 0);

  const toggleCustomDay = (day: number) => {
    setForm((f) => {
      const has = f.customDays.includes(day);
      return {
        ...f,
        customDays: has ? f.customDays.filter((d) => d !== day) : [...f.customDays, day].sort(),
      };
    });
  };

  return (
    <Card className="space-y-4">
      <h4 className="font-semibold text-slate-900 dark:text-white">
        {initial.classDate && !allowRepeat ? 'Edit class schedule' : 'New class schedule'}
      </h4>

      {allowRepeat && (
        <Select
          label="Schedule type"
          value={form.repeat}
          onChange={(e) => {
            const value = e.target.value as typeof EMPTY_FORM.repeat;
            setForm((f) => ({
              ...f,
              repeat: value,
              repeatUntil: value === 'once' ? '' : f.repeatUntil,
              customDays: value === 'custom' ? f.customDays : [],
            }));
          }}
        >
          {REPEAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={isRecurring ? 'Start date' : 'Class date'}
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

      {isRecurring && (
        <Input
          label="Repeat until"
          type="date"
          value={form.repeatUntil}
          min={form.classDate || undefined}
          onChange={(e) => setForm((f) => ({ ...f, repeatUntil: e.target.value }))}
          required
        />
      )}

      {allowRepeat && form.repeat === 'custom' && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Repeat on these days
          </p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_CHOICES.map((d) => {
              const active = form.customDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleCustomDay(d.value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'border-brand-500 bg-brand-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-brand-300 dark:border-white/10 dark:text-slate-300'
                  }`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
          {form.customDays.length === 0 && (
            <p className="mt-1.5 text-xs text-amber-600">Select at least one day.</p>
          )}
        </div>
      )}

      {isRecurring && (
        <p className="text-xs text-slate-400">
          Creates up to 52 sessions. Same time and meeting details are used for each date.
        </p>
      )}

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
      {form.platform !== 'jitsi' && (
        <>
          <Input
            label="Meeting link"
            type="url"
            value={form.externalMeetingUrl}
            onChange={(e) => setForm((f) => ({ ...f, externalMeetingUrl: e.target.value }))}
            placeholder="https://zoom.us/j/... or Teams meeting link"
          />
          <p className="text-xs text-slate-400">
            This private link is displayed only after an authorized student selects Join meeting.
          </p>
          <Textarea
            label="Meeting notes (optional)"
            value={form.meetingText}
            onChange={(e) => setForm((f) => ({ ...f, meetingText: e.target.value }))}
            rows={3}
            placeholder="e.g. Please join five minutes early."
          />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            onSave({
              ...form,
              classTime: normalizeClassTime(form.classTime),
            })
          }
          disabled={saving || !canSave}
        >
          {saving
            ? 'Saving...'
            : isRecurring
              ? 'Create recurring schedules'
              : 'Save schedule'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

interface LiveRoom {
  scheduleId: string;
  roomName: string;
  jitsiHost: string;
  jwt: string | null;
  isModerator: boolean;
}

export function ScheduleTab({
  classId,
  classTitle,
  canManage,
}: {
  classId: string;
  classTitle?: string;
  canManage: boolean;
}) {
  const t = useTenantApi();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [activeRoom, setActiveRoom] = useState<LiveRoom | null>(null);
  const [listTab, setListTab] = useState<'upcoming' | 'completed'>('upcoming');

  const todayKey = new Date().toISOString().slice(0, 10);

  function isCompleted(schedule: ClassSchedule) {
    if (schedule.status === 'ended') return true;
    if (schedule.status === 'live') return false;
    return schedule.classDate.slice(0, 10) < todayKey;
  }

  const schedulesQuery = useQuery({
    queryKey: ['schedules', t.slug, classId],
    queryFn: async () =>
      (await t.get<{ schedules: ClassSchedule[] }>(`/classes/${classId}/schedules`)).data.schedules,
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const body: Record<string, unknown> = {
        classDate: data.classDate,
        classTime: data.classTime,
        platform: data.platform,
        meetingText: data.meetingText,
        externalMeetingUrl: data.externalMeetingUrl,
        repeat: data.repeat,
      };
      if (data.repeat !== 'once' && data.repeatUntil) {
        body.repeatUntil = data.repeatUntil;
      }
      if (data.repeat === 'custom') {
        body.customDays = data.customDays;
      }
      return (await t.post<{ created?: number }>(`/classes/${classId}/schedules`, body)).data;
    },
    onSuccess: (res) => {
      setSaveError('');
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ['schedules', t.slug, classId] });
      queryClient.invalidateQueries({ queryKey: ['live-upcoming', t.slug] });
      const created = res?.created ?? 1;
      if (created > 1) {
        setSaveNotice(`Created ${created} recurring sessions.`);
      } else {
        setSaveNotice('Session scheduled.');
      }
      if (created >= 52) {
        setSaveNotice((msg) => `${msg} Recurring schedules are capped at 52 sessions.`);
      }
    },
    onError: (err) => setSaveError(apiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof EMPTY_FORM }) =>
      (
        await t.patch(`/classes/${classId}/schedules/${id}`, {
          classDate: data.classDate,
          classTime: data.classTime,
          platform: data.platform,
          meetingText: data.meetingText,
          externalMeetingUrl: data.externalMeetingUrl,
        })
      ).data,
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

  const startMutation = useMutation({
    mutationFn: async (id: string) =>
      (await t.post<{ roomName: string; jitsiHost: string; jwt: string | null }>(`/classes/${classId}/schedules/${id}/start`, {})).data,
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['schedules', t.slug, classId] });
      setActiveRoom({ scheduleId: id, roomName: data.roomName, jitsiHost: data.jitsiHost, jwt: data.jwt, isModerator: true });
    },
    onError: (err) => setSaveError(apiErrorMessage(err)),
  });

  const endMutation = useMutation({
    mutationFn: async ({ id, recordingUrl }: { id: string; recordingUrl: string | null }) =>
      (await t.post(`/classes/${classId}/schedules/${id}/end`, { recordingUrl })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', t.slug, classId] });
      setActiveRoom(null);
    },
    onError: (err) => setSaveError(apiErrorMessage(err)),
  });

  const joinMutation = useMutation({
    mutationFn: async (id: string) =>
      (await t.get<{ roomName: string; jitsiHost: string; jwt: string | null }>(`/classes/${classId}/schedules/${id}/join`)).data,
    onSuccess: (data, id) => {
      setActiveRoom({ scheduleId: id, roomName: data.roomName, jitsiHost: data.jitsiHost, jwt: data.jwt, isModerator: false });
    },
    onError: (err) => setSaveError(apiErrorMessage(err)),
  });

  const schedules = schedulesQuery.data ?? [];
  const upcomingSchedules = schedules.filter((s) => !isCompleted(s));
  const completedSchedules = schedules.filter((s) => isCompleted(s));
  const visibleSchedules = listTab === 'upcoming' ? upcomingSchedules : completedSchedules;
  const editingSchedule = schedules.find((s) => s.id === editingId);

  if (activeRoom) {
    return (
      <LiveClassRoom
        roomName={activeRoom.roomName}
        jitsiHost={activeRoom.jitsiHost}
        jwt={activeRoom.jwt}
        displayName={user?.name ?? 'User'}
        isModerator={activeRoom.isModerator}
        className={classTitle ?? 'Class'}
        onEnd={(recordingUrl) => endMutation.mutate({ id: activeRoom.scheduleId, recordingUrl })}
        onLeave={() => setActiveRoom(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Class schedule</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {listTab === 'upcoming'
              ? 'Upcoming and live sessions'
              : 'Past and completed sessions'}
          </p>
        </div>
        {canManage && !creating && !editingId && listTab === 'upcoming' && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <span className="text-lg leading-none">+</span> New schedule
          </button>
        )}
      </div>

      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/5">
        <button
          type="button"
          onClick={() => setListTab('upcoming')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            listTab === 'upcoming'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-ink-850 dark:text-white'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Upcoming
          <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
            {upcomingSchedules.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setListTab('completed')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            listTab === 'completed'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-ink-850 dark:text-white'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Completed
          <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
            {completedSchedules.length}
          </span>
        </button>
      </div>

      {creating && (
        <ScheduleForm
          initial={EMPTY_FORM}
          allowRepeat
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
            externalMeetingUrl: editingSchedule.externalMeetingUrl ?? '',
            repeat: 'once',
            repeatUntil: '',
            customDays: [],
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
      {saveNotice && (
        <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          {saveNotice}
        </p>
      )}

      <Card>
        {schedulesQuery.isLoading ? (
          <Spinner />
        ) : visibleSchedules.length > 0 ? (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {visibleSchedules.map((schedule) => {
              const meta = platformMeta(schedule.platform);
              const isLive = schedule.status === 'live';
              const isEnded = schedule.status === 'ended';
              const pastScheduled = listTab === 'completed' && !isEnded && !isLive;

              return (
                <li key={schedule.id} className={`py-4 first:pt-0 last:pb-0 ${isLive ? 'rounded-xl bg-red-50/60 px-3 dark:bg-red-950/20' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 dark:border-white/10 dark:bg-white/5">
                          <PlatformIcon platform={schedule.platform} />
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.color}`}>
                            {meta.label}
                          </span>
                        </span>
                        {isLive && (
                          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                            LIVE NOW
                          </span>
                        )}
                        {(isEnded || pastScheduled) && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:bg-white/10">
                            {isEnded ? 'Ended' : 'Completed'}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {formatScheduleDate(schedule.classDate)}
                        </p>
                        <p className="text-sm text-slate-500">{formatScheduleTime(schedule.classTime)}</p>
                      </div>

                      {isEnded && schedule.recordingUrl && (
                        <a
                          href={schedule.recordingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
                        >
                          <Icon name="play" width={14} height={14} />
                          Watch recording
                        </a>
                      )}

                      {schedule.meetingText && listTab === 'upcoming' && !isLive && !isEnded && (
                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
                          <p className="whitespace-pre-wrap break-words">{schedule.meetingText}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {listTab === 'upcoming' && !canManage && isLive && schedule.platform === 'jitsi' && (
                        <button
                          type="button"
                          disabled={joinMutation.isPending}
                          onClick={() => joinMutation.mutate(schedule.id)}
                          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                        >
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                          Join live
                        </button>
                      )}
                      {listTab === 'upcoming' &&
                        !canManage &&
                        schedule.platform !== 'jitsi' &&
                        schedule.hasExternalMeetingLink &&
                        !isEnded && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const { data } = await t.get<{ meetingUrl: string }>(
                                  `/classes/${classId}/schedules/${schedule.id}/external-join`
                                );
                                window.open(data.meetingUrl, '_blank', 'noopener,noreferrer');
                              } catch (err) {
                                setSaveError(apiErrorMessage(err));
                              }
                            }}
                            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                          >
                            <Icon name="live" width={15} height={15} />
                            Join meeting
                          </button>
                        )}

                      {listTab === 'upcoming' &&
                        canManage &&
                        schedule.platform === 'jitsi' &&
                        schedule.status === 'scheduled' && (
                          <button
                            type="button"
                            disabled={startMutation.isPending}
                            onClick={() => startMutation.mutate(schedule.id)}
                            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                          >
                            {startMutation.isPending ? (
                              <Spinner className="h-4 w-4" />
                            ) : (
                              <span className="h-2 w-2 rounded-full bg-white" />
                            )}
                            Start class
                          </button>
                        )}
                      {listTab === 'upcoming' && canManage && isLive && schedule.platform === 'jitsi' && (
                        <button
                          type="button"
                          disabled={startMutation.isPending}
                          onClick={() => startMutation.mutate(schedule.id)}
                          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                        >
                          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                          Re-enter room
                        </button>
                      )}

                      {canManage && listTab === 'upcoming' && !isLive && !isEnded && (
                        <>
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
                        </>
                      )}

                      {canManage && listTab === 'completed' && (
                        <button
                          type="button"
                          title="Delete schedule"
                          onClick={() => {
                            if (window.confirm('Delete this completed schedule entry?')) {
                              deleteMutation.mutate(schedule.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="grid h-8 w-8 place-items-center rounded-lg bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-40"
                        >
                          <Icon name="trash" width={16} height={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            {listTab === 'upcoming'
              ? canManage
                ? 'No upcoming schedules. Add a new session above.'
                : 'No upcoming schedules yet.'
              : 'No completed schedules yet.'}
          </p>
        )}
      </Card>
    </div>
  );
}
