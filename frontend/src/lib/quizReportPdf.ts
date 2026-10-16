import { jsPDF } from 'jspdf';
import type { QuizDetailResponse } from '../api/quizAnalytics.types';

type LegacyReport = {
  quiz: { title: string; totalMarks: number; classTitle: string; questionCount: number };
  attemptCount: number;
  averagePercentage: number | null;
  topicMastery: { topic: string; correct: number; total: number; percentage: number }[];
  leaderboard: {
    rank: number;
    studentName: string;
    score: number | null;
    percentage: number | null;
  }[];
};

function writeLines(doc: jsPDF, startY: number) {
  let y = startY;
  const line = (text: string, size = 11) => {
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(text, 180);
    for (const row of wrapped) {
      doc.text(row, 14, y);
      y += size * 0.45 + 3;
      if (y > 280) {
        doc.addPage();
        y = 16;
      }
    }
  };
  return { line, getY: () => y, setY: (n: number) => { y = n; } };
}

/** Legacy thin report (still used by older callers). */
export function downloadQuizReportPdf(report: LegacyReport) {
  const doc = new jsPDF();
  const { line } = writeLines(doc, 16);
  line(report.quiz.title, 16);
  line(
    `${report.quiz.classTitle} · ${report.quiz.questionCount} questions · ${report.quiz.totalMarks} marks`,
    10
  );
  line(
    `Attempts: ${report.attemptCount} · Class average: ${
      report.averagePercentage != null ? `${report.averagePercentage}%` : '—'
    }`,
    11
  );
  line('Topic mastery', 13);
  if (!report.topicMastery.length) line('No topic data yet.', 10);
  for (const t of report.topicMastery) {
    line(`${t.topic}: ${t.percentage}% (${t.correct}/${t.total})`, 10);
  }
  line('Leaderboard', 13);
  for (const row of report.leaderboard.slice(0, 40)) {
    line(`#${row.rank} ${row.studentName} — ${row.score ?? 0} (${row.percentage ?? 0}%)`, 10);
  }
  const safe = report.quiz.title.replace(/[^\w\-]+/g, '_').slice(0, 40);
  doc.save(`${safe}_quiz_report.pdf`);
}

/** ScoreSmart-style multi-section analytics PDF from quiz detail payload. */
export function downloadQuizAnalyticsPdf(detail: QuizDetailResponse) {
  const doc = new jsPDF();
  const { line } = writeLines(doc, 16);

  line(detail.quiz.title, 16);
  line(
    `${detail.quiz.className} · ${detail.quiz.totalQuestions} questions · ${detail.quiz.totalMarks} marks`,
    10
  );
  line(
    `Submissions: ${detail.kpis.submissions}/${detail.kpis.expectedSubmissions} · Marked: ${detail.kpis.markedCount} · Avg: ${
      detail.kpis.averageScorePercent != null ? `${detail.kpis.averageScorePercent}%` : '—'
    } · Pass rate: ${
      detail.kpis.passRatePercent != null ? `${detail.kpis.passRatePercent}%` : '—'
    }`,
    10
  );

  line('Score distribution', 13);
  for (const b of detail.scoreDistribution.bands) {
    line(`${b.band}: ${b.count}`, 10);
  }
  line(
    `High ${detail.scoreDistribution.highestScorePercent ?? '—'}% · Low ${
      detail.scoreDistribution.lowestScorePercent ?? '—'
    }% · Median ${detail.scoreDistribution.medianScorePercent ?? '—'}%`,
    10
  );

  line('Question performance', 13);
  const hardest = [...detail.questionDifficulty].sort(
    (a, b) => a.correctRatePercent - b.correctRatePercent
  );
  for (const q of hardest.slice(0, 25)) {
    line(
      `Q${q.questionNumber} [${q.topic}] ${q.correctRatePercent}% (${q.correctCount}/${q.totalAttempts}) — ${q.prompt.slice(0, 80)}`,
      9
    );
  }

  line('Topic mastery', 13);
  if (!detail.topicMastery.length) line('No topic data yet.', 10);
  for (const t of detail.topicMastery) {
    line(`${t.topic}: ${t.percentage}% (${t.correct}/${t.total})`, 10);
  }

  line('Student marks', 13);
  detail.submissions.forEach((s, i) => {
    line(
      `#${i + 1} ${s.studentName} — ${s.earned ?? 0}/${s.possible} (${s.scorePercent ?? 0}%)`,
      10
    );
  });

  const safe = detail.quiz.title.replace(/[^\w\-]+/g, '_').slice(0, 40);
  doc.save(`${safe}_analytics_report.pdf`);
}
