import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { Button, Modal, Spinner } from '../components/ui';
import { Icon } from '../components/icons';

type InterventionStatus = 'open' | 'in_progress' | 'resolved' | 'escalated';

interface Intervention {
  id: string;
  reason: string;
  action: string;
  status: InterventionStatus;
  followUpDate: string | null;
  resolvedAt: string | null;
  resolvedNote: string | null;
  createdAt: string;
  student: { id: string; name: string; email: string; guardianName: string | null; guardianPhone: string | null };
  createdBy: { id: string; name: string; role: string };
}

const STATUS_LABELS: Record<InterventionStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  escalated: 'Escalated',
};

const STATUS_COLORS: Record<InterventionStatus, string> = {
  open: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  escalated: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function StatusBadge({ status }: { status: InterventionStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function CreateInterventionModal({
  onClose,
  onCreated,
  initialStudentId = '',
  initialStudentName = '',
  initialReason = '',
}: {
  onClose: () => void;
  onCreated: () => void;
  initialStudentId?: string;
  initialStudentName?: string;
  initialReason?: string;
}) {
  const api = useTenantApi();
  const [studentSearch, setStudentSearch] = useState(initialStudentName);
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
  const [selectedStudentName, setSelectedStudentName] = useState(initialStudentName);
  const [reason, setReason] = useState(initialReason);
  const [action, setAction] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [err, setErr] = useState('');

  const { data: studentsData } = useQuery<{
    students?: { id: string; name: string; email: string }[];
    users?: { id: string; name: string; email: string }[];
  }>({
    queryKey: ['students-list'],
    queryFn: async () => {
      const r = await api.get<{
        students?: { id: string; name: string; email: string }[];
        users?: { id: string; name: string; email: string }[];
      }>('/students');
      return r.data;
    },
  });

  const allStudents: { id: string; name: string; email: string }[] = studentsData?.students ?? studentsData?.users ?? [];
  const filtered = studentSearch
    ? allStudents.filter(
        (s) =>
          s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
          s.email.toLowerCase().includes(studentSearch.toLowerCase())
      )
    : allStudents.slice(0, 10);

  useEffect(() => {
    if (!initialStudentId || !studentsData) return;
    const list = studentsData.students ?? studentsData.users ?? [];
    const match = list.find((s) => s.id === initialStudentId);
    if (!match) return;
    setSelectedStudentId(match.id);
    setSelectedStudentName(match.name);
    setStudentSearch(match.name);
  }, [initialStudentId, studentsData]);

  const mut = useMutation({
    mutationFn: () =>
      api.post('/interventions', {
        studentId: selectedStudentId,
        reason,
        action,
        followUpDate: followUpDate || undefined,
      }).then((r) => r.data),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  return (
    <Modal open onClose={onClose} title="Log Intervention">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Search Student</label>
          <input
            className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white"
            placeholder="Type name or email..."
            value={studentSearch}
            onChange={(e) => {
              setStudentSearch(e.target.value);
              if (selectedStudentId) {
                setSelectedStudentId('');
                setSelectedStudentName('');
              }
            }}
          />
          {!selectedStudentId && filtered.length > 0 && (
            <div className="max-h-36 overflow-y-auto overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedStudentId(s.id);
                    setSelectedStudentName(s.name);
                    setStudentSearch(s.name);
                  }}
                  className="w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 dark:border-white/5 dark:text-white dark:hover:bg-ink-700"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-slate-400">{s.email}</span>
                </button>
              ))}
            </div>
          )}
          {selectedStudentId && (
            <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-950/20 dark:text-brand-300">
              <Icon name="user" width={14} height={14} />
              {selectedStudentName}
              <button
                type="button"
                onClick={() => {
                  setSelectedStudentId('');
                  setSelectedStudentName('');
                  setStudentSearch('');
                }}
                className="ml-auto text-brand-400 hover:text-brand-600"
                aria-label="Clear selected student"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Reason for Intervention *
          </label>
          <textarea
            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white"
            rows={5}
            placeholder="Why is this student flagged? (low attendance, missing work, etc.)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Action Taken / Planned *
          </label>
          <textarea
            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white"
            rows={2}
            placeholder="Called guardian, arranged extra session, sent email..."
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Follow-up Date (optional)
          </label>
          <input
            type="date"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!selectedStudentId || !reason.trim() || !action.trim() || mut.isPending}
          >
            {mut.isPending ? (
              <>
                <Spinner compact /> Logging…
              </>
            ) : (
              'Log Intervention'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function InterventionCard({
  intervention,
  onUpdate,
}: {
  intervention: Intervention;
  onUpdate: () => void;
}) {
  const api = useTenantApi();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [newStatus, setNewStatus] = useState<InterventionStatus>(intervention.status);
  const [resolvedNote, setResolvedNote] = useState(intervention.resolvedNote ?? '');
  const [err, setErr] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      api.patch(`/interventions/${intervention.id}`, {
        status: newStatus,
        resolvedNote: resolvedNote || undefined,
      }).then((r) => r.data),
    onSuccess: () => { setEditing(false); onUpdate(); },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  const canEdit = user?.role === 'admin' || intervention.createdBy.id === user?.id;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink-850">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-bold text-slate-900 dark:text-white">{intervention.student.name}</p>
          <p className="text-xs text-slate-500">{intervention.student.email}</p>
        </div>
        <StatusBadge status={intervention.status} />
      </div>

      <div className="space-y-2 text-sm">
        <div className="rounded-lg bg-slate-50 dark:bg-ink-800 px-3 py-2">
          <span className="text-xs font-semibold uppercase text-slate-400 tracking-wide">Reason</span>
          <p className="text-slate-700 dark:text-slate-300 mt-0.5">{intervention.reason}</p>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-ink-800 px-3 py-2">
          <span className="text-xs font-semibold uppercase text-slate-400 tracking-wide">Action</span>
          <p className="text-slate-700 dark:text-slate-300 mt-0.5">{intervention.action}</p>
        </div>
        {intervention.resolvedNote && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2">
            <span className="text-xs font-semibold uppercase text-emerald-600 tracking-wide">Resolution Note</span>
            <p className="text-slate-700 dark:text-slate-300 mt-0.5">{intervention.resolvedNote}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-400">
        <span>By {intervention.createdBy.name}</span>
        <span>•</span>
        <span>{new Date(intervention.createdAt).toLocaleDateString()}</span>
        {intervention.followUpDate && (
          <>
            <span>•</span>
            <span className="text-amber-600 dark:text-amber-400">
              Follow-up: {new Date(intervention.followUpDate).toLocaleDateString()}
            </span>
          </>
        )}
        {intervention.resolvedAt && (
          <>
            <span>•</span>
            <span className="text-emerald-600 dark:text-emerald-400">
              Resolved: {new Date(intervention.resolvedAt).toLocaleDateString()}
            </span>
          </>
        )}
      </div>

      {canEdit && !editing && intervention.status !== 'resolved' && (
        <button
          onClick={() => setEditing(true)}
          className="mt-3 text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400"
        >
          Update Status
        </button>
      )}

      {editing && (
        <div className="mt-4 space-y-3 border-t border-slate-100 dark:border-white/5 pt-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">New Status</label>
            <div className="flex gap-2 flex-wrap">
              {(['open', 'in_progress', 'resolved', 'escalated'] as InterventionStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setNewStatus(s)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
                    newStatus === s ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300'
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          {newStatus === 'resolved' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Resolution Note (optional)</label>
              <textarea
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white resize-none"
                rows={2}
                placeholder="How was this resolved?"
                value={resolvedNote}
                onChange={(e) => setResolvedNote(e.target.value)}
              />
            </div>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2">
            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white text-xs py-1.5"
            >
              {mut.isPending ? <Spinner /> : 'Save'}
            </Button>
            <button onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InterventionTimeline() {
  const api = useTenantApi();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const studentIdParam = params.get('studentId') ?? '';
  const studentNameParam = params.get('studentName') ?? '';
  const reasonParam = params.get('reason') ?? '';
  const openParam = params.get('open') === '1';
  const [showCreate, setShowCreate] = useState(openParam || Boolean(studentIdParam && reasonParam));
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterStudent, setFilterStudent] = useState(studentNameParam);

  const { data, isLoading } = useQuery<{ interventions: Intervention[] }>({
    queryKey: ['interventions', studentIdParam],
    queryFn: async () =>
      (
        await api.get<{ interventions: Intervention[] }>(
          `/interventions${studentIdParam ? `?studentId=${encodeURIComponent(studentIdParam)}` : ''}`
        )
      ).data,
  });

  useEffect(() => {
    if (!studentIdParam || !data?.interventions?.length) return;
    const name = data.interventions.find((i) => i.student.id === studentIdParam)?.student.name;
    if (name) setFilterStudent(name);
  }, [studentIdParam, data]);

  useEffect(() => {
    if (openParam || (studentIdParam && reasonParam)) {
      setShowCreate(true);
    }
  }, [openParam, studentIdParam, reasonParam]);

  function closeCreate() {
    setShowCreate(false);
    if (openParam || reasonParam || studentNameParam) {
      const next = new URLSearchParams(params);
      next.delete('open');
      next.delete('reason');
      next.delete('studentName');
      // keep studentId so the timeline stays filtered to that student
      setParams(next, { replace: true });
    }
  }

  const interventions = data?.interventions ?? [];
  const filtered = interventions.filter((i) => {
    if (studentIdParam && i.student.id !== studentIdParam) return false;
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterStudent && !i.student.name.toLowerCase().includes(filterStudent.toLowerCase())) return false;
    return true;
  });

  const statusCounts = interventions.reduce(
    (acc, i) => {
      acc[i.status] = (acc[i.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 p-7 text-white shadow-lg">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10" />
        <div className="relative">
          <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
            <Icon name="users" width={14} height={14} />
            Intervention Timeline
          </div>
          <h1 className="mt-2 text-2xl font-black">Student Intervention Tracker</h1>
          <p className="mt-1 text-blue-100 text-sm max-w-lg">
            Log, track, and resolve student interventions. Build a complete timeline of follow-ups for every at-risk student.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['open', 'in_progress', 'resolved', 'escalated'] as InterventionStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
            className={`rounded-2xl border p-4 text-left transition ${
              filterStatus === s
                ? 'border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/20'
                : 'border-slate-200 bg-white dark:border-white/10 dark:bg-ink-850'
            }`}
          >
            <p className="text-2xl font-black text-slate-900 dark:text-white">{statusCounts[s] ?? 0}</p>
            <p className="text-xs text-slate-500 mt-0.5">{STATUS_LABELS[s]}</p>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="flex-1 min-w-[180px] rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-850 dark:text-white"
          placeholder="Filter by student name..."
          value={filterStudent}
          onChange={(e) => setFilterStudent(e.target.value)}
        />
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
        >
          + Log Intervention
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 py-12 text-center text-slate-400">
          {interventions.length === 0
            ? 'No interventions logged yet. Click "+ Log Intervention" to get started.'
            : 'No interventions match your filter.'}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((i) => (
            <InterventionCard
              key={i.id}
              intervention={i}
              onUpdate={() => qc.invalidateQueries({ queryKey: ['interventions'] })}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateInterventionModal
          initialStudentId={studentIdParam}
          initialStudentName={studentNameParam}
          initialReason={reasonParam}
          onClose={closeCreate}
          onCreated={() => qc.invalidateQueries({ queryKey: ['interventions'] })}
        />
      )}
    </div>
  );
}
