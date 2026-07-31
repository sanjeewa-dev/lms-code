import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { Badge, Card, Modal, Spinner } from '../components/ui';
import { Icon } from '../components/icons';
import { EmptyState, PageHeader } from '../components/tenant/TenantUi';
import { LiveClassRoom } from '../components/LiveClassRoom';
import { apiErrorMessage } from '../api/client';
import type { SessionStatus } from '../api/types';
import { showToast } from '../components/AppToast';

const platformLabel: Record<string, string> = {
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  google_meet: 'Google Meet',
  jitsi: 'Live Class',
};

interface Session {
  id: string;
  classDate: string;
  classTime: string;
  platform: string;
  meetingText: string;
  status: SessionStatus;
  roomName: string | null;
  class: { id: string; title: string; teacher: { name: string } };
}

interface LiveRoom {
  scheduleId: string;
  className: string;
  roomName: string;
  jitsiHost: string;
  jwt: string | null;
  isModerator: boolean;
}

interface StudentItem {
  id: string;
  name: string;
  email: string;
  classes: string[];
}

interface ClassItem {
  id: string;
  title: string;
}

function joinHref(text: string) {
  const url = text.trim();
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({
  scheduleId,
  students,
  classes,
  onClose,
  onSent,
}: {
  scheduleId: string;
  students: StudentItem[];
  classes: ClassItem[];
  onClose: () => void;
  onSent: (count: number) => void;
}) {
  const t = useTenantApi();
  const [mode, setMode] = useState<'students' | 'class'>('students');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedClass, setSelectedClass] = useState(classes[0]?.id ?? '');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

  const filtered = students.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAll = () => setSelected(new Set(filtered.map((s) => s.id)));
  const clearAll = () => setSelected(new Set());

  const send = async () => {
    setSending(true);
    setErr('');
    try {
      const body =
        mode === 'class'
          ? { classId: selectedClass }
          : { studentIds: Array.from(selected) };
      const res = await t.post<{ invited: number }>(`/live/instant/${scheduleId}/invite`, body);
      onSent(res.data.invited);
      onClose();
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const canSend = mode === 'class' ? Boolean(selectedClass) : selected.size > 0;

  return (
    <Modal open title="Invite participants" onClose={onClose}>
      <p className="-mt-1 mb-3 text-xs text-slate-500 dark:text-slate-400">
        Send join link via notification and email
      </p>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode('students')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            mode === 'students'
              ? 'bg-brand-600 text-white'
              : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5'
          }`}
        >
          Invite students
        </button>
        <button
          type="button"
          onClick={() => setMode('class')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            mode === 'class'
              ? 'bg-brand-600 text-white'
              : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5'
          }`}
        >
          Invite by class
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {mode === 'class' ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              All active students of the selected class will receive a notification and email.
            </p>
            {classes.length === 0 ? (
              <p className="text-sm text-red-500">No classes found.</p>
            ) : (
              <div className="space-y-2">
                {classes.map((c) => (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                      selectedClass === c.id
                        ? 'border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-900/20'
                        : 'border-slate-200 hover:border-brand-200 dark:border-white/10 dark:hover:border-brand-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="invite-class"
                      value={c.id}
                      checked={selectedClass === c.id}
                      onChange={() => setSelectedClass(c.id)}
                      className="accent-brand-600"
                    />
                    <span className="font-medium text-slate-800 dark:text-slate-100">{c.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search students..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
              <button
                type="button"
                onClick={selected.size === filtered.length ? clearAll : selectAll}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
              >
                {selected.size === filtered.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400">No students found.</p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        className="h-4 w-4 rounded accent-brand-600"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{s.name}</p>
                        <p className="truncate text-xs text-slate-400">{s.email}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">
                        {s.classes[0]}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/10">
        <div>
          {mode === 'students' && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {selected.size} student{selected.size !== 1 ? 's' : ''} selected
            </p>
          )}
          {err && <p className="text-sm text-red-500">{err}</p>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSend || sending}
            onClick={send}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {sending ? <Spinner className="h-4 w-4" /> : <Icon name="spark" width={14} height={14} />}
            {sending ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Instant Meeting Launcher ─────────────────────────────────────────────────

function InstantMeetingLauncher({
  onStarted,
}: {
  onStarted: (room: LiveRoom & { scheduleId: string; classId: string }) => void;
}) {
  const t = useTenantApi();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');

  const classesQuery = useQuery({
    queryKey: ['teacher-classes-for-instant', t.slug],
    queryFn: async () => (await t.get<{ classes: ClassItem[] }>('/live/students')).data.classes,
    enabled: open,
  });

  const [selectedClass, setSelectedClass] = useState('');

  const startMutation = useMutation({
    mutationFn: async () =>
      (
        await t.post<{
          scheduleId: string;
          classId: string;
          className: string;
          roomName: string;
          jitsiHost: string;
          jwt: string | null;
        }>('/live/instant', { classId: selectedClass || undefined })
      ).data,
    onSuccess: (data) => {
      setOpen(false);
      setErr('');
      onStarted({ ...data, isModerator: true });
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 dark:border-white/15 dark:bg-ink-850 dark:text-white dark:hover:border-brand-500 dark:hover:bg-brand-950/40"
      >
        <Icon name="live" width={16} height={16} className="text-brand-600" />
        Start instant meeting
      </button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setErr('');
        }}
        title="Start instant meeting"
        className="max-w-md"
      >
        <p className="-mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose a class to attach this meeting to (for attendance and student access).
        </p>
        {classesQuery.isLoading ? (
          <div className="mt-4 flex justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Class
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              <option value="">— Select class —</option>
              {(classesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
        {err && <p className="mt-2 text-sm text-red-500">{err}</p>}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={startMutation.isPending}
            onClick={() => startMutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {startMutation.isPending ? <Spinner className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-white" />}
            Start now
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setErr('');
            }}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LiveClass() {
  const t = useTenantApi();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const base = `/${slug}`;
  const [activeRoom, setActiveRoom] = useState<(LiveRoom & { scheduleId: string; classId: string }) | null>(null);
  const [inviteScheduleId, setInviteScheduleId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const query = useQuery({
    queryKey: ['live-upcoming', t.slug],
    queryFn: async () => (await t.get<{ sessions: Session[] }>('/live/upcoming')).data.sessions,
    refetchInterval: 15_000,
  });

  const studentsQuery = useQuery({
    queryKey: ['live-students', t.slug],
    queryFn: async () =>
      (await t.get<{ students: StudentItem[]; classes: ClassItem[] }>('/live/students')).data,
    enabled: Boolean(inviteScheduleId),
  });

  const today = new Date().toISOString().slice(0, 10);
  const isStaff = user?.role === 'teacher' || user?.role === 'admin';

  const startMutation = useMutation({
    mutationFn: async (s: Session) =>
      (await t.post<{ roomName: string; jitsiHost: string; jwt: string | null; scheduleId?: string }>(
        `/classes/${s.class.id}/schedules/${s.id}/start`,
        {}
      )).data,
    onSuccess: (data, s) => {
      qc.invalidateQueries({ queryKey: ['live-upcoming', t.slug] });
      setActiveRoom({
        scheduleId: s.id,
        classId: s.class.id,
        className: s.class.title,
        roomName: data.roomName,
        jitsiHost: data.jitsiHost,
        jwt: data.jwt,
        isModerator: true,
      });
      setActionError('');
    },
    onError: (e) => setActionError(apiErrorMessage(e)),
  });

  const joinMutation = useMutation({
    mutationFn: async (s: Session) =>
      (await t.get<{ roomName: string; jitsiHost: string; jwt: string | null }>(
        `/classes/${s.class.id}/schedules/${s.id}/join`
      )).data,
    onSuccess: (data, s) => {
      setActiveRoom({
        scheduleId: s.id,
        classId: s.class.id,
        className: s.class.title,
        roomName: data.roomName,
        jitsiHost: data.jitsiHost,
        jwt: data.jwt,
        isModerator: false,
      });
      setActionError('');
    },
    onError: (e) => setActionError(apiErrorMessage(e)),
  });

  const endMutation = useMutation({
    mutationFn: async ({ scheduleId, classId, recordingUrl }: { scheduleId: string; classId: string; recordingUrl: string | null }) =>
      (await t.post(`/classes/${classId}/schedules/${scheduleId}/end`, { recordingUrl })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live-upcoming', t.slug] });
      setActiveRoom(null);
    },
    onError: (e) => setActionError(apiErrorMessage(e)),
  });

  if (activeRoom) {
    return (
      <>
        <LiveClassRoom
          roomName={activeRoom.roomName}
          jitsiHost={activeRoom.jitsiHost}
          jwt={activeRoom.jwt}
          displayName={user?.name ?? 'User'}
          isModerator={activeRoom.isModerator}
          className={activeRoom.className}
          onEnd={(recordingUrl) =>
            endMutation.mutate({ scheduleId: activeRoom.scheduleId, classId: activeRoom.classId, recordingUrl })
          }
          onLeave={() => setActiveRoom(null)}
        />
        {/* Invite button overlay when teacher is in live room */}
        {activeRoom.isModerator && (
          <div className="fixed bottom-6 right-6 z-[60]">
            <button
              type="button"
              onClick={() => setInviteScheduleId(activeRoom.scheduleId)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-xl transition hover:bg-brand-700"
            >
              <Icon name="users" width={16} height={16} />
              Invite participants
            </button>
          </div>
        )}
        {inviteScheduleId && (
          <InviteModal
            scheduleId={inviteScheduleId}
            students={studentsQuery.data?.students ?? []}
            classes={studentsQuery.data?.classes ?? []}
            onClose={() => setInviteScheduleId(null)}
            onSent={(count) => {
              setInviteScheduleId(null);
              showToast(`Invite sent to ${count} student${count !== 1 ? 's' : ''} successfully.`);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          icon="live"
          tone="pink"
          title="Live Class"
          subtitle="Across your classes — upcoming and active live sessions"
        />
        {isStaff && (
          <InstantMeetingLauncher
            onStarted={(room) => {
              qc.invalidateQueries({ queryKey: ['live-upcoming', t.slug] });
              setActiveRoom(room);
            }}
          />
        )}
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {actionError}
        </div>
      )}

      {query.isLoading ? (
        <Spinner label="Loading sessions..." />
      ) : !query.data?.length ? (
        <EmptyState
          message="No upcoming live sessions. Teachers can add schedules from the class schedule page."
          action={
            <Link
              to={`${base}/classes`}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Go to classes
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {query.data.map((s) => {
            const dateStr = s.classDate.slice(0, 10);
            const isToday = dateStr === today;
            const isLive = s.status === 'live';
            const isEnded = s.status === 'ended';
            const href = joinHref(s.meetingText);

            return (
              <Card
                key={s.id}
                className={`rounded-2xl transition ${
                  isLive
                    ? 'border-red-300 shadow-md shadow-red-100 dark:border-red-700 dark:shadow-none'
                    : isToday
                      ? 'border-brand-300 dark:border-brand-600'
                      : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${isLive ? 'bg-red-100 text-red-600' : 'bg-pink-100 text-pink-600'}`}>
                        <Icon name="live" width={20} height={20} />
                      </span>
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-slate-900 dark:text-white">{s.class.title}</h2>
                          {isLive && (
                            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                              LIVE
                            </span>
                          )}
                          {!isLive && isToday && <Badge tone="blue">Today</Badge>}
                          {isEnded && <Badge tone="slate">Ended</Badge>}
                          <Badge tone="slate">{platformLabel[s.platform] ?? s.platform}</Badge>
                        </div>
                        <p className="text-sm text-slate-500">
                          {new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
                            weekday: 'long',
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          · {s.classTime} · {s.class.teacher.name}
                        </p>
                        {s.meetingText && !href && !isLive && (
                          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
                            {s.meetingText}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* External platform link */}
                    {href && !isLive && !isEnded && (
                      <a href={href} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                        <Icon name="live" />
                        Join now
                      </a>
                    )}

                    {/* Teacher: Start — Live Class (Jitsi) only */}
                    {isStaff && s.platform === 'jitsi' && s.status === 'scheduled' && (
                      <button type="button" disabled={startMutation.isPending}
                        onClick={() => startMutation.mutate(s)}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-red-600/20 transition hover:bg-red-700 disabled:opacity-50">
                        {startMutation.isPending ? <Spinner className="h-4 w-4" /> : <span className="h-2 w-2 animate-pulse rounded-full bg-white" />}
                        Start class
                      </button>
                    )}

                    {/* Teacher: Re-enter live + Invite — Jitsi live only */}
                    {isStaff && isLive && s.platform === 'jitsi' && (
                      <>
                        <button type="button" disabled={startMutation.isPending}
                          onClick={() => startMutation.mutate(s)}
                          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                          Re-enter room
                        </button>
                        <button type="button"
                          onClick={() => setInviteScheduleId(s.id)}
                          className="inline-flex items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
                          <Icon name="users" width={14} height={14} />
                          Invite
                        </button>
                      </>
                    )}

                    {/* Student: Join live — Jitsi live only */}
                    {!isStaff && isLive && s.platform === 'jitsi' && (
                      <button type="button" disabled={joinMutation.isPending}
                        onClick={() => joinMutation.mutate(s)}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700">
                        {joinMutation.isPending ? <Spinner className="h-4 w-4" /> : <span className="h-2 w-2 animate-pulse rounded-full bg-white" />}
                        Join live now
                      </button>
                    )}

                    <Link to={`${base}/classes/${s.class.id}/schedule`}
                      className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
                      Class schedule
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Invite Modal */}
      {inviteScheduleId && (
        <InviteModal
          scheduleId={inviteScheduleId}
          students={studentsQuery.data?.students ?? []}
          classes={studentsQuery.data?.classes ?? []}
          onClose={() => setInviteScheduleId(null)}
          onSent={(count) => {
            setInviteScheduleId(null);
            showToast(`Invite sent to ${count} student${count !== 1 ? 's' : ''} successfully.`);
          }}
        />
      )}
    </div>
  );
}
