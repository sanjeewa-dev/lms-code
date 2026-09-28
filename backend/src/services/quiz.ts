import type { Question } from '@prisma/client';
import { aggregateTopicBreakdown, type TopicBreakdown } from './topicMapping';

export interface SubmittedAnswer {
  questionId: string;
  selectedIndex: number;
}

export interface QuestionScoreRow {
  questionId: string;
  correct: boolean;
  marks: number;
  earned: number;
  topic: string;
}

export interface GradeResult {
  score: number;
  totalMarks: number;
  correctCount: number;
  gradedAnswers: { questionId: string; selectedIndex: number; correct: boolean }[];
  questionScores: QuestionScoreRow[];
  topicBreakdown: TopicBreakdown;
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
  const questionScores: QuestionScoreRow[] = [];

  for (const question of questions) {
    totalMarks += question.marks;
    const selectedIndex = answerMap.get(question.id) ?? -1;
    const correct = selectedIndex === question.correctIndex;
    const topic = (question as Question & { topic?: string }).topic?.trim() || 'General';
    if (correct) {
      score += question.marks;
      correctCount += 1;
    }
    gradedAnswers.push({ questionId: question.id, selectedIndex, correct });
    questionScores.push({
      questionId: question.id,
      correct,
      marks: question.marks,
      earned: correct ? question.marks : 0,
      topic,
    });
  }

  const topicBreakdown = aggregateTopicBreakdown(
    questionScores.map((q) => ({ topic: q.topic, correct: q.correct }))
  );

  return { score, totalMarks, correctCount, gradedAnswers, questionScores, topicBreakdown };
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
