import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '../../api/client';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Badge, Button, Card, Spinner } from '../ui';
import { Icon } from '../icons';
import type { Material, SubmissionItem } from '../../api/types';

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5';

type AssignmentStatus = 'graded' | 'submitted' | 'pending' | 'overdue';
type TeacherRowStatus = 'graded' | 'submitted' | 'missing' | 'overdue';
type TeacherFilter = 'all' | 'submitted' | 'missing' | 'needs_grade';

interface RosterStudent {
  id: string;
  name: string;
  email: string;
}

interface StudentAssignmentRow {
  student: RosterStudent;
  submission: SubmissionItem | null;
  status: TeacherRowStatus;
}

const STATUS_META: Record<
  AssignmentStatus,
  { label: string; tone: 'green' | 'blue' | 'amber' | 'red'; border: string; icon: 'check' | 'note' | 'ban' }
> = {
  graded: { label: 'Graded', tone: 'green', border: 'border-l-emerald-500', icon: 'check' },
  submitted: { label: 'Submitted', tone: 'blue', border: 'border-l-brand-500', icon: 'check' },
  pending: { label: 'Not submitted', tone: 'amber', border: 'border-l-amber-400', icon: 'note' },
  overdue: { label: 'Overdue', tone: 'red', border: 'border-l-red-500', icon: 'ban' },
};

function assignmentStatus(assignment: Material, submission: SubmissionItem | null): AssignmentStatus {
  if (submission?.grade != null) return 'graded';
  if (submission) return 'submitted';
  if (assignment.dueDate && new Date(assignment.dueDate) < new Date()) return 'overdue';
  return 'pending';
}

function isOverdue(assignment: Material) {
  return Boolean(assignment.dueDate && new Date(assignment.dueDate) < new Date());
}

function formatDue(date?: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function SubmissionsTab({
  classId,
  isStudent,
  canManage = false,
}: {
  classId: string;
  isStudent: boolean;
  canManage?: boolean;
}) {
  return isStudent ? (
    <StudentSubmissions classId={classId} />
  ) : (
    <TeacherSubmissions classId={classId} canManage={canManage} />
  );
}

// ──────────────────────── Student side ────────────────────────

function StudentSubmissions({ classId }: { classId: string }) {
  const t = useTenantApi();
  const queryClient = useQueryClient();

  const assignmentsQuery = useQuery({
    queryKey: ['materials', t.slug, classId],
    queryFn: async () =>
      (await t.get<{ materials: Material[] }>(`/classes/${classId}/materials`)).data.materials.filter(
        (m) => m.kind === 'assessment'
      ),
  });

  const submissionsQuery = useQuery({
    queryKey: ['submissions', 'mine', t.slug, classId],
    queryFn: async () =>
      (await t.get<{ submissions: SubmissionItem[] }>(`/classes/${classId}/submissions/mine`)).data.submissions,
  });

  const assignments = assignmentsQuery.data ?? [];
  const submissions = submissionsQuery.data ?? [];

  function submissionFor(assignmentId: string) {
    return (
      submissions.find(
        (s) => s.assessment?.id === assignmentId || s.assessmentId === assignmentId
      ) ?? null
    );
  }

  const grouped = useMemo(() => {
    const buckets: Record<AssignmentStatus, Material[]> = {
      graded: [],
      submitted: [],
      pending: [],
      overdue: [],
    };
    for (const a of assignments) {
      buckets[assignmentStatus(a, submissionFor(a.id))].push(a);
    }
    return buckets;
  }, [assignments, submissions]);

  const summary = useMemo(
    () => ({
      total: assignments.length,
      done: grouped.graded.length + grouped.submitted.length,
      pending: grouped.pending.length,
      overdue: grouped.overdue.length,
    }),
    [assignments.length, grouped]
  );

  const sections: { key: AssignmentStatus; title: string; hint: string }[] = [
    { key: 'overdue', title: 'Overdue — action needed', hint: 'Past due date and not yet submitted' },
    { key: 'pending', title: 'Awaiting submission', hint: 'Still open — submit before the due date' },
    { key: 'submitted', title: 'Submitted — awaiting grade', hint: 'Your work has been received' },
    { key: 'graded', title: 'Graded', hint: 'Feedback and marks are available' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">My assignments</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track what you have submitted and what still needs your attention.
          </p>
        </div>
      </div>

      {assignments.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="Total" value={summary.total} accent="border-l-brand-500" tone="text-brand-600" />
          <SummaryTile label="Submitted" value={summary.done} accent="border-l-emerald-500" tone="text-emerald-600" />
          <SummaryTile label="Pending" value={summary.pending} accent="border-l-amber-500" tone="text-amber-600" />
          <SummaryTile label="Overdue" value={summary.overdue} accent="border-l-red-500" tone="text-red-600" />
        </div>
      )}

      {assignmentsQuery.isLoading || submissionsQuery.isLoading ? (
        <Spinner label="Loading assignments..." />
      ) : assignments.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500 dark:text-slate-400">No assignments posted yet.</p>
        </Card>
      ) : (
        sections.map(({ key, title, hint }) =>
          grouped[key].length === 0 ? null : (
            <section key={key} className="space-y-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">{title}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
              </div>
              <div className="space-y-3">
                {grouped[key].map((a) => (
                  <StudentAssignmentCard
                    key={a.id}
                    assignment={a}
                    submission={submissionFor(a.id)}
                    status={key}
                    classId={classId}
                    onRefresh={() => {
                      queryClient.invalidateQueries({ queryKey: ['submissions', 'mine', t.slug, classId] });
                    }}
                  />
                ))}
              </div>
            </section>
          )
        )
      )}

      {submissions.filter((s) => !s.assessment).length > 0 && (
        <Card>
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-200">Other submissions</h3>
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {submissions
              .filter((s) => !s.assessment)
              .map((s) => (
                <SubmissionRow key={s.id} submission={s} />
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

const SUBMISSION_ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.zip,.txt';

const SUBMISSION_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'text/plain',
]);

function validateSubmissionFile(file: File | undefined): string | null {
  if (!file) {
    return 'Please choose a PDF or document file before submitting.';
  }
  if (!SUBMISSION_MIME.has(file.type)) {
    return 'Unsupported file type. Upload a PDF, image, Word document, ZIP, or text file.';
  }
  return null;
}

function StudentAssignmentCard({
  assignment,
  submission,
  status,
  classId,
  onRefresh,
}: {
  assignment: Material;
  submission: SubmissionItem | null;
  status: AssignmentStatus;
  classId: string;
  onRefresh: () => void;
}) {
  const t = useTenantApi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const meta = STATUS_META[status];
  const overdue = isOverdue(assignment);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append('file', file);
      body.append('assessmentId', assignment.id);
      return (await t.post(`/classes/${classId}/submissions`, body)).data;
    },
    onSuccess: () => {
      setError('');
      setSuccess('Assignment submitted successfully.');
      setSelectedFile('');
      if (fileRef.current) fileRef.current.value = '';
      onRefresh();
    },
    onError: (err) => {
      setSuccess('');
      setError(apiErrorMessage(err));
    },
  });

  function handleSubmit() {
    setSuccess('');
    const file = fileRef.current?.files?.[0];
    const validationError = validateSubmissionFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    uploadMutation.mutate(file!);
  }

  const deleteMutation = useMutation({
    mutationFn: async () => t.del(`/submissions/${submission!.id}`),
    onSuccess: () => onRefresh(),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const canSubmit = !submission;
  const dueLabel = formatDue(assignment.dueDate);

  return (
    <Card className={`border-l-4 ${meta.border} ${status === 'graded' ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : ''} ${status === 'overdue' ? 'bg-red-50/40 dark:bg-red-950/10' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                status === 'graded' || status === 'submitted'
                  ? 'bg-emerald-100 text-emerald-700'
                  : status === 'overdue'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
              }`}
            >
              <Icon name={meta.icon} width={16} height={16} />
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">{assignment.title}</span>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {assignment.maxMarks != null && <Badge tone="blue">{assignment.maxMarks} marks</Badge>}
          </div>
          {assignment.description && (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{assignment.description}</p>
          )}
          {dueLabel && (
            <p className={`mt-1 text-xs ${overdue && canSubmit ? 'font-medium text-red-500' : 'text-slate-400'}`}>
              Due: {dueLabel}
            </p>
          )}
          {submission?.grade != null && (
            <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Your grade: {submission.grade}
              {assignment.maxMarks != null ? ` / ${assignment.maxMarks}` : ''}
            </p>
          )}
        </div>
      </div>

      {submission && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Your submission</p>
              <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                {submission.file?.originalName}
              </p>
              <p className="text-xs text-slate-400">
                Submitted {new Date(submission.submittedAt).toLocaleString()}
              </p>
              {submission.feedback && (
                <p className="mt-2 rounded-md bg-brand-50 px-3 py-2 text-sm text-slate-700 dark:bg-brand-900/20 dark:text-slate-300">
                  <span className="font-medium">Feedback:</span> {submission.feedback}
                </p>
              )}
            </div>
            {submission.grade == null && (
              <button
                onClick={() => {
                  if (window.confirm('Withdraw this submission?')) deleteMutation.mutate();
                }}
                className="text-xs font-medium text-red-500 hover:underline"
                disabled={deleteMutation.isPending}
              >
                Withdraw
              </button>
            )}
          </div>
        </div>
      )}

      {canSubmit && (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
          <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            {overdue ? 'Submit late' : 'Upload your answer'}
          </p>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Accepted formats: PDF, images, Word, ZIP, or plain text.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={SUBMISSION_ACCEPT}
              className={`text-sm text-slate-600 ${error && !selectedFile ? 'rounded border border-red-300 bg-red-50/50 px-2 py-1' : ''}`}
              onChange={(e) => {
                setSuccess('');
                setError('');
                const file = e.target.files?.[0];
                setSelectedFile(file?.name ?? '');
                if (file) {
                  const validationError = validateSubmissionFile(file);
                  if (validationError) setError(validationError);
                }
              }}
            />
            <Button
              variant={overdue ? 'secondary' : 'primary'}
              onClick={handleSubmit}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? 'Uploading…' : overdue ? 'Submit late' : 'Submit assignment'}
            </Button>
          </div>
          {selectedFile && !success && !error && (
            <p className="mt-2 text-xs text-slate-500">Selected: {selectedFile}</p>
          )}
          {success && (
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
          )}
          {error && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function SubmissionRow({ submission }: { submission: SubmissionItem }) {
  return (
    <li className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{submission.file?.originalName}</p>
        <p className="text-xs text-slate-400">{new Date(submission.submittedAt).toLocaleString()}</p>
        {submission.feedback && <p className="text-xs text-slate-500">Feedback: {submission.feedback}</p>}
      </div>
      {submission.grade != null ? (
        <Badge tone="green">Grade: {submission.grade}</Badge>
      ) : (
        <Badge tone="amber">Not graded</Badge>
      )}
    </li>
  );
}

// ──────────────────────── Teacher side ────────────────────────

function TeacherSubmissions({ classId, canManage }: { classId: string; canManage: boolean }) {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);
  const [rowFilter, setRowFilter] = useState<TeacherFilter>('needs_grade');
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeSuccessId, setGradeSuccessId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [form, setForm] = useState({ title: '', description: '', dueDate: '', maxMarks: '' });
  const [formError, setFormError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const assignmentsQuery = useQuery({
    queryKey: ['materials', t.slug, classId],
    queryFn: async () =>
      (await t.get<{ materials: Material[] }>(`/classes/${classId}/materials`)).data.materials.filter(
        (m) => m.kind === 'assessment'
      ),
  });

  const submissionsQuery = useQuery({
    queryKey: ['submissions', t.slug, classId],
    queryFn: async () =>
      (await t.get<{ submissions: SubmissionItem[] }>(`/classes/${classId}/submissions`)).data.submissions,
  });

  const rosterQuery = useQuery({
    queryKey: ['roster', t.slug, classId],
    queryFn: async () =>
      (
        await t.get<{
          enrollments: { status: string; student: RosterStudent }[];
        }>(`/classes/${classId}/students`)
      ).data.enrollments.filter((e) => e.status === 'active'),
  });

  const gradeMutation = useMutation({
    mutationFn: async ({ id, grade, feedback }: { id: string; grade: string; feedback: string }) =>
      (await t.post(`/submissions/${id}/grade`, { grade: Number(grade), feedback })).data,
    onMutate: ({ id }) => {
      setGradingId(id);
      setGradeSuccessId(null);
    },
    onSuccess: (_, { id }) => {
      setGradeSuccessId(id);
      window.setTimeout(() => setGradeSuccessId((current) => (current === id ? null : current)), 3000);
      queryClient.invalidateQueries({ queryKey: ['submissions', t.slug, classId] });
    },
    onSettled: () => setGradingId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => t.del(`/submissions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['submissions', t.slug, classId] }),
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      body.append('title', form.title.trim());
      body.append('description', form.description.trim());
      body.append('kind', 'assessment');
      if (form.dueDate) body.append('dueDate', new Date(form.dueDate).toISOString());
      if (form.maxMarks) body.append('maxMarks', form.maxMarks);
      const file = fileRef.current?.files?.[0];
      if (file) body.append('file', file);
      return (await t.post(`/classes/${classId}/materials`, body)).data;
    },
    onSuccess: () => {
      setFormError('');
      setForm({ title: '', description: '', dueDate: '', maxMarks: '' });
      if (fileRef.current) fileRef.current.value = '';
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['materials', t.slug, classId] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  const editAssignmentMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
      };
      if (form.dueDate) body.dueDate = new Date(form.dueDate).toISOString();
      if (form.maxMarks) body.maxMarks = Number(form.maxMarks);
      return (await t.patch(`/classes/${classId}/materials/${editTarget.id}`, body)).data;
    },
    onSuccess: () => {
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ['materials', t.slug, classId] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => t.del(`/classes/${classId}/materials/${id}`),
    onSuccess: () => {
      setSelectedAssignment(null);
      queryClient.invalidateQueries({ queryKey: ['materials', t.slug, classId] });
      queryClient.invalidateQueries({ queryKey: ['submissions', t.slug, classId] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function startEdit(a: Material) {
    setEditTarget(a);
    setForm({
      title: a.title,
      description: a.description,
      dueDate: a.dueDate ? a.dueDate.slice(0, 10) : '',
      maxMarks: a.maxMarks != null ? String(a.maxMarks) : '',
    });
    setFormError('');
    setShowForm(false);
  }

  async function download(id: string) {
    try {
      const blob = await t.fetchBlob(`/submissions/${id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Unable to download this submission');
    }
  }

  const assignments = assignmentsQuery.data ?? [];
  const allSubmissions = submissionsQuery.data ?? [];
  const enrolledStudents = useMemo(
    () => (rosterQuery.data ?? []).map((e) => e.student),
    [rosterQuery.data]
  );

  const assignmentStats = useMemo(() => {
    return assignments.map((a) => {
      const subs = allSubmissions.filter((s) => s.assessment?.id === a.id);
      const graded = subs.filter((s) => s.grade != null).length;
      const submittedIds = new Set(subs.map((s) => s.student?.id).filter(Boolean));
      const missing = enrolledStudents.filter((s) => !submittedIds.has(s.id)).length;
      return {
        assignment: a,
        submitted: subs.length,
        missing,
        graded,
        total: enrolledStudents.length,
      };
    });
  }, [assignments, allSubmissions, enrolledStudents]);

  const activeAssignment =
    selectedAssignment != null ? assignments.find((a) => a.id === selectedAssignment) ?? null : null;

  const studentRows = useMemo((): StudentAssignmentRow[] => {
    if (!activeAssignment) return [];
    const subs = allSubmissions.filter((s) => s.assessment?.id === activeAssignment.id);
    return enrolledStudents.map((student) => {
      const submission = subs.find((s) => s.student?.id === student.id) ?? null;
      let status: TeacherRowStatus = 'missing';
      if (submission?.grade != null) status = 'graded';
      else if (submission) status = 'submitted';
      else if (isOverdue(activeAssignment)) status = 'overdue';
      return { student, submission, status };
    });
  }, [activeAssignment, allSubmissions, enrolledStudents]);

  const filteredRows = useMemo(() => {
    let rows = studentRows;
    if (rowFilter === 'submitted') rows = studentRows.filter((r) => r.submission);
    else if (rowFilter === 'missing') rows = studentRows.filter((r) => !r.submission);
    else if (rowFilter === 'needs_grade') rows = studentRows.filter((r) => r.submission && r.submission.grade == null);

    const order: Record<TeacherRowStatus, number> = {
      submitted: 0,
      overdue: 1,
      missing: 2,
      graded: 3,
    };
    return [...rows].sort((a, b) => order[a.status] - order[b.status] || a.student.name.localeCompare(b.student.name));
  }, [studentRows, rowFilter]);

  const submissionRows = filteredRows.filter((r) => r.submission);
  const missingRows = filteredRows.filter((r) => !r.submission);
  const needsGradeCount = studentRows.filter((r) => r.submission && r.submission.grade == null).length;

  const activeStats = activeAssignment
    ? assignmentStats.find((s) => s.assignment.id === activeAssignment.id)
    : null;

  const loading = assignmentsQuery.isLoading || submissionsQuery.isLoading || rosterQuery.isLoading;

  useEffect(() => {
    if (assignments.length > 0 && selectedAssignment == null) {
      setSelectedAssignment(assignments[0].id);
    }
  }, [assignments, selectedAssignment]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Assignments</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            See who has submitted and who still needs to hand in work.
          </p>
        </div>
        {canManage && !showForm && !editTarget && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <span className="text-lg leading-none">+</span> New assignment
          </button>
        )}
      </div>

      {canManage && showForm && (
        <Card>
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">New assignment</h3>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Title *</span>
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Description</span>
              <textarea className={inputCls} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Due date</span>
                <input type="date" className={inputCls} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Max marks</span>
                <input type="number" min={0} className={inputCls} value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} placeholder="e.g. 100" />
              </label>
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">Reference file (optional)</span>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="text-sm" />
            </div>
          </div>
          {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => createAssignmentMutation.mutate()} disabled={createAssignmentMutation.isPending || !form.title.trim()}>
              {createAssignmentMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={() => { setShowForm(false); setFormError(''); }}>Cancel</Button>
          </div>
        </Card>
      )}

      {canManage && editTarget && (
        <Card>
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Edit: {editTarget.title}</h3>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Title *</span>
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Description</span>
              <textarea className={inputCls} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Due date</span>
                <input type="date" className={inputCls} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Max marks</span>
                <input type="number" min={0} className={inputCls} value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} />
              </label>
            </div>
          </div>
          {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => editAssignmentMutation.mutate()} disabled={editAssignmentMutation.isPending || !form.title.trim()}>
              {editAssignmentMutation.isPending ? 'Saving...' : 'Update'}
            </Button>
            <Button variant="secondary" onClick={() => { setEditTarget(null); setFormError(''); }}>Cancel</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <Spinner label="Loading assignments..." />
      ) : assignments.length === 0 && !showForm && !editTarget ? (
        <Card>
          <p className="text-sm text-slate-500">No assignments yet.{canManage ? ' Create one to get started.' : ''}</p>
        </Card>
      ) : (
        <>
          {assignmentStats.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {assignmentStats.map(({ assignment: a, submitted, missing, graded, total }) => {
                const overdue = isOverdue(a);
                const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
                const selected = selectedAssignment === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setSelectedAssignment(a.id);
                      setRowFilter('needs_grade');
                    }}
                    className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                      selected
                        ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/20'
                        : 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-800 line-clamp-2 dark:text-slate-200">{a.title}</p>
                      {overdue && missing > 0 && <Badge tone="red">Overdue</Badge>}
                    </div>
                    {a.dueDate && (
                      <p className={`mt-1 text-xs ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
                        Due {formatDue(a.dueDate)}
                      </p>
                    )}
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs text-slate-500">
                        <span>{submitted} of {total} submitted</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-brand-600 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700">
                        {submitted} submitted
                      </span>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700">
                        {missing} missing
                      </span>
                      <span className="rounded-full bg-brand-100 px-2.5 py-1 font-medium text-brand-700">
                        {graded} graded
                      </span>
                    </div>
                    {canManage && (
                      <div
                        className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2 dark:border-white/5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.fileId && (
                          <Link to={`/${t.slug}/materials/${a.id}`}>
                            <Button variant="secondary">Reference</Button>
                          </Link>
                        )}
                        <button onClick={() => startEdit(a)} className="icon-btn text-brand-600" title="Edit">
                          <Icon name="note" width={16} height={16} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Delete this assignment?')) deleteAssignmentMutation.mutate(a.id);
                          }}
                          className="icon-btn text-red-500 hover:text-red-700"
                          title="Delete"
                        >
                          <Icon name="trash" width={16} height={16} />
                        </button>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {activeAssignment && activeStats && (
            <Card className="p-0 overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-white/5 dark:bg-white/5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{activeAssignment.title}</h3>
                    {activeAssignment.description && (
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{activeAssignment.description}</p>
                    )}
                    {activeAssignment.dueDate && (
                      <p className="mt-1 text-xs text-slate-400">Due {formatDue(activeAssignment.dueDate)}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SummaryPill label="Submitted" value={activeStats.submitted} tone="emerald" />
                    <SummaryPill label="Missing" value={activeStats.missing} tone="amber" />
                    <SummaryPill label="Graded" value={activeStats.graded} tone="brand" />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(
                    [
                      { id: 'needs_grade' as const, label: `Needs grading${needsGradeCount ? ` (${needsGradeCount})` : ''}` },
                      { id: 'all' as const, label: 'All students' },
                      { id: 'submitted' as const, label: 'Submitted' },
                      { id: 'missing' as const, label: 'Missing' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setRowFilter(f.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        rowFilter === f.id
                          ? 'bg-brand-600 text-white'
                          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-white/10'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredRows.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">
                  {rowFilter === 'needs_grade'
                    ? 'All submitted work has been graded.'
                    : 'No students match this filter.'}
                </p>
              ) : (
                <div className="space-y-6 p-5">
                  {submissionRows.length > 0 && (
                    <section className="space-y-3">
                      {rowFilter !== 'missing' && (
                        <div>
                          <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                            {rowFilter === 'needs_grade' ? 'Awaiting your review' : 'Submissions'}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Download each file, enter marks and feedback, then save the grade.
                          </p>
                        </div>
                      )}
                      <div className="grid gap-4 lg:grid-cols-2">
                        {submissionRows.map((row) => (
                          <GradingCard
                            key={`${row.student.id}-${row.submission!.grade ?? 'new'}-${row.submission!.submittedAt}`}
                            row={row}
                            maxMarks={activeAssignment.maxMarks}
                            saving={gradingId === row.submission!.id}
                            saved={gradeSuccessId === row.submission!.id}
                            onGrade={(grade, feedback) =>
                              gradeMutation.mutate({ id: row.submission!.id, grade, feedback })
                            }
                            onDownload={() => download(row.submission!.id)}
                            onDelete={() => {
                              if (window.confirm('Delete this submission?')) deleteMutation.mutate(row.submission!.id);
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {missingRows.length > 0 && rowFilter !== 'submitted' && rowFilter !== 'needs_grade' && (
                    <section className="space-y-3">
                      <div>
                        <h4 className="font-semibold text-slate-800 dark:text-slate-200">Not submitted yet</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          These students have not uploaded an answer for this assignment.
                        </p>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
                        {missingRows.map((row, index) => (
                          <MissingStudentRow
                            key={row.student.id}
                            row={row}
                            last={index === missingRows.length - 1}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </Card>
          )}

          {!activeAssignment && assignments.length > 0 && (
            <Card>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Select an assignment above to review submissions and see which students have not submitted yet.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function GradingCard({
  row,
  maxMarks,
  saving,
  saved,
  onGrade,
  onDownload,
  onDelete,
}: {
  row: StudentAssignmentRow;
  maxMarks?: number | null;
  saving: boolean;
  saved: boolean;
  onGrade: (grade: string, feedback: string) => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const submission = row.submission!;
  const [grade, setGrade] = useState(submission.grade?.toString() ?? '');
  const [feedback, setFeedback] = useState(submission.feedback ?? '');
  const [error, setError] = useState('');
  const isGraded = submission.grade != null;
  const initials = row.student.name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  function handleSave() {
    setError('');
    if (grade.trim() === '') {
      setError('Enter a mark before saving.');
      return;
    }
    const value = Number(grade);
    if (Number.isNaN(value) || value < 0) {
      setError('Enter a valid mark.');
      return;
    }
    if (maxMarks != null && value > maxMarks) {
      setError(`Mark cannot exceed ${maxMarks}.`);
      return;
    }
    onGrade(grade, feedback);
  }

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm transition dark:bg-slate-800 ${
        isGraded
          ? 'border-emerald-200 dark:border-emerald-900/40'
          : 'border-slate-200 dark:border-white/10'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white">{row.student.name}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.student.email}</p>
            </div>
            <Badge tone={isGraded ? 'green' : 'blue'}>{isGraded ? 'Graded' : 'Needs grading'}</Badge>
          </div>

          {isGraded && (
            <div className="mt-3 inline-flex items-baseline gap-1 rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
              <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">{submission.grade}</span>
              {maxMarks != null && (
                <span className="text-sm font-medium text-emerald-600/80">/ {maxMarks}</span>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-brand-600 shadow-sm dark:bg-slate-900">
              <Icon name="note" width={16} height={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                {submission.file?.originalName}
              </p>
              <p className="text-xs text-slate-400">
                Submitted {new Date(submission.submittedAt).toLocaleString()}
              </p>
            </div>
            <Button variant="secondary" onClick={onDownload}>
              Download
            </Button>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Marks{maxMarks != null ? ` (out of ${maxMarks})` : ''}
              </span>
              <input
                type="number"
                min={0}
                max={maxMarks ?? undefined}
                className={inputCls}
                value={grade}
                onChange={(e) => {
                  setError('');
                  setGrade(e.target.value);
                }}
                placeholder={maxMarks != null ? `0 – ${maxMarks}` : 'Enter marks'}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Feedback
              </span>
              <textarea
                className={inputCls}
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Optional comments for the student..."
              />
            </label>
          </div>

          {error && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Grade saved successfully.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isGraded ? 'Update grade' : 'Save grade'}
            </Button>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-red-500 transition hover:bg-red-50"
            >
              <Icon name="trash" width={14} height={14} />
              Delete
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function MissingStudentRow({ row, last }: { row: StudentAssignmentRow; last: boolean }) {
  const initials = row.student.name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div
      className={`flex items-center justify-between gap-3 bg-amber-50/50 px-4 py-3 dark:bg-amber-950/10 ${
        !last ? 'border-b border-slate-100 dark:border-white/5' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
          {initials}
        </span>
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-200">{row.student.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{row.student.email}</p>
        </div>
      </div>
      <Badge tone={row.status === 'overdue' ? 'red' : 'amber'}>
        {row.status === 'overdue' ? 'Overdue' : 'Not submitted'}
      </Badge>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: number;
  accent: string;
  tone: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-ink-850 ${accent}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p>
    </div>
  );
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'brand' }) {
  const styles = {
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    brand: 'bg-brand-100 text-brand-700',
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles[tone]}`}>
      {value} {label.toLowerCase()}
    </span>
  );
}
