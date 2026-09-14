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
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
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
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-slate-200 text-slate-600 hover:border-brand-300 dark:border-white/10 dark:text-slate-300'
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
                  <span className="shrink-0 text-xs font-semibold text-brand-600">
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
            <span className="text-3xl font-black text-brand-700 dark:text-brand-400">
              {data.suggestedGrade}
            </span>
            {(maxMarks || data.maxMarks) && (
              <span className="text-slate-500">/ {maxMarks || data.maxMarks}</span>
            )}
            <span className="ml-2 rounded-full bg-brand-100 px-3 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
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
        className="bg-brand-600 text-white hover:bg-brand-700"
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
        <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5 dark:border-brand-900/30 dark:bg-brand-950/20">
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
        <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 dark:border-brand-900/30 dark:bg-brand-950/20">
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
        className="bg-brand-600 text-white hover:bg-brand-700"
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
                  className={`rounded-full px-2 py-0.5 font-medium ${s.attendanceRate < 70 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}
                >
                  Attendance: {s.attendanceRate}%
                </span>
              )}
              {s.quizAverage != null && (
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${s.quizAverage < 50 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}
                >
                  Quiz Avg: {s.quizAverage}%
                </span>
              )}
            </div>
            {s.aiSuggestion && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-950/20 dark:text-brand-300">
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
        className="bg-brand-600 text-white hover:bg-brand-700"
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-ink-900 p-7 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full border border-brand-400/30" />
        <div className="pointer-events-none absolute bottom-6 right-16 h-24 w-24 rounded-full border border-dashed border-brand-400/40" />
        <div className="pointer-events-none absolute right-28 top-10 opacity-30 text-brand-300">
          <Icon name="spark" width={72} height={72} />
        </div>
        <div className="relative max-w-xl">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-200 backdrop-blur">
            <Icon name="spark" width={14} height={14} />
            AI Teacher Copilot
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Your AI Teaching Assistant</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Generate quizzes, draft feedback, spot weak topics, and identify students who need support —
            with saved history per tool.
          </p>
          {!activeTool && classes.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTool('quiz-gen')}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <Icon name="spark" width={16} height={16} />
              Explore Copilot Tools
            </button>
          )}
        </div>
      </div>

      {classes.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400">
          No classes found. Create or be assigned to a class to use the AI Copilot.
        </div>
      )}

      {!activeTool && (
        <>
          <div>
            <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
              How can Copilot help you today?
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTool(t.id)}
                  className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md dark:border-white/10 dark:bg-ink-850"
                >
                  <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                    <Icon name={t.icon} width={22} height={22} />
                  </span>
                  <p className="font-bold text-slate-900 dark:text-white">{t.title}</p>
                  <p className="mt-1.5 flex-1 text-sm text-slate-500 dark:text-slate-400">{t.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 dark:text-brand-400">
                    Get started <Icon name="chevron" width={14} height={14} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:col-span-3 dark:border-white/10 dark:bg-ink-850">
              <h3 className="font-bold text-slate-900 dark:text-white">Recent activity</h3>
              <p className="mt-1 text-sm text-slate-500">
                Tool runs are saved per class when you generate quizzes, feedback, or insights.
              </p>
              <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {TOOLS.map((t) => (
                  <li key={t.id} className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30">
                      <Icon name={t.icon} width={16} height={16} />
                    </span>
                    <span>
                      Open <strong>{t.title}</strong> to start — history appears after your first run.
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-brand-100 bg-brand-50/80 p-5 shadow-sm lg:col-span-2 dark:border-brand-900/40 dark:bg-brand-950/25">
              <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-brand-600 text-white">
                <Icon name="spark" width={18} height={18} />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white">Tip of the day</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Run Weak Topic Analysis after a quiz, then open Intervention Radar for students who need
                follow-up.
              </p>
              <button
                type="button"
                onClick={() => setActiveTool('weak-topics')}
                className="mt-4 inline-flex rounded-full border border-brand-400 bg-white px-4 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 dark:bg-transparent dark:text-brand-300 dark:hover:bg-brand-900/30"
              >
                Learn more
              </button>
            </div>
          </div>
        </>
      )}

      {activeTool && classes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-ink-850">
          <div className="mb-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTool(null)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
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
