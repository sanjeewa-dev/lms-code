import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { Button, Spinner, Textarea } from '../components/ui';
import { Icon } from '../components/icons';

type ToolId = 'tutor' | 'summarizer' | 'mcq' | 'flashcards' | 'study-plan';

interface AiQuota {
  forMonth: string;
  used: number;
  limit: number;
  remaining: number;
}

interface AiClass {
  classId: string;
  title: string;
}

interface HistoryItem {
  id: string;
  tool: string;
  title: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const TOOLS: {
  id: ToolId;
  title: string;
  description: string;
  cta: string;
}[] = [
  {
    id: 'tutor',
    title: 'AI Tutor Chat',
    description: 'Ask real-time questions about concepts from your selected class.',
    cta: 'Open Tutor',
  },
  {
    id: 'summarizer',
    title: 'Smart Summarizer',
    description: 'Paste lesson notes and get a clear key-point summary.',
    cta: 'Open Summarizer',
  },
  {
    id: 'mcq',
    title: 'MCQ Generator',
    description: 'Generate practice questions to test what you know.',
    cta: 'Open Generator',
  },
  {
    id: 'flashcards',
    title: 'Flashcards',
    description: 'Turn a topic or notes into quick revision cards.',
    cta: 'Open Flashcards',
  },
  {
    id: 'study-plan',
    title: 'Study Plan',
    description: 'Enter subject, unit, and topic to build a focused 7-day plan.',
    cta: 'Open Study Plan',
  },
];

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

type TutorSection = {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
};

/** Renders tutor replies with clear sections instead of a wall of text. */
function TutorRichText({
  text,
  sections,
  light,
}: {
  text?: string;
  sections?: TutorSection[] | null;
  light?: boolean;
}) {
  const blocks =
    sections && sections.length > 0
      ? sections
      : text
        ? text
            .split(/\n{2,}/)
            .map((chunk) => chunk.trim())
            .filter(Boolean)
            .map((chunk) => {
              const lines = chunk.split(/\n/).map((l) => l.trim()).filter(Boolean);
              const bullets = lines.filter((l) => /^[-•*]\s+|^\d+[\).]\s+/.test(l));
              const paragraphs = lines.filter((l) => !/^[-•*]\s+|^\d+[\).]\s+/.test(l));
              return {
                paragraphs: paragraphs.length ? paragraphs : [chunk],
                bullets: bullets.map((b) => b.replace(/^[-•*]\s+|^\d+[\).]\s+/, '')),
              } as TutorSection;
            })
        : [];

  if (!blocks.length && text) {
    return <p className="whitespace-pre-wrap leading-relaxed">{text}</p>;
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((s, i) => (
        <div key={i} className="space-y-1.5">
          {s.heading && (
            <p
              className={`text-xs font-bold uppercase tracking-wide ${
                light ? 'text-sky-100' : 'text-sky-700 dark:text-sky-300'
              }`}
            >
              {s.heading}
            </p>
          )}
          {(s.paragraphs ?? []).map((p, j) => (
            <p key={j} className="whitespace-pre-wrap">
              {p}
            </p>
          ))}
          {!!s.bullets?.length && (
            <ul className="list-disc space-y-1 pl-5">
              {s.bullets.map((b, j) => (
                <li key={j}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function TokenPill({ quota }: { quota: AiQuota | undefined }) {
  if (!quota) {
    return (
      <div className="h-9 w-28 animate-pulse rounded-full bg-amber-100/80 dark:bg-amber-900/30" />
    );
  }
  const low = quota.remaining <= 3;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold shadow-sm ${
        low
          ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100'
          : 'border-amber-200/80 bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-950 dark:border-amber-800 dark:from-amber-950/50 dark:to-yellow-950/30 dark:text-amber-100'
      }`}
    >
      <span className="text-base leading-none" aria-hidden>
        ⚡
      </span>
      <span>
        Tokens: {quota.remaining} / {quota.limit}
      </span>
    </div>
  );
}

function useToolHistory(classId: string, tool: ToolId | null) {
  const t = useTenantApi();
  return useQuery({
    queryKey: ['ai-history', t.slug, classId, tool],
    enabled: Boolean(classId && tool),
    queryFn: async () =>
      (
        await t.get<{ history: HistoryItem[] }>(
          `/ai/history?classId=${encodeURIComponent(classId)}&tool=${encodeURIComponent(tool!)}`
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
          <p className="text-xs text-slate-400">Previous responses for this tool in the selected class</p>
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

export default function AiStudentArea() {
  const t = useTenantApi();
  const { user } = useAuth();
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tool = (params.get('tool') as ToolId | null) || null;
  const [classId, setClassId] = useState('');
  const [err, setErr] = useState('');

  const classesQuery = useQuery({
    queryKey: ['ai-classes', t.slug],
    queryFn: async () => (await t.get<{ classes: AiClass[] }>('/ai/classes')).data.classes,
  });

  useEffect(() => {
    if (!classId && classesQuery.data?.length) setClassId(classesQuery.data[0].classId);
  }, [classesQuery.data, classId]);

  const quotaQuery = useQuery({
    queryKey: ['ai-quota', t.slug, classId],
    enabled: Boolean(classId),
    queryFn: async () =>
      (await t.get<{ quota: AiQuota }>(`/ai/quota?classId=${encodeURIComponent(classId)}`)).data.quota,
  });

  const setTool = (id: ToolId | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('tool', id);
    else next.delete('tool');
    setParams(next, { replace: true });
    setErr('');
  };

  const onQuotaUpdate = (quota: AiQuota) => {
    qc.setQueryData(['ai-quota', t.slug, classId], quota);
  };

  const refreshHistory = (toolId: ToolId) => {
    qc.invalidateQueries({ queryKey: ['ai-history', t.slug, classId, toolId] });
  };

  if (classesQuery.isLoading) return <Spinner label="Loading AI workspace..." />;

  if (!classesQuery.data?.length) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-ink-850">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/30">
          <Icon name="spark" width={22} height={22} />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">AI Student Area</h1>
        <p className="mt-2 text-sm text-slate-500">Enroll in a class first to unlock AI learning tools.</p>
      </div>
    );
  }

  const quota = quotaQuery.data;
  const depleted = (quota?.remaining ?? 0) <= 0;
  const activeTool = TOOLS.find((x) => x.id === tool);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Smart Learning Workspace
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            AI Dashboard
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="ai-class">
            Class
          </label>
          <select
            id="ai-class"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-ink-850 dark:text-slate-100"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setTool(null);
            }}
          >
            {classesQuery.data.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.title}
              </option>
            ))}
          </select>
          <TokenPill quota={quota} />
        </div>
      </div>

      {depleted && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Monthly AI tokens for this class are used up ({quota?.used}/{quota?.limit}). Quota resets next
          calendar month.
        </div>
      )}

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      )}

      {!tool ? (
        <>
          <div className="relative overflow-hidden rounded-3xl bg-brand-600 p-7 text-white shadow-lg sm:p-9">
            <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute bottom-0 right-10 opacity-15">
              <Icon name="spark" width={120} height={120} />
            </div>
            <p className="text-sm font-medium text-white/80">Welcome back</p>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight">Hello, {firstName}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/90 sm:text-base">
              Your real-time Smart AI learning modules are active. Choose a tool to start studying — each
              action uses 1 token for this class.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {TOOLS.map((item) => (
              <article
                key={item.id}
                className="group flex flex-col rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-ink-850"
              >
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                  <Icon name="spark" width={22} height={22} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{item.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {item.description}
                </p>
                <button
                  type="button"
                  disabled={!classId || depleted}
                  onClick={() => setTool(item.id)}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {item.cta}
                </button>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-ink-850">
          <div className="h-1.5 bg-brand-600" />
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                <Icon name="spark" width={18} height={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{activeTool?.title}</h2>
                <p className="text-xs text-slate-400">1 token per request · responses saved below</p>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              onClick={() => setTool(null)}
            >
              <Icon name="chevron" width={14} height={14} className="rotate-180" />
              Back to AI Hub
            </button>
          </div>
          <div className="p-5 sm:p-6">
            <ToolPanel
              tool={tool}
              classId={classId}
              depleted={depleted}
              onError={setErr}
              onQuotaUpdate={onQuotaUpdate}
              onSaved={() => refreshHistory(tool)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

type PanelProps = {
  classId: string;
  depleted: boolean;
  onError: (msg: string) => void;
  onQuotaUpdate: (q: AiQuota) => void;
  onSaved: () => void;
};

function ToolPanel(
  props: PanelProps & { tool: ToolId }
) {
  if (props.tool === 'tutor') return <TutorPanel {...props} />;
  if (props.tool === 'summarizer') return <SummarizerPanel {...props} />;
  if (props.tool === 'mcq') return <McqPanel {...props} />;
  if (props.tool === 'flashcards') return <FlashcardsPanel {...props} />;
  return <StudyPlanPanel {...props} />;
}

function TutorPanel({ classId, depleted, onError, onQuotaUpdate, onSaved }: PanelProps) {
  const t = useTenantApi();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; content: string; sections?: TutorSection[] }[]
  >([
    {
      role: 'assistant',
      content: 'Hello! I am your AI tutor. Ask me anything about this class.',
      sections: [
        {
          paragraphs: ['Hello! I am your AI tutor. Ask me anything about this class.'],
          bullets: [],
        },
      ],
    },
  ]);
  const historyQuery = useToolHistory(classId, 'tutor');

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      const history = messages.filter((m, i) => !(i === 0 && m.role === 'assistant')).slice(-8);
      return (
        await t.post<{ reply: string; sections?: TutorSection[]; quota: AiQuota }>('/ai/tutor', {
          classId,
          message,
          history: history.map(({ role, content }) => ({ role, content })),
        })
      ).data;
    },
    onSuccess: (data, message) => {
      setMessages((m) => [
        ...m,
        { role: 'user', content: message },
        { role: 'assistant', content: data.reply, sections: data.sections },
      ]);
      onQuotaUpdate(data.quota);
      onError('');
      setInput('');
      onSaved();
    },
    onError: (e) => onError(apiErrorMessage(e)),
  });

  return (
    <div>
      <div className="mb-3 max-h-[420px] space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-4 dark:bg-white/[0.04]">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm ${
              m.role === 'assistant'
                ? 'bg-white text-slate-800 shadow-sm dark:bg-ink-800 dark:text-slate-100'
                : 'ml-auto bg-sky-600 text-white shadow-sm shadow-sky-600/20'
            }`}
          >
            {m.role === 'assistant' ? (
              <TutorRichText text={m.content} sections={m.sections} />
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          placeholder="Ask anything about computer networking, databases…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim() && !depleted) mutation.mutate(input.trim());
          }}
        />
        <Button
          className="!rounded-2xl !bg-brand-600 hover:!bg-brand-700 sm:!px-6"
          disabled={depleted || mutation.isPending || !input.trim()}
          onClick={() => mutation.mutate(input.trim())}
        >
          {mutation.isPending ? 'Sending…' : 'Send'}
        </Button>
      </div>

      <HistorySection
        items={historyQuery.data}
        loading={historyQuery.isLoading}
        renderPayload={(item) => {
          const p = item.payload as {
            message?: string;
            reply?: string;
            sections?: TutorSection[];
          };
          return (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-semibold text-slate-500">You: </span>
                {p.message}
              </p>
              <div className="rounded-xl bg-white p-3 text-slate-700 dark:bg-ink-800 dark:text-slate-200">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-600">Tutor</p>
                <TutorRichText text={p.reply} sections={p.sections} />
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}

/** Reads a File as plain text. Handles .txt and extracts text from .pdf via raw string scan (best-effort). */
async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (file.type === 'application/pdf') {
      reader.onload = () => {
        const raw = reader.result as string;
        // Extract printable ASCII runs from the binary PDF – good enough for notes/slides
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
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
          </svg>
        )}
        {extracting ? 'Reading…' : 'Attach file'}
      </button>
    </>
  );
}

function SummarizerPanel({ classId, depleted, onError, onQuotaUpdate, onSaved }: PanelProps) {
  const t = useTenantApi();
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<{
    title: string;
    keyPoints: string[];
    summary: string;
    remember: string[];
  } | null>(null);
  const historyQuery = useToolHistory(classId, 'summarizer');

  const mutation = useMutation({
    mutationFn: async () =>
      (
        await t.post<{
          title: string;
          keyPoints: string[];
          summary: string;
          remember: string[];
          quota: AiQuota;
        }>('/ai/summarize', { classId, notes })
      ).data,
    onSuccess: (data) => {
      setResult(data);
      onQuotaUpdate(data.quota);
      onError('');
      onSaved();
    },
    onError: (e) => onError(apiErrorMessage(e)),
  });

  const renderSummary = (data: {
    title?: string;
    keyPoints?: string[];
    summary?: string;
    remember?: string[];
  }) => (
    <div className="space-y-3">
      {data.title && <h3 className="font-semibold text-slate-900 dark:text-white">{data.title}</h3>}
      {data.summary && <p className="text-sm text-slate-600 dark:text-slate-300">{data.summary}</p>}
      {!!data.keyPoints?.length && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
          {data.keyPoints.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      )}
      {!!data.remember?.length && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          {data.remember.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-2">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Lesson notes</label>
      </div>
      <div className="relative">
        <Textarea
          rows={8}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Paste your lesson paragraphs or upload a file (PDF, Word, TXT)..."
          className="!rounded-2xl !pb-10"
        />
        <div className="absolute bottom-2.5 right-2.5">
          <FileUploadButton onExtracted={(text) => setNotes(text)} loading={mutation.isPending} />
        </div>
      </div>
      <Button
        className="mt-4 w-full !rounded-2xl !bg-brand-600 hover:!bg-brand-700"
        disabled={depleted || mutation.isPending || notes.trim().length < 40}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Generating…' : 'Generate AI Summary'}
      </Button>
      {result && (
        <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/40 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
          {renderSummary(result)}
        </div>
      )}
      <HistorySection
        items={historyQuery.data}
        loading={historyQuery.isLoading}
        renderPayload={(item) => renderSummary((item.payload ?? {}) as NonNullable<typeof result>)}
      />
    </div>
  );
}

function McqPanel({ classId, depleted, onError, onQuotaUpdate, onSaved }: PanelProps) {
  const t = useTenantApi();
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [q, setQ] = useState<{
    question: string;
    options: string[];
    correctIndex: number;
    hint: string;
  } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const historyQuery = useToolHistory(classId, 'mcq');

  const mutation = useMutation({
    mutationFn: async () =>
      (
        await t.post<{
          question: string;
          options: string[];
          correctIndex: number;
          hint: string;
          quota: AiQuota;
        }>('/ai/mcq', { classId, topic: topic || undefined, notes: notes || undefined })
      ).data,
    onSuccess: (data) => {
      setQ(data);
      setPicked(null);
      onQuotaUpdate(data.quota);
      onError('');
      onSaved();
    },
    onError: (e) => onError(apiErrorMessage(e)),
  });

  const renderMcq = (
    data: { question?: string; options?: string[]; correctIndex?: number; hint?: string },
    interactive: boolean
  ) => (
    <div className="space-y-3">
      <p className="font-semibold text-slate-900 dark:text-white">{data.question}</p>
      <div className="space-y-2">
        {(data.options ?? []).map((opt, i) => {
          const show = !interactive || picked != null;
          const correct = i === data.correctIndex;
          const chosen = interactive && i === picked;
          return (
            <button
              key={i}
              type="button"
              disabled={!interactive || picked != null}
              onClick={() => interactive && setPicked(i)}
              className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                show && correct
                  ? 'border-green-400 bg-green-50 dark:bg-green-950/30'
                  : show && chosen
                    ? 'border-red-400 bg-red-50 dark:bg-red-950/30'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {(!interactive || picked != null) && data.hint && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {interactive && picked != null
            ? picked === data.correctIndex
              ? 'Correct. '
              : 'Not quite. '
            : `Answer: option ${(data.correctIndex ?? 0) + 1}. `}
          {data.hint}
        </p>
      )}
    </div>
  );

  return (
    <div>
      <input
        className="mb-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
        placeholder="Optional topic focus (e.g. networking)"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />
      <div className="mb-4">
        <div className="mb-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Lesson notes (optional — for targeted questions)
          </label>
        </div>
        <div className="relative">
          <Textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Paste or upload notes to generate questions based on specific content..."
            className="!rounded-2xl !pb-10"
          />
          <div className="absolute bottom-2.5 right-2.5">
            <FileUploadButton onExtracted={(text) => setNotes(text)} loading={mutation.isPending} />
          </div>
        </div>
      </div>
      {q && <div className="mb-4">{renderMcq(q, true)}</div>}
      <Button
        className="w-full !rounded-2xl !bg-brand-600 hover:!bg-brand-700"
        disabled={depleted || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Generating…' : q ? 'Next Random AI Question' : 'Generate AI Question'}
      </Button>
      <HistorySection
        items={historyQuery.data}
        loading={historyQuery.isLoading}
        renderPayload={(item) =>
          renderMcq(
            item.payload as {
              question?: string;
              options?: string[];
              correctIndex?: number;
              hint?: string;
            },
            false
          )
        }
      />
    </div>
  );
}

function FlashcardsPanel({ classId, depleted, onError, onQuotaUpdate, onSaved }: PanelProps) {
  const t = useTenantApi();
  const [input, setInput] = useState('');
  const [cards, setCards] = useState<{ front: string; back: string }[]>([]);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const historyQuery = useToolHistory(classId, 'flashcards');

  const mutation = useMutation({
    mutationFn: async () =>
      (
        await t.post<{ cards: { front: string; back: string }[]; quota: AiQuota }>('/ai/flashcards', {
          classId,
          topicOrNotes: input,
        })
      ).data,
    onSuccess: (data) => {
      setCards(data.cards);
      setFlipped({});
      onQuotaUpdate(data.quota);
      onError('');
      onSaved();
    },
    onError: (e) => onError(apiErrorMessage(e)),
  });

  const CardGrid = ({
    list,
    flipState,
    onFlip,
  }: {
    list: { front: string; back: string }[];
    flipState: Record<number, boolean>;
    onFlip: (i: number) => void;
  }) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {list.map((c, i) => {
        const isFlipped = Boolean(flipState[i]);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onFlip(i)}
            className={`min-h-[120px] rounded-2xl border p-4 text-left text-sm shadow-sm transition-colors duration-300 ${
              isFlipped
                ? 'border-teal-300 bg-gradient-to-br from-teal-500 to-cyan-600 text-white hover:border-teal-200 dark:border-teal-500 dark:from-teal-600 dark:to-cyan-700'
                : 'border-amber-100 bg-gradient-to-br from-amber-50 to-white text-slate-800 hover:border-amber-300 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-ink-850 dark:text-slate-100'
            }`}
          >
            <p
              className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${
                isFlipped ? 'text-teal-50/90' : 'text-amber-700/70 dark:text-amber-300/70'
              }`}
            >
              {isFlipped ? 'Answer' : 'Prompt'} · tap to flip
            </p>
            <p className={`font-medium ${isFlipped ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>
              {isFlipped ? c.back : c.front}
            </p>
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      <div className="mb-2">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Topic or notes</label>
      </div>
      <div className="relative">
        <Textarea
          rows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. OSI layers, or paste / upload a short section of notes"
          className="!rounded-2xl !pb-10"
        />
        <div className="absolute bottom-2.5 right-2.5">
          <FileUploadButton onExtracted={(text) => setInput(text)} loading={mutation.isPending} />
        </div>
      </div>
      <Button
        className="mt-4 !rounded-2xl !bg-brand-600 hover:!bg-brand-700"
        disabled={depleted || mutation.isPending || input.trim().length < 8}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Creating…' : 'Generate flashcards'}
      </Button>
      {cards.length > 0 && (
        <div className="mt-4">
          <CardGrid
            list={cards}
            flipState={flipped}
            onFlip={(i) => setFlipped((f) => ({ ...f, [i]: !f[i] }))}
          />
        </div>
      )}
      <HistorySection
        items={historyQuery.data}
        loading={historyQuery.isLoading}
        renderPayload={(item) => {
          const list = (item.payload.cards as { front: string; back: string }[]) || [];
          return (
            <HistoryFlashcards cards={list} />
          );
        }}
      />
    </div>
  );
}

function HistoryFlashcards({ cards }: { cards: { front: string; back: string }[] }) {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {cards.map((c, i) => {
        const isFlipped = Boolean(flipped[i]);
        return (
          <button
            key={i}
            type="button"
            onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))}
            className={`rounded-xl border p-3 text-left text-xs transition-colors duration-300 ${
              isFlipped
                ? 'border-teal-400 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-700'
                : 'border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-ink-800 dark:text-slate-200'
            }`}
          >
            <p className={`mb-1 font-semibold ${isFlipped ? 'text-teal-50/90' : 'text-slate-400'}`}>
              {isFlipped ? 'Answer' : 'Prompt'}
            </p>
            <p>{isFlipped ? c.back : c.front}</p>
          </button>
        );
      })}
    </div>
  );
}

function StudyPlanPanel({ classId, depleted, onError, onQuotaUpdate, onSaved }: PanelProps) {
  const t = useTenantApi();
  const [subject, setSubject] = useState('');
  const [unit, setUnit] = useState('');
  const [topic, setTopic] = useState('');
  const [plan, setPlan] = useState<{
    focus: string;
    days: { day: string; task: string; minutes: number }[];
    subject?: string;
    unit?: string;
    topic?: string;
    weakTopics: string[];
  } | null>(null);
  const historyQuery = useToolHistory(classId, 'study-plan');

  const canGenerate =
    subject.trim().length >= 2 && unit.trim().length >= 1 && topic.trim().length >= 2;

  const mutation = useMutation({
    mutationFn: async () =>
      (
        await t.post<{
          focus: string;
          days: { day: string; task: string; minutes: number }[];
          subject: string;
          unit: string;
          topic: string;
          weakTopics: string[];
          quota: AiQuota;
        }>('/ai/study-plan', {
          classId,
          subject: subject.trim(),
          unit: unit.trim(),
          topic: topic.trim(),
        })
      ).data,
    onSuccess: (data) => {
      setPlan(data);
      onQuotaUpdate(data.quota);
      onError('');
      onSaved();
    },
    onError: (e) => onError(apiErrorMessage(e)),
  });

  const renderPlan = (data: {
    focus?: string;
    days?: { day: string; task: string; minutes: number }[];
    subject?: string;
    unit?: string;
    topic?: string;
    weakTopics?: string[];
  }) => (
    <div className="space-y-3">
      {(data.subject || data.unit || data.topic) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {data.subject && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
              Subject: {data.subject}
            </span>
          )}
          {data.unit && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
              Unit: {data.unit}
            </span>
          )}
          {data.topic && (
            <span className="rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-800 dark:bg-violet-900/30 dark:text-violet-200">
              Topic: {data.topic}
            </span>
          )}
        </div>
      )}
      {data.focus && <p className="font-medium text-slate-800 dark:text-slate-100">{data.focus}</p>}
      <ol className="space-y-2">
        {(data.days ?? []).map((d, i) => (
          <li
            key={i}
            className="flex gap-3 rounded-2xl border border-slate-200 p-3 dark:border-white/10"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {d.day} · {d.minutes} min
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{d.task}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );

  const fieldCls =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100';

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Tell us what you want to revise. The plan will focus on that subject, unit, and topic (1 token).
      </p>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-1">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Subject
          </span>
          <input
            className={fieldCls}
            placeholder="e.g. ICT"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <label className="block sm:col-span-1">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Unit
          </span>
          <input
            className={fieldCls}
            placeholder="e.g. Unit 3 — Networking"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </label>
        <label className="block sm:col-span-1">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Topic
          </span>
          <input
            className={fieldCls}
            placeholder="e.g. IP addressing"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </label>
      </div>
      <Button
        className="!rounded-2xl !bg-brand-600 hover:!bg-brand-700"
        disabled={depleted || mutation.isPending || !canGenerate}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Building…' : plan ? 'Regenerate plan' : 'Generate study plan'}
      </Button>
      {!canGenerate && (
        <p className="mt-2 text-xs text-slate-400">Fill subject, unit, and topic to continue.</p>
      )}
      {plan && <div className="mt-4">{renderPlan(plan)}</div>}
      <HistorySection
        items={historyQuery.data}
        loading={historyQuery.isLoading}
        renderPayload={(item) =>
          renderPlan(
            item.payload as {
              focus?: string;
              days?: { day: string; task: string; minutes: number }[];
              subject?: string;
              unit?: string;
              topic?: string;
              weakTopics?: string[];
            }
          )
        }
      />
    </div>
  );
}
