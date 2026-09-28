import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../api/client';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Button, Card, Input, Spinner } from '../ui';
import { Icon } from '../icons';

interface DraftQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  marks: number;
  topic: string;
  complexity: 'not_defined' | 'low' | 'medium' | 'high';
  imageUrls: string[];
}

interface QuizDetail {
  id: string;
  title: string;
  description: string;
  timeLimitSec: number;
  isPublished: boolean;
  shuffleQuestions?: boolean;
  navigationMode?: string;
  timeRemindersMinutes?: number[];
  attemptCount?: number;
  questions: {
    text: string;
    options: unknown;
    correctIndex: number;
    marks: number;
    topic?: string;
    complexity?: string;
    images?: { imageUrl: string }[];
  }[];
}

type BankItem = {
  id: string;
  text: string;
  topic: string;
  options: string[];
  correctIndex: number;
  marks: number;
  complexity: string;
  images?: { imageUrl: string }[];
};

const REMINDER_OPTIONS = [30, 15, 10, 5];

const emptyQuestion = (): DraftQuestion => ({
  text: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  marks: 1,
  topic: 'General',
  complexity: 'not_defined',
  imageUrls: [],
});

function toDraftQuestions(questions: QuizDetail['questions']): DraftQuestion[] {
  return questions.map((q) => ({
    text: q.text,
    options: Array.isArray(q.options) ? (q.options as string[]).map(String) : ['', ''],
    correctIndex: q.correctIndex,
    marks: q.marks ?? 1,
    topic: q.topic || 'General',
    complexity: (q.complexity as DraftQuestion['complexity']) || 'not_defined',
    imageUrls: (q.images ?? []).map((i) => i.imageUrl),
  }));
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export function QuizBuilder({
  classId,
  quizId,
  onDone,
}: {
  classId: string;
  quizId?: string;
  onDone: () => void;
}) {
  const t = useTenantApi();
  const queryClient = useQueryClient();
  const editing = Boolean(quizId);

  const [title, setTitle] = useState('');
  const [timeLimitMin, setTimeLimitMin] = useState('5');
  const [isPublished, setIsPublished] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [navigationMode, setNavigationMode] = useState<'bidirectional' | 'unidirectional'>(
    'bidirectional'
  );
  const [reminders, setReminders] = useState<number[]>([15, 5]);
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [newTopic, setNewTopic] = useState('');
  const [error, setError] = useState('');
  const [lockedQuestions, setLockedQuestions] = useState(false);
  const [showBank, setShowBank] = useState(false);
  const [activeBankId, setActiveBankId] = useState('');
  const [selectedBankItemIds, setSelectedBankItemIds] = useState<string[]>([]);
  const [bankSearch, setBankSearch] = useState('');
  const [bankTopicFilter, setBankTopicFilter] = useState('');
  const [bankTopicQuery, setBankTopicQuery] = useState('');
  const [bankTopicOpen, setBankTopicOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['quiz', t.slug, quizId],
    enabled: Boolean(quizId),
    queryFn: async () => (await t.get<{ quiz: QuizDetail }>(`/quizzes/${quizId}`)).data.quiz,
  });

  const topicsQuery = useQuery({
    queryKey: ['quiz-topics', t.slug, classId],
    queryFn: async () =>
      (await t.get<{ topics: { id: string; name: string }[] }>(`/classes/${classId}/quiz-topics`))
        .data.topics,
  });

  const relatedBanksQuery = useQuery({
    queryKey: ['class-question-banks', t.slug, classId],
    enabled: showBank,
    queryFn: async () =>
      (
        await t.get<{
          context: {
            subject: string;
            grade: string | null;
            teacherName: string;
          };
          banks: { id: string; title: string; subject: string; grade: string; itemCount: number }[];
        }>(`/classes/${classId}/question-banks`)
      ).data,
  });

  const bankItemsQuery = useQuery({
    queryKey: ['question-bank-items', t.slug, activeBankId],
    enabled: showBank && Boolean(activeBankId),
    queryFn: async () =>
      (
        await t.get<{ items: BankItem[] }>(
          `/question-bank?bankId=${encodeURIComponent(activeBankId)}`
        )
      ).data.items,
  });

  useEffect(() => {
    if (!relatedBanksQuery.data?.banks.length) return;
    if (!activeBankId || !relatedBanksQuery.data.banks.some((b) => b.id === activeBankId)) {
      setActiveBankId(relatedBanksQuery.data.banks[0].id);
    }
  }, [relatedBanksQuery.data, activeBankId]);

  useEffect(() => {
    if (!detailQuery.data) return;
    const q = detailQuery.data;
    setTitle(q.title);
    setTimeLimitMin(String(Math.round((q.timeLimitSec || 0) / 60)));
    setIsPublished(q.isPublished);
    setShuffleQuestions(Boolean(q.shuffleQuestions));
    setNavigationMode(q.navigationMode === 'unidirectional' ? 'unidirectional' : 'bidirectional');
    setReminders(Array.isArray(q.timeRemindersMinutes) ? q.timeRemindersMinutes : [15, 5]);
    const drafts = toDraftQuestions(q.questions);
    setQuestions(drafts.length ? drafts : [emptyQuestion()]);
    setLockedQuestions((q.attemptCount ?? 0) > 0);
  }, [detailQuery.data]);

  // Reset import filters when switching banks
  useEffect(() => {
    setBankSearch('');
    setBankTopicFilter('');
    setBankTopicQuery('');
    setSelectedBankItemIds([]);
  }, [activeBankId]);

  const bankTopics = useMemo(() => {
    const set = new Set((bankItemsQuery.data ?? []).map((i) => i.topic || 'General'));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [bankItemsQuery.data]);

  const filteredBankTopics = useMemo(() => {
    const q = bankTopicQuery.trim().toLowerCase();
    if (!q) return bankTopics;
    return bankTopics.filter((topic) => topic.toLowerCase().includes(q));
  }, [bankTopics, bankTopicQuery]);

  const filteredBankItems = useMemo(() => {
    const items = bankItemsQuery.data ?? [];
    const q = bankSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (bankTopicFilter && (item.topic || 'General') !== bankTopicFilter) return false;
      if (!q) return true;
      const hay = `${item.text} ${item.topic} ${item.options.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [bankItemsQuery.data, bankSearch, bankTopicFilter]);

  const selectedVisibleCount = useMemo(
    () => filteredBankItems.filter((i) => selectedBankItemIds.includes(i.id)).length,
    [filteredBankItems, selectedBankItemIds]
  );

  function updateQuestion(idx: number, patch: Partial<DraftQuestion>) {
    if (lockedQuestions) return;
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }
  function updateOption(qIdx: number, oIdx: number, value: string) {
    if (lockedQuestions) return;
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qIdx ? { ...q, options: q.options.map((o, j) => (j === oIdx ? value : o)) } : q
      )
    );
  }

  const addTopicMutation = useMutation({
    mutationFn: async (name: string) =>
      (await t.post(`/classes/${classId}/quiz-topics`, { name })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz-topics', t.slug, classId] });
      setNewTopic('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        title,
        timeLimitSec: Math.max(0, Math.round(Number(timeLimitMin) * 60)),
        isPublished,
        shuffleQuestions,
        navigationMode,
        timeRemindersMinutes: reminders,
        ...(lockedQuestions ? {} : { questions }),
      };
      if (editing) {
        return (await t.patch(`/quizzes/${quizId}`, body)).data;
      }
      return (
        await t.post(`/classes/${classId}/quizzes`, {
          ...body,
          questions,
        })
      ).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizzes', t.slug, classId] });
      if (quizId) queryClient.invalidateQueries({ queryKey: ['quiz', t.slug, quizId] });
      onDone();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const importBankMutation = useMutation({
    mutationFn: async () => {
      if (!quizId) {
        const items = bankItemsQuery.data ?? [];
        const selected = items.filter((i) => selectedBankItemIds.includes(i.id));
        setQuestions((qs) => [
          ...qs.filter((q) => q.text.trim()),
          ...selected.map((item) => ({
            text: item.text,
            options: item.options,
            correctIndex: item.correctIndex,
            marks: item.marks,
            topic: item.topic || 'General',
            complexity: (item.complexity as DraftQuestion['complexity']) || 'not_defined',
            imageUrls: (item.images ?? []).map((img) => img.imageUrl),
          })),
        ]);
        setShowBank(false);
        setSelectedBankItemIds([]);
        return;
      }
      await t.post(`/quizzes/${quizId}/import-bank-items`, { itemIds: selectedBankItemIds });
    },
    onSuccess: async () => {
      if (quizId) {
        queryClient.invalidateQueries({ queryKey: ['quiz', t.slug, quizId] });
        const refreshed = (await t.get<{ quiz: QuizDetail }>(`/quizzes/${quizId}`)).data.quiz;
        setQuestions(toDraftQuestions(refreshed.questions));
      }
      setShowBank(false);
      setSelectedBankItemIds([]);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const saveToBankMutation = useMutation({
    mutationFn: async () => {
      if (!quizId) throw new Error('Save the quiz first, then add questions to the bank');
      await t.post(`/quizzes/${quizId}/save-to-bank`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-question-banks', t.slug, classId] });
      queryClient.invalidateQueries({ queryKey: ['question-bank-meta', t.slug] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const topicNames = topicsQuery.data?.map((tpc) => tpc.name) ?? [];
  const questionCount = questions.filter((q) => q.text.trim()).length;
  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

  function toggleSelectAllVisible() {
    const visibleIds = filteredBankItems.map((i) => i.id);
    const allSelected = visibleIds.every((id) => selectedBankItemIds.includes(id));
    if (allSelected) {
      setSelectedBankItemIds((ids) => ids.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedBankItemIds((ids) => [...new Set([...ids, ...visibleIds])]);
    }
  }

  if (editing && detailQuery.isLoading) {
    return (
      <Card>
        <Spinner label="Loading quiz..." />
      </Card>
    );
  }

  if (editing && detailQuery.isError) {
    return (
      <Card>
        <p className="text-sm text-red-600">{apiErrorMessage(detailQuery.error)}</p>
        <Button variant="secondary" className="mt-3" onClick={onDone}>
          Close
        </Button>
      </Card>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/5 dark:bg-ink-850">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4 dark:border-white/5 dark:from-white/[0.04] dark:to-transparent">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
            <Icon name="quiz" width={20} height={20} />
          </span>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {editing ? 'Edit MCQ quiz' : 'Create MCQ quiz'}
            </h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {questionCount} question{questionCount === 1 ? '' : 's'} · {totalMarks} mark
              {totalMarks === 1 ? '' : 's'}
              {Number(timeLimitMin) > 0 ? ` · ${timeLimitMin} min` : ' · no time limit'}
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>

      <div className="space-y-6 p-5">
        {lockedQuestions && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Students have already started this quiz, so questions are locked. You can still change
            settings.
          </p>
        )}

        {/* Section 1 — Settings */}
        <section>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            1 · Quiz settings
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Quiz title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Grade 10 ICT — Week 3"
            />
            <Input
              label="Time limit (minutes)"
              type="number"
              min={0}
              value={timeLimitMin}
              onChange={(e) => setTimeLimitMin(e.target.value)}
              placeholder="0 = unlimited"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Toggle
              checked={isPublished}
              onChange={setIsPublished}
              label="Published"
              hint="Visible to students when turned on"
            />
            <Toggle
              checked={shuffleQuestions}
              onChange={setShuffleQuestions}
              label="Shuffle questions"
              hint="Each student gets a different order"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Navigation
              </span>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                value={navigationMode}
                onChange={(e) =>
                  setNavigationMode(e.target.value as 'bidirectional' | 'unidirectional')
                }
              >
                <option value="bidirectional">Bidirectional — free back / forward</option>
                <option value="unidirectional">Unidirectional — forward only</option>
              </select>
            </label>
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Time reminders
              </p>
              <div className="flex flex-wrap gap-2">
                {REMINDER_OPTIONS.map((m) => {
                  const on = reminders.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        setReminders((prev) =>
                          on ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => b - a)
                        )
                      }
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        on
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300'
                      }`}
                    >
                      {m} min left
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Class quiz topics
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {topicNames.length === 0 && (
                <span className="text-xs text-slate-400">No topics yet — add one below</span>
              )}
              {topicNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10"
                >
                  {name}
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="New topic name"
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
              />
              <Button
                variant="secondary"
                disabled={!newTopic.trim() || addTopicMutation.isPending}
                onClick={() => addTopicMutation.mutate(newTopic.trim())}
              >
                Add
              </Button>
            </div>
          </div>
        </section>

        {/* Section 2 — Questions */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              2 · Questions
            </h4>
            <div className="flex flex-wrap gap-2">
              {!lockedQuestions && (
                <Button
                  variant={showBank ? 'primary' : 'secondary'}
                  onClick={() => setShowBank((v) => !v)}
                >
                  {showBank ? 'Hide question bank' : 'Import from question bank'}
                </Button>
              )}
              {editing && (
                <Button
                  variant="secondary"
                  disabled={saveToBankMutation.isPending}
                  onClick={() => saveToBankMutation.mutate()}
                >
                  Save questions to bank
                </Button>
              )}
            </div>
          </div>

          {showBank && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-brand-200 bg-brand-50/40 dark:border-brand-900/40 dark:bg-brand-950/20">
              <div className="border-b border-brand-100 px-4 py-3 dark:border-brand-900/30">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Import from question bank
                </p>
                {relatedBanksQuery.data && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {relatedBanksQuery.data.context.teacherName} ·{' '}
                    {relatedBanksQuery.data.context.subject}
                    {relatedBanksQuery.data.context.grade
                      ? ` · ${relatedBanksQuery.data.context.grade}`
                      : ' · subject-wide'}
                  </p>
                )}
              </div>

              <div className="space-y-3 p-4">
                {relatedBanksQuery.isLoading && <Spinner label="Loading banks..." />}

                {(relatedBanksQuery.data?.banks.length ?? 0) === 0 &&
                  !relatedBanksQuery.isLoading && (
                    <p className="text-sm text-slate-500">
                      No matching question banks. Create one under Question bank for this
                      teacher&apos;s subject
                      {relatedBanksQuery.data?.context.grade ? ' and grade' : ''}.
                    </p>
                  )}

                <div className="flex flex-wrap gap-1.5">
                  {(relatedBanksQuery.data?.banks ?? []).map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setActiveBankId(b.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        activeBankId === b.id
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10'
                      }`}
                    >
                      {b.grade ? `${b.subject} · ${b.grade}` : `${b.subject} (all)`} · {b.itemCount}
                    </button>
                  ))}
                </div>

                {activeBankId && (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        label="Search questions"
                        placeholder="Search stem, options, topic…"
                        value={bankSearch}
                        onChange={(e) => setBankSearch(e.target.value)}
                      />
                      <div className="relative">
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Filter by topic
                          </span>
                          <input
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                            placeholder="Type to search topics…"
                            value={bankTopicOpen ? bankTopicQuery : bankTopicFilter || ''}
                            onChange={(e) => {
                              setBankTopicQuery(e.target.value);
                              setBankTopicOpen(true);
                              if (!e.target.value.trim()) setBankTopicFilter('');
                            }}
                            onFocus={() => {
                              setBankTopicOpen(true);
                              setBankTopicQuery(bankTopicFilter);
                            }}
                            onBlur={() => {
                              // Delay so option click registers
                              window.setTimeout(() => setBankTopicOpen(false), 150);
                            }}
                          />
                        </label>
                        {bankTopicOpen && (
                          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-ink-850">
                            <li>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-white/5"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setBankTopicFilter('');
                                  setBankTopicQuery('');
                                  setBankTopicOpen(false);
                                }}
                              >
                                All topics
                              </button>
                            </li>
                            {filteredBankTopics.map((topic) => (
                              <li key={topic}>
                                <button
                                  type="button"
                                  className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-white/5 ${
                                    bankTopicFilter === topic
                                      ? 'bg-brand-50 font-semibold text-brand-800 dark:bg-brand-950/40 dark:text-brand-200'
                                      : ''
                                  }`}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setBankTopicFilter(topic);
                                    setBankTopicQuery(topic);
                                    setBankTopicOpen(false);
                                  }}
                                >
                                  {topic}
                                </button>
                              </li>
                            ))}
                            {filteredBankTopics.length === 0 && (
                              <li className="px-3 py-2 text-sm text-slate-400">No topics match</li>
                            )}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        Showing {filteredBankItems.length} of {bankItemsQuery.data?.length ?? 0}
                        {bankTopicFilter ? ` · topic “${bankTopicFilter}”` : ''}
                        {selectedBankItemIds.length
                          ? ` · ${selectedBankItemIds.length} selected`
                          : ''}
                      </span>
                      <button
                        type="button"
                        className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
                        onClick={toggleSelectAllVisible}
                        disabled={filteredBankItems.length === 0}
                      >
                        {filteredBankItems.length > 0 &&
                        selectedVisibleCount === filteredBankItems.length
                          ? 'Deselect visible'
                          : 'Select visible'}
                      </button>
                    </div>

                    <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-ink-850">
                      {bankItemsQuery.isLoading && (
                        <div className="p-4">
                          <Spinner label="Loading questions..." />
                        </div>
                      )}
                      {!bankItemsQuery.isLoading && filteredBankItems.length === 0 && (
                        <p className="p-4 text-sm text-slate-500">
                          No questions match your search / topic filter.
                        </p>
                      )}
                      {filteredBankItems.map((item, index) => (
                        <label
                          key={item.id}
                          className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm transition hover:bg-slate-50 dark:hover:bg-white/5 ${
                            index ? 'border-t border-slate-100 dark:border-white/5' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-brand-600"
                            checked={selectedBankItemIds.includes(item.id)}
                            onChange={(e) =>
                              setSelectedBankItemIds((ids) =>
                                e.target.checked
                                  ? [...ids, item.id]
                                  : ids.filter((id) => id !== item.id)
                              )
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-slate-800 dark:text-slate-100">
                              {item.text.slice(0, 160)}
                              {item.text.length > 160 ? '…' : ''}
                            </span>
                            <span className="mt-1 flex flex-wrap gap-1.5">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
                                {item.topic || 'General'}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-white/10">
                                {item.marks} mark{item.marks === 1 ? '' : 's'}
                              </span>
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>

                    <Button
                      disabled={!selectedBankItemIds.length || importBankMutation.isPending}
                      onClick={() => importBankMutation.mutate()}
                    >
                      {importBankMutation.isPending
                        ? 'Adding…'
                        : `Add ${selectedBankItemIds.length || ''} selected to quiz`}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className={`space-y-3 ${lockedQuestions ? 'pointer-events-none opacity-60' : ''}`}>
            {questions.map((q, qIdx) => (
              <div
                key={qIdx}
                className="rounded-2xl border border-slate-200 p-4 dark:border-white/10"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {qIdx + 1}
                    </span>
                    Question
                  </span>
                  {!lockedQuestions && questions.length > 1 && (
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600 hover:underline"
                      onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qIdx))}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <Input
                  placeholder="Question stem"
                  value={q.text}
                  onChange={(e) => updateQuestion(qIdx, { text: e.target.value })}
                  disabled={lockedQuestions}
                />

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-500">
                    Topic
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                      value={q.topic}
                      onChange={(e) => updateQuestion(qIdx, { topic: e.target.value })}
                      disabled={lockedQuestions}
                    >
                      <option value="General">General</option>
                      {topicNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-500">
                    Complexity
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                      value={q.complexity}
                      onChange={(e) =>
                        updateQuestion(qIdx, {
                          complexity: e.target.value as DraftQuestion['complexity'],
                        })
                      }
                      disabled={lockedQuestions}
                    >
                      <option value="not_defined">Not defined</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                </div>

                <fieldset className="mt-3">
                  <legend className="mb-1.5 text-xs font-medium text-slate-500">
                    Options — select the correct answer
                  </legend>
                  <div className="space-y-2">
                    {q.options.map((opt, oIdx) => (
                      <label
                        key={oIdx}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-1.5 dark:border-white/10"
                      >
                        <input
                          type="radio"
                          name={`correct-${qIdx}`}
                          checked={q.correctIndex === oIdx}
                          onChange={() => updateQuestion(qIdx, { correctIndex: oIdx })}
                          disabled={lockedQuestions}
                          className="h-4 w-4 accent-brand-600"
                        />
                        <span className="w-5 shrink-0 text-xs font-semibold text-slate-500">
                          {String.fromCharCode(65 + oIdx)}
                        </span>
                        <input
                          className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-1 py-1 text-sm outline-none dark:text-slate-100"
                          placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                          value={opt}
                          onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                          disabled={lockedQuestions}
                        />
                        {!lockedQuestions && q.options.length > 2 && (
                          <button
                            type="button"
                            className="text-xs text-slate-400 hover:text-red-600"
                            onClick={(e) => {
                              e.preventDefault();
                              updateQuestion(qIdx, {
                                options: q.options.filter((_, j) => j !== oIdx),
                                correctIndex:
                                  q.correctIndex >= oIdx && q.correctIndex > 0
                                    ? q.correctIndex - 1
                                    : q.correctIndex,
                              });
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {!lockedQuestions && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
                      onClick={() => updateQuestion(qIdx, { options: [...q.options, ''] })}
                    >
                      + Add option
                    </button>
                  )}
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    Marks
                    <input
                      type="number"
                      min={0}
                      className="w-16 rounded-lg border border-slate-200 px-2 py-1 dark:border-white/10 dark:bg-white/5"
                      value={q.marks}
                      onChange={(e) => updateQuestion(qIdx, { marks: Number(e.target.value) })}
                      disabled={lockedQuestions}
                    />
                  </label>
                  <label className="ml-auto flex min-w-0 flex-1 items-center gap-1.5 text-xs text-slate-500 sm:max-w-xs">
                    Figure URL
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 dark:border-white/10 dark:bg-white/5"
                      placeholder="https://…"
                      value={q.imageUrls[0] ?? ''}
                      onChange={(e) =>
                        updateQuestion(qIdx, {
                          imageUrls: e.target.value.trim() ? [e.target.value.trim()] : [],
                        })
                      }
                      disabled={lockedQuestions}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {!lockedQuestions && (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-50 dark:border-white/15 dark:text-brand-300 dark:hover:bg-brand-950/30"
              onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
            >
              + Add question
            </button>
          )}
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !title.trim()}
          >
            {saveMutation.isPending
              ? 'Saving…'
              : editing
                ? 'Save changes'
                : isPublished
                  ? 'Create & publish'
                  : 'Save as draft'}
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
