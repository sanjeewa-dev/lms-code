import { useRef, useState, useEffect, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { apiErrorMessage } from '../api/client';
import { Button, Spinner, Textarea } from '../components/ui';
import { Icon, type IconName } from '../components/icons';
import { AiQuizGenerator } from '../components/class/AiQuizGenerator';

/** Reads a File as plain text. Best-effort text extraction for PDF via binary scan. */
async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (file.type === 'application/pdf') {
      reader.onload = () => {
        const raw = reader.result as string;
        const matches = raw.match(/[\x20-\x7E\r\n\t]{4,}/g) ?? [];
        resolve(matches.join(' ').replace(/\s{3,}/g, '\n\n').trim());
      };
      reader.onerror = reject;
      reader.readAsBinaryString(file);
    } else {
      reader.onload = () => resolve((reader.result as string).trim());
      reader.onerror = reject;
      reader.readAsText(file);
    }
  });
}

function FileUploadButton({
  onExtracted,
  loading,
}: {
  onExtracted: (text: string) => void;
  loading?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);

  const handleFile = async (file: File) => {
    setExtracting(true);
    try {
      const text = await readFileAsText(file);
      if (text.length < 20) {
        alert('Could not extract enough text from the file. Try copy-pasting instead.');
      } else {
        onExtracted(text);
      }
    } catch {
      alert('Failed to read file.');
    } finally {
      setExtracting(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={ref}
        type="file"
        className="hidden"
        accept=".txt,.md,.csv,.pdf,.doc,.docx,.xls,.xlsx"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        type="button"
        disabled={loading || extracting}
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
      >
        {extracting ? (
          <Spinner className="h-3 w-3" />
        ) : (
          <svg width={13} height={13} viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
            <path
              fillRule="evenodd"
              d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {extracting ? 'Reading…' : 'Attach file'}
      </button>
    </>
  );
}

type Tool = 'quiz-gen' | 'feedback' | 'weak-topics' | 'intervention';

interface ClassItem {
  id: string;
  title: string;
}

interface HistoryItem {
  id: string;
  tool: string;
  title: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function ClassSelector({
  classes,
  selected,
  onChange,
}: {
  classes: ClassItem[];
  selected: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {classes.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
            selected === c.id
              ? 'border-violet-600 bg-violet-600 text-white'
              : 'border-slate-200 text-slate-600 hover:border-violet-300 dark:border-white/10 dark:text-slate-300'
          }`}
        >
          {c.title}
        </button>
      ))}
    </div>
  );
}

function useTeacherHistory(classId: string, tool: Tool) {
  const t = useTenantApi();
  return useQuery({
    queryKey: ['ai-teacher-history', t.slug, classId, tool],
    enabled: Boolean(classId),
    queryFn: async () =>
      (
        await t.get<{ history: HistoryItem[] }>(
          `/ai-teacher/history?classId=${encodeURIComponent(classId)}&tool=${encodeURIComponent(tool)}`
        )
      ).data.history,
  });
}

function HistorySection({
  items,
  loading,
  renderPayload,
}: {
  items: HistoryItem[] | undefined;
  loading: boolean;
  renderPayload: (item: HistoryItem) => ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="mt-6 border-t border-slate-100 pt-5 dark:border-white/10">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Saved history</h3>
          <p className="text-xs text-slate-400">Previous results for this tool in the selected class</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
          {items?.length ?? 0}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading history…</p>
      ) : !items?.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-400 dark:border-white/10 dark:bg-white/5">
          No saved responses yet. Use the tool above and results will appear here.
        </div>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => {
            const open = openId === item.id;
            return (
              <li
                key={item.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-ink-850"
              >
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-3.5 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-white/5"
                  onClick={() => setOpenId(open ? null : item.id)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{formatWhen(item.createdAt)}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-violet-600">
                    {open ? 'Hide' : 'View'}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/80 px-3.5 py-3 dark:border-white/5 dark:bg-white/[0.03]">
                    {renderPayload(item)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function QuizGenPanel({ classes }: { classes: ClassItem[] }) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const selectedClass = classes.find((c) => c.id === classId);

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Select Class</p>
        <ClassSelector classes={classes} selected={classId} onChange={setClassId} />
      </div>
      {classId ? (
        <AiQuizGenerator
          key={classId}
          classId={classId}
          classTitle={selectedClass?.title}
          showHistory
        />
      ) : (
        <p className="text-sm text-slate-500">Select a class to generate a quiz.</p>
      )}
    </div>
  );
}

function FeedbackPanel({ classes }: { classes: ClassItem[] }) {
  const api = useTenantApi();
  const qc = useQueryClient();
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [studentName, setStudentName] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [submissionText, setSubmissionText] = useState('');
  const [maxMarks, setMaxMarks] = useState('');
  const [result, setResult] = useState<null | {
    suggestedGrade: number | null;
    feedback: string;
    strengths: string[];
    improvements: string[];
  }>(null);
  const [err, setErr] = useState('');

  const historyQuery = useTeacherHistory(classId, 'feedback');

  const mut = useMutation({
    mutationFn: () =>
      api
        .post('/ai-teacher/draft-feedback', {
          classId,
          studentName,
          assignmentTitle,
          submissionText,
          maxMarks: maxMarks ? Number(maxMarks) : undefined,
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      setResult(data as NonNullable<typeof result>);
      setErr('');
      qc.invalidateQueries({ queryKey: ['ai-teacher-history', api.slug, classId, 'feedback'] });
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  function renderFeedback(data: {
    suggestedGrade?: number | null;
    feedback?: string;
    strengths?: string[];
    improvements?: string[];
    maxMarks?: number | null;
  }) {
    return (
      <div className="space-y-4">
        {data.suggestedGrade != null && (
          <div className="flex items-center gap-3">
            <span className="text-3xl font-black text-violet-700 dark:text-violet-400">
              {data.suggestedGrade}
            </span>
            {(maxMarks || data.maxMarks) && (
              <span className="text-slate-500">/ {maxMarks || data.maxMarks}</span>
            )}
            <span className="ml-2 rounded-full bg-violet-100 px-3 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              AI Suggested Grade
            </span>
          </div>
        )}
        {data.feedback && <p className="text-slate-700 dark:text-slate-300">{data.feedback}</p>}
        {!!data.strengths?.length && (
          <div>
            <p className="mb-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Strengths</p>
            <ul className="space-y-1">
              {data.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <Icon name="check" width={14} height={14} className="mt-0.5 shrink-0 text-emerald-500" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!!data.improvements?.length && (
          <div>
            <p className="mb-1 text-sm font-semibold text-amber-700 dark:text-amber-400">Areas to Improve</p>
            <ul className="space-y-1">
              {data.improvements.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span className="mt-0.5 shrink-0 text-amber-500">→</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Select Class</p>
        <ClassSelector classes={classes} selected={classId} onChange={setClassId} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Student Name *
          </label>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white"
            placeholder="Student name"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Max Marks</label>
          <input
            type="number"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white"
            placeholder="100"
            value={maxMarks}
            onChange={(e) => setMaxMarks(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Assignment Title *
        </label>
        <input
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white"
          placeholder="e.g. Chapter 3 Essay"
          value={assignmentTitle}
          onChange={(e) => setAssignmentTitle(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Submission Text *
        </label>
        <div className="relative">
          <Textarea
            placeholder="Paste the student's submission or upload a file..."
            value={submissionText}
            onChange={(e) => setSubmissionText(e.target.value)}
            rows={6}
            className="!pb-10"
          />
          <div className="absolute bottom-2.5 right-2.5">
            <FileUploadButton onExtracted={(text) => setSubmissionText(text)} loading={mut.isPending} />
          </div>
        </div>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button
        onClick={() => mut.mutate()}
        disabled={
          !studentName.trim() ||
          !assignmentTitle.trim() ||
          !submissionText.trim() ||
          !classId ||
          mut.isPending
        }
        className="bg-violet-600 text-white hover:bg-violet-700"
      >
        {mut.isPending ? (
          <>
            <Spinner className="mr-2" />
            Drafting...
          </>
        ) : (
          'Draft Feedback'
        )}
      </Button>

      {result && (
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5 dark:border-violet-900/30 dark:bg-violet-950/20">
          {renderFeedback(result)}
        </div>
      )}

      <HistorySection
        items={historyQuery.data}
        loading={historyQuery.isLoading}
        renderPayload={(item) => renderFeedback(item.payload as typeof result & object)}
      />
    </div>
  );
}

function WeakTopicsPanel({ classes }: { classes: ClassItem[] }) {
  const api = useTenantApi();
  const qc = useQueryClient();
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [data, setData] = useState<{
    summary: string;
    weakTopics: { topic: string; reason: string; suggestion: string }[];
    stats: { total: number; wrong: number; accuracy: number | null };
  } | null>(null);
  const [err, setErr] = useState('');

  const historyQuery = useTeacherHistory(classId, 'weak-topics');

  const mut = useMutation({
    mutationFn: () => api.get(`/ai-teacher/weak-topics/${classId}`).then((r) => r.data),
    onSuccess: (res) => {
      setData(res as NonNullable<typeof data>);
      setErr('');
      qc.invalidateQueries({ queryKey: ['ai-teacher-history', api.slug, classId, 'weak-topics'] });
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  function renderWeak(d: NonNullable<typeof data>) {
    return (
      <div className="space-y-4">
        {d.stats.accuracy != null && (
          <div className="flex flex-wrap gap-4">
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-center dark:bg-ink-800">
              <p className="text-2xl font-black text-slate-800 dark:text-white">{d.stats.accuracy}%</p>
              <p className="text-xs text-slate-500">Class Accuracy</p>
            </div>
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-center dark:bg-ink-800">
              <p className="text-2xl font-black text-slate-800 dark:text-white">{d.stats.total}</p>
              <p className="text-xs text-slate-500">Total Answers</p>
            </div>
            <div className="rounded-xl bg-red-50 px-4 py-3 text-center dark:bg-red-950/20">
              <p className="text-2xl font-black text-red-600 dark:text-red-400">{d.stats.wrong}</p>
              <p className="text-xs text-red-500">Wrong Answers</p>
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 dark:border-violet-900/30 dark:bg-violet-950/20">
          <p className="text-slate-700 dark:text-slate-300">{d.summary}</p>
        </div>
        {d.weakTopics.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-800 dark:text-white">Weak Topics Identified</h4>
            {d.weakTopics.map((t, i) => (
              <div
                key={i}
                className="rounded-xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-950/20"
              >
                <p className="font-semibold text-amber-800 dark:text-amber-300">{t.topic}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t.reason}</p>
                <p className="mt-1 text-sm text-teal-700 dark:text-teal-400">
                  <strong>Suggestion:</strong> {t.suggestion}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Select Class</p>
        <ClassSelector classes={classes} selected={classId} onChange={setClassId} />
      </div>
      <Button
        onClick={() => mut.mutate()}
        disabled={!classId || mut.isPending}
        className="bg-violet-600 text-white hover:bg-violet-700"
      >
        {mut.isPending ? (
          <>
            <Spinner className="mr-2" />
            Analysing...
          </>
        ) : (
          'Analyse Class Performance'
        )}
      </Button>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {data && renderWeak(data)}

      <HistorySection
        items={historyQuery.data}
        loading={historyQuery.isLoading}
        renderPayload={(item) => renderWeak(item.payload as NonNullable<typeof data>)}
      />
    </div>
  );
}

function InterventionSuggestionsPanel({ classes }: { classes: ClassItem[] }) {
  const api = useTenantApi();
  const qc = useQueryClient();
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [data, setData] = useState<{
    suggestions: {
      studentId: string;
      name: string;
      email: string;
      attendanceRate: number | null;
      quizAverage: number | null;
      flags: string[];
      aiSuggestion: string | null;
      priority: string;
    }[];
    message: string | null;
  } | null>(null);
  const [err, setErr] = useState('');

  const historyQuery = useTeacherHistory(classId, 'intervention');

  const mut = useMutation({
    mutationFn: () =>
      api.get(`/ai-teacher/intervention-suggestions/${classId}`).then((r) => r.data),
    onSuccess: (res) => {
      setData(res as NonNullable<typeof data>);
      setErr('');
      qc.invalidateQueries({ queryKey: ['ai-teacher-history', api.slug, classId, 'intervention'] });
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  const priorityColor: Record<string, string> = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    low: 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-slate-400',
  };

  function renderIntervention(d: NonNullable<typeof data>) {
    return (
      <div className="space-y-3">
        {d.message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400">
            {d.message}
          </div>
        )}
        {d.suggestions?.map((s) => (
          <div
            key={s.studentId}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-ink-800"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{s.name}</p>
                <p className="text-xs text-slate-500">{s.email}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityColor[s.priority] ?? priorityColor.medium}`}
              >
                {s.priority}
              </span>
            </div>
            <div className="mb-2 flex flex-wrap gap-3 text-xs">
              {s.attendanceRate != null && (
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${s.attendanceRate < 70 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}
                >
                  Attendance: {s.attendanceRate}%
                </span>
              )}
              {s.quizAverage != null && (
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${s.quizAverage < 50 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}
                >
                  Quiz Avg: {s.quizAverage}%
                </span>
              )}
            </div>
            {s.aiSuggestion && (
              <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-700 dark:bg-violet-950/20 dark:text-violet-300">
                <strong>Suggestion:</strong> {s.aiSuggestion}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Select Class</p>
        <ClassSelector classes={classes} selected={classId} onChange={setClassId} />
      </div>
      <Button
        onClick={() => mut.mutate()}
        disabled={!classId || mut.isPending}
        className="bg-violet-600 text-white hover:bg-violet-700"
      >
        {mut.isPending ? (
          <>
            <Spinner className="mr-2" />
            Analysing...
          </>
        ) : (
          'Get Intervention Suggestions'
        )}
      </Button>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {data && renderIntervention(data)}

      <HistorySection
        items={historyQuery.data}
        loading={historyQuery.isLoading}
        renderPayload={(item) => renderIntervention(item.payload as NonNullable<typeof data>)}
      />
    </div>
  );
}

const TOOLS: { id: Tool; title: string; description: string; icon: IconName }[] = [
  {
    id: 'quiz-gen',
    title: 'Quiz Generator',
    description: 'Generate MCQ quiz questions from a topic or lesson notes instantly.',
    icon: 'quiz',
  },
  {
    id: 'feedback',
    title: 'Feedback Drafter',
    description: 'Draft constructive rubric-based feedback for student submissions.',
    icon: 'note',
  },
  {
    id: 'weak-topics',
    title: 'Weak Topic Analysis',
    description: 'Analyse quiz answers class-wide to identify topics students struggle with.',
    icon: 'chart',
  },
  {
    id: 'intervention',
    title: 'Intervention Radar',
    description: 'Identify at-risk students and get AI-suggested intervention actions.',
    icon: 'spark',
  },
];

export default function AiTeacherCopilot() {
  const api = useTenantApi();
  const [params] = useSearchParams();
  const toolParam = params.get('tool') as Tool | null;
  const [activeTool, setActiveTool] = useState<Tool | null>(
    toolParam && ['quiz-gen', 'feedback', 'weak-topics', 'intervention'].includes(toolParam)
      ? toolParam
      : null
  );

  useEffect(() => {
    if (toolParam && ['quiz-gen', 'feedback', 'weak-topics', 'intervention'].includes(toolParam)) {
      setActiveTool(toolParam);
    }
  }, [toolParam]);

  const { data: classesData, isLoading: classesLoading } = useQuery<{ classes: ClassItem[] }>({
    queryKey: ['teacher-classes'],
    queryFn: () =>
      api.get<{ classes?: ClassItem[] } | ClassItem[]>('/classes').then((r) => {
        const payload = r.data;
        const list = Array.isArray(payload) ? payload : (payload.classes ?? []);
        const all: ClassItem[] = list.map((c: { id: string; title: string }) => ({
          id: c.id,
          title: c.title,
        }));
        return { classes: all };
      }),
  });

  const classes = classesData?.classes ?? [];

  if (classesLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-brand-600 p-7 text-white shadow-lg">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative">
          <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
            <Icon name="spark" width={14} height={14} />
            AI Teacher Copilot
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight">Your AI Teaching Assistant</h1>
          <p className="mt-1 max-w-lg text-sm text-white/80">
            Generate quizzes, draft feedback, spot weak topics, and identify students who need support —
            with saved history per tool.
          </p>
        </div>
      </div>

      {classes.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400">
          No classes found. Create or be assigned to a class to use the AI Copilot.
        </div>
      )}

      {!activeTool && (
        <div className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTool(t.id)}
              className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-brand-300 hover:shadow-md dark:border-white/10 dark:bg-ink-850 dark:hover:border-brand-700"
            >
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                  <Icon name={t.icon} width={22} height={22} />
                </span>
                <div>
                  <p className="font-bold text-slate-900 transition group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">
                    {t.title}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t.description}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
                Open tool <Icon name="chevron" width={14} height={14} />
              </div>
            </button>
          ))}
        </div>
      )}

      {activeTool && classes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-ink-850">
          <div className="mb-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTool(null)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <Icon name="chevron" width={14} height={14} className="rotate-180" />
              Back to AI Hub
            </button>
            <span className="text-slate-300 dark:text-white/20">|</span>
            <h2 className="font-bold text-slate-900 dark:text-white">
              {TOOLS.find((t) => t.id === activeTool)?.title}
            </h2>
          </div>

          {activeTool === 'quiz-gen' && <QuizGenPanel classes={classes} />}
          {activeTool === 'feedback' && <FeedbackPanel classes={classes} />}
          {activeTool === 'weak-topics' && <WeakTopicsPanel classes={classes} />}
          {activeTool === 'intervention' && <InterventionSuggestionsPanel classes={classes} />}
        </div>
      )}
    </div>
  );
}
