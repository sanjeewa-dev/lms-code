import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../api/client';
import { useTenantApi } from '../hooks/useTenantApi';
import { Button, Card, Input, Select, Spinner } from '../components/ui';
import { FigureEditor } from '../components/FigureEditor';
import { QuestionFigure } from '../components/QuestionFigure';

type BankMeta = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  itemCount: number;
};

type BankItem = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  marks: number;
  topic: string;
  complexity: string;
  images?: { imageUrl: string }[];
};

type DraftItem = Omit<BankItem, 'id' | 'images'> & { imageUrls?: string[] };

type PaperDraftItem = {
  questionNumber?: number;
  text: string;
  options: string[];
  correctIndex: number | null;
  topic: string;
  complexity: string;
  marks: number;
  imageUrls?: string[];
};

type PaperStatus = 'pending' | 'processing' | 'pending_review' | 'completed' | 'failed';

const PAPER_ACCEPT =
  '.jpg,.jpeg,.png,.pdf,.docx,image/jpeg,image/png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const empty = (): DraftItem => ({
  text: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  marks: 1,
  topic: 'General',
  complexity: 'not_defined',
});

function bankLabel(b: { subject: string; grade: string; title?: string }) {
  if (b.grade) return `${b.subject} · ${b.grade}`;
  return `${b.subject} (all grades)`;
}

export default function QuestionBankPage() {
  const t = useTenantApi();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [customGrade, setCustomGrade] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [draft, setDraft] = useState(empty());
  const [error, setError] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const [addMode, setAddMode] = useState<'manual' | 'upload'>('manual');
  const [showCreateBank, setShowCreateBank] = useState(false);

  const [reviewPaperId, setReviewPaperId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<PaperStatus | null>(null);
  const [draftItems, setDraftItems] = useState<PaperDraftItem[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);

  const metaQuery = useQuery({
    queryKey: ['question-bank-meta', t.slug],
    queryFn: async () =>
      (
        await t.get<{
          defaultSubject: string;
          subjects: string[];
          grades: string[];
          teacher: { subject: string };
          banks: BankMeta[];
        }>('/question-bank/meta')
      ).data,
  });

  useEffect(() => {
    if (!metaQuery.data) return;
    if (!subject) setSubject(metaQuery.data.defaultSubject || 'General');
  }, [metaQuery.data, subject]);

  useEffect(() => {
    if (!selectedBankId) return;
    const stillThere = metaQuery.data?.banks.some((b) => b.id === selectedBankId);
    if (metaQuery.data && !stillThere) setSelectedBankId('');
  }, [metaQuery.data, selectedBankId]);

  const itemsQuery = useQuery({
    queryKey: ['question-bank-items', t.slug, selectedBankId, filterTopic],
    enabled: Boolean(selectedBankId),
    queryFn: async () => {
      const params = new URLSearchParams({ bankId: selectedBankId });
      if (filterTopic) params.set('topic', filterTopic);
      return (await t.get<{ items: BankItem[]; bank: BankMeta }>(`/question-bank?${params}`)).data;
    },
  });

  // Poll paper extraction status
  useEffect(() => {
    if (!reviewPaperId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const { paper } = (
          await t.get<{
            paper: {
              id: string;
              extractionStatus: PaperStatus;
              draftItems: PaperDraftItem[];
              errorMessage: string | null;
            };
          }>(`/question-bank/papers/${reviewPaperId}`)
        ).data;
        if (cancelled) return;
        setReviewStatus(paper.extractionStatus);
        if (paper.extractionStatus === 'pending' || paper.extractionStatus === 'processing') {
          setExtracting(true);
          setExtractProgress((p) =>
            Math.max(p, paper.extractionStatus === 'pending' ? 18 : 35)
          );
          timer = setTimeout(poll, 1500);
          return;
        }
        setExtracting(false);
        setExtractProgress(100);
        if (paper.extractionStatus === 'pending_review') {
          setDraftItems(
            (paper.draftItems ?? []).map((d) => {
              const rawOpts = Array.isArray(d.options) ? d.options.map((o) => String(o ?? '')) : [];
              const options =
                rawOpts.length >= 2
                  ? rawOpts.length >= 4
                    ? rawOpts
                    : [...rawOpts, ...Array(4 - rawOpts.length).fill('')]
                  : ['', '', '', ''];
              const ci = d.correctIndex == null ? null : Number(d.correctIndex);
              return {
                ...d,
                options,
                correctIndex:
                  ci != null && !Number.isNaN(ci) && ci >= 0 && ci < options.length ? ci : null,
                topic: d.topic || 'General',
                complexity: d.complexity || 'not_defined',
                marks: d.marks ?? 1,
              };
            })
          );
          setUploadMsg(`Extracted ${paper.draftItems?.length ?? 0} question(s) — review and save`);
        } else if (paper.extractionStatus === 'failed') {
          setError(paper.errorMessage || 'Extraction failed');
          setReviewPaperId(null);
          setExtractProgress(0);
        } else if (paper.extractionStatus === 'completed') {
          setReviewPaperId(null);
          setDraftItems([]);
          setExtractProgress(0);
        }
      } catch (err) {
        if (!cancelled) {
          setExtracting(false);
          setExtractProgress(0);
          setError(apiErrorMessage(err));
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reviewPaperId, t]);

  const topics = useMemo(() => {
    const set = new Set((itemsQuery.data?.items ?? []).map((i) => i.topic));
    return [...set].sort();
  }, [itemsQuery.data]);

  const selectedBank = useMemo(
    () => metaQuery.data?.banks.find((b) => b.id === selectedBankId) ?? null,
    [metaQuery.data, selectedBankId]
  );

  const reviewReady = useMemo(() => {
    if (!draftItems.length) return false;
    return draftItems.every(
      (d) =>
        d.text.trim() &&
        d.options.filter((o) => o.trim()).length >= 2 &&
        d.correctIndex != null &&
        d.correctIndex >= 0 &&
        d.correctIndex < d.options.length &&
        d.topic.trim()
    );
  }, [draftItems]);

  const createBankMutation = useMutation({
    mutationFn: async () => {
      const g = customGrade.trim() || grade;
      return (
        await t.post<{ bank: BankMeta }>('/question-bank', {
          subject: subject.trim() || 'General',
          grade: g,
          title: g
            ? `${subject.trim()} · ${g}`
            : `${subject.trim() || 'General'} question bank`,
        })
      ).data.bank;
    },
    onSuccess: (bank) => {
      setSelectedBankId(bank.id);
      setCustomGrade('');
      setShowCreateBank(false);
      setError('');
      qc.invalidateQueries({ queryKey: ['question-bank-meta', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBankId) throw new Error('Select a question bank first');
      return (await t.post('/question-bank/items', { ...draft, bankId: selectedBankId })).data;
    },
    onSuccess: () => {
      setDraft(empty());
      setError('');
      qc.invalidateQueries({ queryKey: ['question-bank-items', t.slug, selectedBankId] });
      qc.invalidateQueries({ queryKey: ['question-bank-meta', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const uploadPaperMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedBankId) throw new Error('Select a question bank first');
      const body = new FormData();
      body.append('paper', file);
      body.append('bankId', selectedBankId);
      return (
        await t.post<{
          paper: { id: string; extractionStatus: PaperStatus; pageCount: number };
        }>('/question-bank/papers', body)
      ).data.paper;
    },
    onSuccess: (paper) => {
      setError('');
      setUploadMsg('Paper uploaded — extracting questions…');
      setReviewPaperId(paper.id);
      setReviewStatus(paper.extractionStatus);
      setExtracting(true);
      setExtractProgress(12);
      setDraftItems([]);
      setAddMode('upload');
    },
    onError: (err) => {
      setError(apiErrorMessage(err));
      setExtractProgress(0);
    },
  });

  // Smooth progress while uploading (PDF convert can take a while) or extracting
  useEffect(() => {
    const uploading = uploadPaperMutation.isPending;
    const active = extracting || uploading;
    if (!active) return;
    const id = window.setInterval(() => {
      setExtractProgress((p) => {
        const cap = uploading ? 45 : 92;
        if (p >= cap) return p;
        const step = p < 20 ? 5 : p < 40 ? 3 : p < 70 ? 2 : 1;
        return Math.min(cap, p + step);
      });
    }, 600);
    return () => window.clearInterval(id);
  }, [extracting, uploadPaperMutation.isPending]);

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!reviewPaperId) throw new Error('No paper to confirm');
      const items = draftItems.map((d) => ({
        text: d.text.trim(),
        options: d.options.map((o) => o.trim()).filter(Boolean).length >= 2
          ? d.options
          : d.options,
        correctIndex: d.correctIndex as number,
        topic: d.topic.trim() || 'General',
        complexity: d.complexity || 'not_defined',
        marks: d.marks ?? 1,
        imageUrls: d.imageUrls,
      }));
      return (
        await t.post<{ saved: number }>(`/question-bank/papers/${reviewPaperId}/confirm`, {
          items,
        })
      ).data;
    },
    onSuccess: (data) => {
      setUploadMsg(`Saved ${data.saved} question(s) to the bank`);
      setReviewPaperId(null);
      setReviewStatus(null);
      setDraftItems([]);
      setExtracting(false);
      setExtractProgress(0);
      setError('');
      qc.invalidateQueries({ queryKey: ['question-bank-items', t.slug, selectedBankId] });
      qc.invalidateQueries({ queryKey: ['question-bank-meta', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await t.del(`/question-bank/items/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['question-bank-items', t.slug, selectedBankId] });
      qc.invalidateQueries({ queryKey: ['question-bank-meta', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function onFileChosen(file: File | null) {
    setUploadMsg('');
    setError('');
    if (!file) return;
    if (!selectedBankId) {
      setError('Select a question bank first');
      return;
    }
    setExtractProgress(6);
    setDraftItems([]);
    setReviewPaperId(null);
    uploadPaperMutation.mutate(file, {
      onSettled: () => {
        if (fileRef.current) fileRef.current.value = '';
      },
    });
  }

  function updateDraft(idx: number, patch: Partial<PaperDraftItem>) {
    setDraftItems((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  async function uploadFigure(file: File): Promise<string> {
    const body = new FormData();
    body.append('figure', file);
    try {
      const { data } = await t.post<{ imageUrl: string }>('/question-figures', body);
      return data.imageUrl;
    } catch (err) {
      throw new Error(apiErrorMessage(err));
    }
  }

  function cancelReview() {
    setReviewPaperId(null);
    setReviewStatus(null);
    setDraftItems([]);
    setExtracting(false);
    setExtractProgress(0);
    setUploadMsg('');
  }

  const extractLabel =
    uploadPaperMutation.isPending
      ? 'Uploading & converting paper…'
      : reviewStatus === 'processing'
        ? 'Extracting questions…'
        : reviewStatus === 'pending'
          ? 'Preparing document…'
          : extracting
            ? 'Extracting questions…'
            : '';

  const grades = metaQuery.data?.grades ?? [];
  const banks = metaQuery.data?.banks ?? [];
  const bankSelected = Boolean(selectedBankId);
  /** Progress in upload panel while request is in flight (PDF convert happens server-side before response). */
  const showUploadProgress = uploadPaperMutation.isPending;
  const showReview = Boolean(reviewPaperId) && (extracting || draftItems.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Question bank</h1>
          <p className="mt-1 text-sm text-slate-500">
            Select a bank, then add questions manually or upload a paper (image / PDF / Word) for AI
            extraction
            {grades.length > 0 ? ' · banks are scoped by teacher + subject (+ optional grade)' : ''}.
          </p>
        </div>
        <Button
          variant={showCreateBank ? 'secondary' : 'primary'}
          onClick={() => {
            setShowCreateBank((v) => !v);
            setError('');
          }}
        >
          {showCreateBank ? 'Cancel' : '+ Create a new bank'}
        </Button>
      </div>

      {showCreateBank && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Create a new bank</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={metaQuery.data?.defaultSubject || 'e.g. Maths'}
              list="qb-subjects"
            />
            <datalist id="qb-subjects">
              {(metaQuery.data?.subjects ?? []).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Select
              label="Grade (optional)"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              <option value="">All grades (subject-wide)</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
            <Input
              label="Or custom grade"
              value={customGrade}
              onChange={(e) => setCustomGrade(e.target.value)}
              placeholder="e.g. Grade 10"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={!subject.trim() || createBankMutation.isPending}
              onClick={() => createBankMutation.mutate()}
            >
              {createBankMutation.isPending ? 'Creating...' : 'Create bank & select it'}
            </Button>
            <Button variant="secondary" onClick={() => setShowCreateBank(false)}>
              Cancel
            </Button>
          </div>
          {error && showCreateBank && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Select question bank</h2>
        {metaQuery.isLoading ? (
          <Spinner label="Loading banks..." />
        ) : (
          <div className="space-y-4">
            <Select
              label="Question bank"
              value={selectedBankId}
              onChange={(e) => {
                setSelectedBankId(e.target.value);
                setError('');
                setUploadMsg('');
              }}
              disabled={Boolean(reviewPaperId)}
            >
              <option value="">— Select a question bank —</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {bankLabel(b)} · {b.itemCount} question{b.itemCount === 1 ? '' : 's'}
                </option>
              ))}
            </Select>

            {!bankSelected && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                Select a question bank above before you can add or upload questions.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className={!bankSelected ? 'opacity-60' : undefined}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Add questions
            {selectedBank ? (
              <span className="ml-2 text-sm font-normal text-slate-500">
                → {bankLabel(selectedBank)}
              </span>
            ) : null}
          </h2>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-white/10">
            <button
              type="button"
              disabled={!bankSelected || Boolean(reviewPaperId)}
              onClick={() => setAddMode('manual')}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                addMode === 'manual' ? 'bg-white shadow dark:bg-ink-850' : 'text-slate-600'
              }`}
            >
              Manual
            </button>
            <button
              type="button"
              disabled={!bankSelected || Boolean(reviewPaperId)}
              onClick={() => setAddMode('upload')}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                addMode === 'upload' ? 'bg-white shadow dark:bg-ink-850' : 'text-slate-600'
              }`}
            >
              Upload paper
            </button>
          </div>
        </div>

        {!bankSelected ? (
          <p className="text-sm text-slate-500">Choose a question bank to unlock this section.</p>
        ) : addMode === 'upload' ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Upload a <strong>JPEG/PNG</strong>, <strong>PDF</strong>, or <strong>Word (.docx)</strong>{' '}
              paper. AI extracts questions for you to review (same flow as ScoreSmart).
            </p>
            <input
              ref={fileRef}
              type="file"
              accept={PAPER_ACCEPT}
              disabled={uploadPaperMutation.isPending || Boolean(reviewPaperId)}
              onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
            {showUploadProgress && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {extractLabel || 'Uploading & converting paper…'}
                  </span>
                  <span className="tabular-nums text-xs font-semibold text-slate-500">
                    {Math.round(Math.max(extractProgress, 6))}%
                  </span>
                </div>
                <div
                  className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.max(extractProgress, 6))}
                  aria-label="Upload progress"
                >
                  <div
                    className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.max(extractProgress, 6)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  PDFs are converted page-by-page on the server — this can take longer than images.
                </p>
              </div>
            )}
            {uploadMsg && !extracting && !uploadPaperMutation.isPending && (
              <p className="text-sm text-emerald-700">{uploadMsg}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              label="Stem"
              value={draft.text}
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              disabled={!bankSelected}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                label="Topic"
                value={draft.topic}
                onChange={(e) => setDraft((d) => ({ ...d, topic: e.target.value }))}
                disabled={!bankSelected}
              />
              <Select
                label="Complexity"
                value={draft.complexity}
                onChange={(e) => setDraft((d) => ({ ...d, complexity: e.target.value }))}
                disabled={!bankSelected}
              >
                <option value="not_defined">Not defined</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </div>
            <div className="space-y-2">
              {draft.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="bank-correct"
                    checked={draft.correctIndex === i}
                    onChange={() => setDraft((d) => ({ ...d, correctIndex: i }))}
                    disabled={!bankSelected}
                  />
                  <input
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60 dark:border-white/10 dark:bg-white/5"
                    value={opt}
                    placeholder={`Option ${i + 1}`}
                    disabled={!bankSelected}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        options: d.options.map((o, j) => (j === i ? e.target.value : o)),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <FigureEditor
              imageUrl={draft.imageUrls?.[0]}
              disabled={!bankSelected}
              onChange={(url) => setDraft((d) => ({ ...d, imageUrls: url ? [url] : [] }))}
              onUploadFile={uploadFigure}
            />
            <Button
              disabled={!bankSelected || !draft.text.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Adding...' : 'Add to selected bank'}
            </Button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>

      {showReview && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              Review extracted questions
              {draftItems.length ? ` (${draftItems.length})` : ''}
            </h2>
            <Button variant="secondary" onClick={cancelReview}>
              Cancel
            </Button>
          </div>

          {extracting && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {extractLabel || 'Extracting questions…'}
                </span>
                <span className="tabular-nums text-xs font-semibold text-slate-500">
                  {Math.round(extractProgress)}%
                </span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(extractProgress)}
                aria-label="Extraction progress"
              >
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out"
                  style={{ width: `${extractProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">
                Reading your paper and extracting questions. This can take a minute for multi-page
                PDFs…
              </p>
            </div>
          )}

          {!extracting && draftItems.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Check stems, options, and pick the correct answer + topic for each question, then
                save to the bank.
              </p>
              {draftItems.map((d, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-200 p-3 dark:border-white/10"
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Q{d.questionNumber ?? idx + 1}
                  </p>
                  <Input
                    label="Stem"
                    value={d.text}
                    onChange={(e) => updateDraft(idx, { text: e.target.value })}
                  />
                  <div className="mt-2">
                    <Input
                      label="Topic"
                      value={d.topic}
                      onChange={(e) => updateDraft(idx, { topic: e.target.value })}
                    />
                  </div>
                  <fieldset className="mt-3">
                    <legend className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                      Options — select the correct answer
                    </legend>
                    <div className="space-y-2">
                      {d.options.map((opt, oi) => (
                        <div
                          key={oi}
                          role="button"
                          tabIndex={0}
                          onClick={() => updateDraft(idx, { correctIndex: oi })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              updateDraft(idx, { correctIndex: oi });
                            }
                          }}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 ${
                            d.correctIndex === oi
                              ? 'border-brand-400 bg-brand-50/60 dark:border-brand-700 dark:bg-brand-950/30'
                              : 'border-slate-200 dark:border-white/10'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`review-correct-${idx}`}
                            checked={d.correctIndex === oi}
                            readOnly
                            tabIndex={-1}
                            className="pointer-events-none h-4 w-4 shrink-0 accent-brand-600"
                            aria-label={`Mark option ${String.fromCharCode(65 + oi)} as correct`}
                          />
                          <span className="w-5 shrink-0 text-xs font-semibold text-slate-500">
                            {String.fromCharCode(65 + oi)}
                          </span>
                          <input
                            type="text"
                            className="min-w-0 flex-1 cursor-text rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-white/10 dark:bg-white/5"
                            value={opt}
                            placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              updateDraft(idx, {
                                options: d.options.map((o, j) => (j === oi ? e.target.value : o)),
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                    {d.options.length < 6 && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
                        onClick={() =>
                          updateDraft(idx, { options: [...d.options, ''] })
                        }
                      >
                        + Add option
                      </button>
                    )}
                    {d.correctIndex == null && (
                      <p className="mt-1.5 text-xs text-amber-700">Select the correct answer</p>
                    )}
                  </fieldset>
                  <FigureEditor
                    imageUrl={d.imageUrls?.[0]}
                    onChange={(url) => updateDraft(idx, { imageUrls: url ? [url] : [] })}
                    onUploadFile={uploadFigure}
                  />
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!reviewReady || confirmMutation.isPending}
                  onClick={() => confirmMutation.mutate()}
                >
                  {confirmMutation.isPending
                    ? 'Saving…'
                    : `Save ${draftItems.length} to question bank`}
                </Button>
                {!reviewReady && (
                  <p className="self-center text-xs text-amber-700">
                    Fill topic and correct answer for every question before saving.
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {bankSelected && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              Items ({itemsQuery.data?.items.length ?? 0})
            </h2>
            <Select
              value={filterTopic}
              onChange={(e) => setFilterTopic(e.target.value)}
              className="max-w-xs"
            >
              <option value="">All topics</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </Select>
          </div>
          {itemsQuery.isLoading && <Spinner label="Loading..." />}
          <ul className="space-y-3">
            {(itemsQuery.data?.items ?? []).map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-slate-200 p-3 dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{item.text}</p>
                    {(item.images ?? []).map((img, i) => (
                      <QuestionFigure
                        key={img.imageUrl + i}
                        src={img.imageUrl}
                        className="mt-2 max-h-32 w-auto max-w-full rounded-md border border-slate-200 object-contain dark:border-white/10"
                      />
                    ))}
                    <p className="mt-1 text-xs text-slate-500">
                      {item.topic} · {item.complexity} · {item.marks} mark(s)
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => deleteMutation.mutate(item.id)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
            {!itemsQuery.isLoading && (itemsQuery.data?.items.length ?? 0) === 0 && (
              <li className="text-sm text-slate-500">No questions in this bank yet.</li>
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}
