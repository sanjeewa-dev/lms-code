import type { Question } from '@prisma/client';

export interface SubmittedAnswer {
  questionId: string;
  selectedIndex: number;
}

export interface GradeResult {
  score: number;
  totalMarks: number;
  correctCount: number;
  gradedAnswers: { questionId: string; selectedIndex: number; correct: boolean }[];
}

/**
 * Auto-grades a set of submitted answers against the quiz's questions.
 * Unanswered questions are treated as incorrect (selectedIndex = -1).
 */
export function gradeAttempt(
  questions: Question[],
  submitted: SubmittedAnswer[]
): GradeResult {
  const answerMap = new Map(submitted.map((a) => [a.questionId, a.selectedIndex]));

  let score = 0;
  let correctCount = 0;
  let totalMarks = 0;
  const gradedAnswers: GradeResult['gradedAnswers'] = [];

  for (const question of questions) {
    totalMarks += question.marks;
    const selectedIndex = answerMap.get(question.id) ?? -1;
    const correct = selectedIndex === question.correctIndex;
    if (correct) {
      score += question.marks;
      correctCount += 1;
    }
    gradedAnswers.push({ questionId: question.id, selectedIndex, correct });
  }

  return { score, totalMarks, correctCount, gradedAnswers };
}

/**
 * Returns true if the attempt's time budget has elapsed. A timeLimitSec of 0
 * means unlimited time.
 */
export function isAttemptExpired(startedAt: Date, timeLimitSec: number): boolean {
  if (timeLimitSec <= 0) return false;
  const elapsedSec = (Date.now() - startedAt.getTime()) / 1000;
  return elapsedSec > timeLimitSec + 5; // small grace period for network latency
}
