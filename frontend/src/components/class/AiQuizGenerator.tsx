import { useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantApi } from '../../hooks/useTenantApi';
import { apiErrorMessage } from '../../api/client';
import { Button, Textarea } from '../ui';
import { Icon } from '../icons';
import { showToast } from '../AppToast';

export interface AiQuizQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  marks: number;
  explanation?: string;
}

interface HistoryItem {
  id: string;
  title: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

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
        {extracting ? 'Reading…' : 'Attach file'}
      </button>
    </>
  );
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
          <p className="text-xs text-slate-400">Previous quiz generations for this class</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
          {items?.length ?? 0}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading history…</p>
      ) : !items?.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-400 dark:border-white/10 dark:bg-white/5">
          No saved responses yet. Generate a quiz and results will appear here.
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

function QuizResultView({
  title,
  questions,
  classId,
  classTitle,
  embedded,
  timeLimitMin,
  onTimeLimitMinChange,
  onPublished,
}: {
  title: string;
  questions: AiQuizQuestion[];
  classId: string;
  classTitle?: string;
  embedded?: boolean;
  timeLimitMin: string;
  onTimeLimitMinChange: (value: string) => void;
  onPublished?: (msg: string) => void;
}) {
  const { slug } = useParams<{ slug: string }>();
  const api = useTenantApi();
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const targetLabel = classTitle?.trim() || 'this class';

  const publishMut = useMutation({
    mutationFn: async (isPublished: boolean) => {
      const body = {
        title,
        description: 'Generated with AI Teacher Copilot',
        timeLimitSec: Math.max(0, Math.round(Number(timeLimitMin) * 60) || 0),
        isPublished,
        questions: questions.map((q) => ({
          text: q.text,
          options: q.options,
          correctIndex: q.correctIndex,
          marks: q.marks ?? 1,
        })),
      };
      return (await api.post(`/classes/${classId}/quizzes`, body)).data;
    },
    onSuccess: (_data, isPublished) => {
      setErr('');
      void qc.invalidateQueries({ queryKey: ['quizzes', api.slug, classId] });
      const msg = isPublished
        ? `Quiz published to “${targetLabel}”.`
        : `Quiz saved as a draft in “${targetLabel}”.`;
      showToast(msg);
      onPublished?.(msg);
    },
    onError: (e) => {
      setErr(apiErrorMessage(e));
      showToast(apiErrorMessage(e), 'error');
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
        {classTitle && !embedded && (
          <p className="text-xs font-medium text-brand-700 dark:text-brand-300">
            Target class: {classTitle}
          </p>
        )}
      </div>

      <div className="max-w-xs">
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Time limit (minutes, 0 = unlimited)
        </label>
        <input
          type="number"
          min={0}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white"
          value={timeLimitMin}
          onChange={(e) => onTimeLimitMinChange(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-ink-800"
          >
            <p className="mb-2 font-medium text-slate-800 dark:text-white">
              <span className="mr-1 text-brand-600">Q{i + 1}.</span>
              {q.text}
            </p>
            <ul className="mb-2 space-y-1">
              {q.options.map((opt, j) => (
                <li
                  key={j}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${
                    j === q.correctIndex
                      ? 'bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {j === q.correctIndex && <Icon name="check" width={14} height={14} />}
                  <span>
                    {String.fromCharCode(65 + j)}. {opt}
                  </span>
                </li>
              ))}
            </ul>
            {q.explanation && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-ink-900 dark:text-slate-400">
                <strong>Explanation:</strong> {q.explanation}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => publishMut.mutate(true)}
          disabled={publishMut.isPending || !classId}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {publishMut.isPending ? 'Publishing…' : 'Publish to class quizzes'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => publishMut.mutate(false)}
          disabled={publishMut.isPending || !classId}
        >
          Save as draft
        </Button>
        {!embedded && slug && classId && (
          <Link
            to={`/${slug}/classes/${classId}/quizzes`}
            className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Open {classTitle ? `“${classTitle}”` : 'class'} quizzes
          </Link>
        )}
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}

/**
 * AI MCQ quiz generator for a single class. Used from class Quizzes and AI Copilot.
 */
export function AiQuizGenerator({
  classId,
  classTitle,
  showHistory = true,
  embedded = false,
  onPublished,
  onClose,
  footer,
}: {
  classId: string;
  classTitle?: string;
  showHistory?: boolean;
  /** When true, hides “open class quizzes” link (already on that page). */
  embedded?: boolean;
  onPublished?: (msg: string) => void;
  onClose?: () => void;
  footer?: ReactNode;
}) {
  const { slug } = useParams<{ slug: string }>();
  const api = useTenantApi();
  const qc = useQueryClient();
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [timeLimitMin, setTimeLimitMin] = useState('5');
  const [result, setResult] = useState<null | { title: string; questions: AiQuizQuestion[] }>(null);
  const [err, setErr] = useState('');

  const historyQuery = useQuery({
    queryKey: ['ai-teacher-history', api.slug, classId, 'quiz-gen'],
    enabled: showHistory && Boolean(classId),
    queryFn: async () =>
      (
        await api.get<{ history: HistoryItem[] }>(
          `/ai-teacher/history?classId=${encodeURIComponent(classId)}&tool=quiz-gen`
        )
      ).data.history,
  });

  const mut = useMutation({
    mutationFn: () =>
      api
        .post('/ai-teacher/generate-quiz', {
          classId,
          topic,
          notes: notes || undefined,
          count,
          difficulty,
        })
        .then((r) => r.data as { title: string; questions: AiQuizQuestion[] }),
    onSuccess: (data) => {
      setResult(data);
      setErr('');
      void qc.invalidateQueries({ queryKey: ['ai-teacher-history', api.slug, classId, 'quiz-gen'] });
    },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  return (
    <div className="space-y-5">
      {(embedded || onClose) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
              <Icon name="spark" width={18} height={18} />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">AI quiz generator</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Generate MCQs for {classTitle ? `“${classTitle}”` : 'this class'}, then publish here.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {slug && (
              <Link
                to={`/${slug}/ai-copilot`}
                className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
              >
                Open full AI Copilot
              </Link>
            )}
            {onClose && (
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Topic *</label>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white"
            placeholder="e.g. Photosynthesis, Quadratic Equations"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Time limit (minutes, 0 = unlimited)
          </label>
          <input
            type="number"
            min={0}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white"
            value={timeLimitMin}
            onChange={(e) => setTimeLimitMin(e.target.value)}
          />
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Questions</label>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {[3, 5, 7, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Difficulty</label>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-800 dark:text-white"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Paste Lesson Notes (optional)
        </label>
        <div className="relative">
          <Textarea
            placeholder="Paste relevant notes or upload a file (PDF, Word, TXT) to generate targeted questions..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="!pb-10"
          />
          <div className="absolute bottom-2.5 right-2.5">
            <FileUploadButton onExtracted={(text) => setNotes(text)} loading={mut.isPending} />
          </div>
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button
        onClick={() => mut.mutate()}
        disabled={!topic.trim() || !classId || mut.isPending}
        className="bg-brand-600 text-white hover:bg-brand-700"
      >
        {mut.isPending ? 'Generating…' : 'Generate Quiz Questions'}
      </Button>

      {result && (
        <div className="space-y-4 rounded-2xl border border-brand-100 bg-brand-50 p-5 dark:border-brand-900/30 dark:bg-brand-950/20">
          <QuizResultView
            title={result.title}
            questions={result.questions}
            classId={classId}
            classTitle={classTitle}
            embedded={embedded}
            timeLimitMin={timeLimitMin}
            onTimeLimitMinChange={setTimeLimitMin}
            onPublished={onPublished}
          />
        </div>
      )}

      {showHistory && (
        <HistorySection
          items={historyQuery.data}
          loading={historyQuery.isLoading}
          renderPayload={(item) => {
            const payload = item.payload as { title?: string; questions?: AiQuizQuestion[] };
            if (!payload.questions?.length) {
              return <p className="text-sm text-slate-400">No questions saved.</p>;
            }
            return (
              <QuizResultView
                title={payload.title || item.title}
                questions={payload.questions}
                classId={classId}
                classTitle={classTitle}
                embedded={embedded}
                timeLimitMin={timeLimitMin}
                onTimeLimitMinChange={setTimeLimitMin}
                onPublished={onPublished}
              />
            );
          }}
        />
      )}

      {footer}
    </div>
  );
}
