import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentsEngagementRow } from '../../api/quizAnalytics.types';

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function EngagementTable({
  rows,
  loading,
  showClass = false,
  pageSize,
}: {
  rows: StudentsEngagementRow[];
  loading: boolean;
  showClass?: boolean;
  /** When set, table paginates client-side and shows a Prev/Next pager. */
  pageSize?: number;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.studentName.toLowerCase().includes(q) ||
        (r.rollNumber?.toLowerCase().includes(q) ?? false) ||
        (showClass && r.className.toLowerCase().includes(q)),
    );
  }, [rows, search, showClass]);

  // Snap back to page 1 whenever the underlying filter changes so users
  // don't land on an empty trailing page after typing in the search box.
  useEffect(() => {
    setPage(1);
  }, [search, rows.length]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const displayed = pageSize
    ? filtered.slice((page - 1) * pageSize, page * pageSize)
    : filtered;

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Loading roster…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="search"
        placeholder={
          showClass ? 'Search by class, name, or Student ID…' : 'Search by name or Student ID…'
        }
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 dark:border-white/10 dark:bg-ink-850 dark:text-slate-100"
      />
      <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-white/5">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {showClass && <th className="px-4 py-3">Class</th>}
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Student ID</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Avg %</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td
                  colSpan={showClass ? 5 : 4}
                  className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                >
                  No students match your search.
                </td>
              </tr>
            ) : (
              displayed.map((r) => (
                <tr
                  key={`${r.classId}-${r.studentId}`}
                  className="border-t border-slate-50 hover:bg-slate-50/50 dark:border-white/5 dark:hover:bg-white/5"
                >
                  {showClass && (
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{r.className}</td>
                  )}
                  <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                    {r.studentName}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">
                    {r.rollNumber ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                    {r.submittedCount}/{r.expectedAssessments}
                  </td>
                  <td className="px-4 py-2.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {r.averageScorePercent == null ? '—' : `${r.averageScorePercent}%`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageSize && filtered.length > pageSize && (
        <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of{' '}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              ← Prev
            </button>
            <span className="px-2 font-medium text-slate-700 dark:text-slate-200">
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ClassAssessmentsTable({
  rows,
  getQuizHref,
  onOpenQuiz,
  quizLinkBase = '',
}: {
  rows: Array<{
    assessmentId: string;
    quizId?: string;
    title: string;
    submissionCount: number;
    expectedCount: number;
    markedCount: number;
    averageScorePercent: number | null;
  }>;
  /** If provided, renders an Open link using the returned href. */
  getQuizHref?: (quizId: string) => string;
  /** Optional click handler when opening a quiz (used when no href). */
  onOpenQuiz?: (quizId: string) => void;
  /**
   * Optional path prefix; when non-empty and getQuizHref is absent,
   * Open links to `${quizLinkBase}/${quizId}`. Defaults to empty (no Open).
   */
  quizLinkBase?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No quizzes in this class yet.
      </p>
    );
  }

  const resolveHref = (quizId: string): string | null => {
    if (getQuizHref) return getQuizHref(quizId);
    if (quizLinkBase) {
      const base = quizLinkBase.replace(/\/$/, '');
      return `${base}/${quizId}`;
    }
    return null;
  };

  const showOpenCol = Boolean(getQuizHref || onOpenQuiz || quizLinkBase);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-white/10">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-white/5">
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <th className="px-4 py-3">Quiz</th>
            <th className="px-4 py-3">Submissions</th>
            <th className="px-4 py-3">Marked</th>
            <th className="px-4 py-3">Avg %</th>
            {showOpenCol && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const quizId = r.quizId ?? r.assessmentId;
            const href = resolveHref(quizId);
            return (
              <tr
                key={r.assessmentId}
                className="border-t border-slate-50 hover:bg-slate-50/50 dark:border-white/5 dark:hover:bg-white/5"
              >
                <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                  {r.title}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                  {r.submissionCount}/{r.expectedCount}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                  {r.markedCount}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                  {r.averageScorePercent == null ? '—' : `${r.averageScorePercent}%`}
                </td>
                {showOpenCol && (
                  <td className="px-4 py-2.5">
                    {href ? (
                      <Link
                        to={href}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-400"
                      >
                        Open →
                      </Link>
                    ) : onOpenQuiz ? (
                      <button
                        type="button"
                        onClick={() => onOpenQuiz(quizId)}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-400"
                      >
                        Open →
                      </button>
                    ) : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AssessmentSubmissionsTable({
  rows,
}: {
  rows: Array<{
    submissionId: string;
    studentName: string;
    rollNumber: string | null;
    submittedAt: string;
    scorePercent: number | null;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No marked submissions yet.
      </p>
    );
  }
  return (
    <div className="max-h-96 overflow-x-auto overflow-y-auto rounded-xl border border-slate-100 dark:border-white/10">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 dark:bg-white/5">
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Student ID</th>
            <th className="px-4 py-3">Submitted</th>
            <th className="px-4 py-3">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.submissionId} className="border-t border-slate-50 dark:border-white/5">
              <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                {r.studentName}
              </td>
              <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                {r.rollNumber ?? '—'}
              </td>
              <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                {formatShortDate(r.submittedAt)}
              </td>
              <td className="px-4 py-2.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {r.scorePercent == null ? '—' : `${r.scorePercent}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StudentAssessmentsTable({
  rows,
  getQuizHref,
}: {
  rows: Array<{
    assessmentId: string;
    quizId?: string;
    title: string;
    className: string | null;
    submittedAt: string;
    scorePercent: number | null;
    classAveragePercent: number | null;
    submissionId: string;
  }>;
  /** Optional; when absent, quiz titles render as plain text. */
  getQuizHref?: (quizId: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No submissions yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400">
            <th className="px-4 py-3">Quiz</th>
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3">Submitted</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Class average</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const delta =
              r.scorePercent != null && r.classAveragePercent != null
                ? Math.round((r.scorePercent - r.classAveragePercent) * 10) / 10
                : null;
            const deltaTone =
              delta == null
                ? 'text-slate-400'
                : delta > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : delta < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400';
            const quizId = r.quizId ?? r.assessmentId;
            const href = getQuizHref?.(quizId);
            return (
              <tr key={r.submissionId} className="border-t border-slate-50 dark:border-white/5">
                <td className="px-4 py-2.5">
                  {href ? (
                    <Link
                      to={href}
                      className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {r.title}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900 dark:text-slate-100">{r.title}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                  {r.className ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                  {formatShortDate(r.submittedAt)}
                </td>
                <td className="px-4 py-2.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {r.scorePercent == null ? '—' : `${r.scorePercent}%`}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                  {r.classAveragePercent == null ? (
                    '—'
                  ) : (
                    <span>
                      {r.classAveragePercent}%
                      {delta != null && (
                        <span className={`ml-1.5 text-[11px] font-medium ${deltaTone}`}>
                          ({delta > 0 ? '+' : ''}
                          {delta})
                        </span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RecentActivityTimeline({
  items,
}: {
  items: Array<{
    submissionId: string;
    type: string;
    assessmentTitle: string;
    className: string | null;
    at: string;
    scorePercent: number | null;
  }>;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No recent activity.</p>;
  }
  return (
    <ol className="space-y-2">
      {items.map((item) => (
        <li
          key={item.submissionId}
          className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-white/10"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900 dark:text-slate-100">
              {item.assessmentTitle}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {item.type === 'graded' ? 'Graded' : 'Submitted'}
              {item.className ? ` · ${item.className}` : ''} · {formatShortDate(item.at)}
            </p>
          </div>
          {item.scorePercent != null && (
            <span className="text-xs font-bold tabular-nums text-brand-700 dark:text-brand-400">
              {item.scorePercent}%
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
