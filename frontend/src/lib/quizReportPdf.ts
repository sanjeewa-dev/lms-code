import { jsPDF } from 'jspdf';

type Report = {
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

export function downloadQuizReportPdf(report: Report) {
  const doc = new jsPDF();
  let y = 16;
  const line = (text: string, size = 11) => {
    doc.setFontSize(size);
    doc.text(text, 14, y);
    y += size * 0.55 + 4;
    if (y > 280) {
      doc.addPage();
      y = 16;
    }
  };

  line(report.quiz.title, 16);
  line(`${report.quiz.classTitle} · ${report.quiz.questionCount} questions · ${report.quiz.totalMarks} marks`, 10);
  line(
    `Attempts: ${report.attemptCount} · Class average: ${
      report.averagePercentage != null ? `${report.averagePercentage}%` : '—'
    }`,
    11
  );
  y += 4;
  line('Topic mastery', 13);
  if (!report.topicMastery.length) line('No topic data yet.', 10);
  for (const t of report.topicMastery) {
    line(`${t.topic}: ${t.percentage}% (${t.correct}/${t.total})`, 10);
  }
  y += 4;
  line('Leaderboard', 13);
  for (const row of report.leaderboard.slice(0, 40)) {
    line(
      `#${row.rank} ${row.studentName} — ${row.score ?? 0} (${row.percentage ?? 0}%)`,
      10
    );
  }

  const safe = report.quiz.title.replace(/[^\w\-]+/g, '_').slice(0, 40);
  doc.save(`${safe}_quiz_report.pdf`);
}
