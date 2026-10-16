/** ScoreSmart-shaped analytics types mapped onto Mindspark quizzes/attempts. */

export type TopicTrend = 'up' | 'down' | 'flat';

export interface TopicAggregateRow {
  topic: string;
  correct: number;
  total: number;
  percentage: number;
  trend?: TopicTrend;
}

export interface TeacherAnalyticsSummary {
  classCount: number;
  assessmentCount: number;
  quizCount?: number;
  totalSubmissions: number;
  gradedSubmissions: number;
  averageScorePercent: number | null;
  pendingManualReview: number;
}

export interface ScoreDistributionRow {
  band: string;
  count: number;
}

export interface ClassTopPerformer {
  studentId: string;
  studentName: string;
  scorePercent: number;
  papersGraded: number;
}

export interface ClassTopPerformersGroup {
  classId: string;
  className: string;
  students: ClassTopPerformer[];
}

export interface AnalyticsFilterClass {
  id: string;
  name: string;
}

export interface AnalyticsFilterStudent {
  id: string;
  fullName: string;
  classIds: string[];
}

export interface AnalyticsFilterQuiz {
  id: string;
  title: string;
  classId: string | null;
  className: string | null;
  lastGradedAt?: string | null;
}

export interface TeacherAnalyticsDashboard {
  summary: TeacherAnalyticsSummary;
  scoreDistribution: ScoreDistributionRow[];
  byAssessment: Array<{
    assessmentId: string;
    quizId?: string;
    title: string;
    className: string | null;
    gradedCount: number;
    averageScorePercent: number | null;
  }>;
  topicAggregate: TopicAggregateRow[];
  topicAggregateByAssessmentId: Record<string, TopicAggregateRow[]>;
  recentGrades: Array<{
    submissionId: string;
    attemptId?: string;
    studentName: string;
    assessmentTitle: string;
    quizTitle?: string;
    className: string | null;
    scorePercent: number;
    gradedAt: string;
  }>;
  topPerformersByClass: ClassTopPerformersGroup[];
  filterOptions: {
    classes: AnalyticsFilterClass[];
    assessments: AnalyticsFilterQuiz[];
    quizzes?: AnalyticsFilterQuiz[];
    students: AnalyticsFilterStudent[];
    topics: string[];
    topicsByAssessmentId: Record<string, string[]>;
  };
}

export type TrendSeriesMode = 'cohort_submissions' | 'student_submissions';

export interface TrendPoint {
  at: string;
  scorePercent: number;
  sampleCount?: number;
  assessmentTitle: string;
  assessmentId: string;
  quizId?: string;
  quizTitle?: string;
}

export interface TrendSeriesResponse {
  seriesMode: TrendSeriesMode;
  points: TrendPoint[];
}

export interface CohortPerformer {
  studentId: string;
  studentName: string;
  rollNumber: string | null;
  scorePercent: number;
  papersGraded: number;
  earned: number | null;
  possible: number | null;
  assessmentId: string | null;
  assessmentTitle: string | null;
  quizId?: string | null;
  quizTitle?: string | null;
}

export interface CohortLeaderboardResponse {
  scope: 'single_assessment' | 'all_assessments';
  assessmentId: string | null;
  assessmentTitle: string | null;
  quizId?: string | null;
  quizTitle?: string | null;
  size: number;
  totalPerformers: number;
  top: CohortPerformer[];
  bottom: CohortPerformer[];
}

export interface CohortScoreDistributionBand {
  band: string;
  min: number;
  max: number;
  count: number;
}

export interface CohortScoreDistributionResponse {
  scope: 'single_assessment' | 'all_assessments';
  assessmentId: string | null;
  assessmentTitle: string | null;
  quizId?: string | null;
  quizTitle?: string | null;
  classId?: string | null;
  gradedCount: number;
  averageScorePercent: number | null;
  medianScorePercent?: number | null;
  highestScorePercent: number | null;
  lowestScorePercent: number | null;
  passCount: number;
  passRatePercent: number | null;
  bands: CohortScoreDistributionBand[];
  histogram?: CohortScoreDistributionBand[];
}

export interface ClassOverviewResponse {
  classId: string;
  className: string;
  kpis: {
    enrolledStudents: number;
    totalAssessments: number;
    totalQuizzes?: number;
    activeAssessments: number;
    submissionRatePercent: number | null;
    averageScorePercent: number | null;
    passRatePercent: number | null;
  };
  funnel: {
    expected: number;
    submitted: number;
    marked: number;
    reviewInProgress: number;
    failed: number;
  };
  topPerformers: CohortPerformer[];
  bottomPerformers: CohortPerformer[];
  scoreDistribution: CohortScoreDistributionResponse;
  topicMastery: TopicAggregateRow[];
  assessments: Array<{
    assessmentId: string;
    quizId?: string;
    title: string;
    status: string;
    startTime: string | null;
    submissionCount: number;
    expectedCount: number;
    markedCount: number;
    averageScorePercent: number | null;
    passRatePercent: number | null;
  }>;
  quizzes?: ClassOverviewResponse['assessments'];
}

export interface StudentsEngagementRow {
  studentId: string;
  studentName: string;
  rollNumber: string | null;
  classId: string;
  className: string;
  expectedAssessments: number;
  submittedCount: number;
  markedCount: number;
  averageScorePercent: number | null;
  lastActivityAt: string | null;
  trend: 'up' | 'down' | 'flat' | null;
}

export interface StudentsEngagementResponse {
  total: number;
  page: number;
  pageSize: number;
  rows: StudentsEngagementRow[];
}

export interface QuizDetailResponse {
  assessment: {
    id: string;
    title: string;
    classId: string | null;
    className: string | null;
    totalQuestions: number;
    status: string;
    startTime: string | null;
    endTime: string | null;
  };
  quiz: {
    id: string;
    title: string;
    classId: string;
    className: string;
    totalQuestions: number;
    totalMarks: number;
    status: string;
    startTime: string | null;
    endTime: string | null;
  };
  kpis: {
    totalQuestions: number;
    submissions: number;
    expectedSubmissions: number;
    markedCount: number;
    averageScorePercent: number | null;
    passRatePercent: number | null;
    pendingReview: number;
  };
  pipeline: {
    submitted: number;
    marked: number;
    reviewInProgress: number;
    failed: number;
    expected: number;
  };
  scoreDistribution: CohortScoreDistributionResponse;
  leaderboard: CohortLeaderboardResponse | null;
  questionDifficulty: Array<{
    questionId: string;
    questionNumber: number;
    prompt: string;
    topic: string;
    correctCount: number;
    totalAttempts: number;
    correctRatePercent: number;
  }>;
  topicMastery: TopicAggregateRow[];
  submissions: Array<{
    submissionId: string;
    attemptId: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    scorePercent: number | null;
    earned: number | null;
    possible: number;
    submittedAt: string | null;
    status: string;
  }>;
  questions: Array<{ id: string; text: string; topic: string; marks: number; order: number }>;
}

export interface StudentDetailResponse {
  profile: {
    studentId: string;
    fullName: string;
    email: string;
    classes: Array<{ id: string; name: string }>;
  };
  kpis: {
    papersGraded: number;
    averageScorePercent: number | null;
    bestScorePercent: number | null;
    latestScorePercent: number | null;
    needsAttention: boolean;
  };
  improvement: { delta: number | null; label: string };
  topicMastery: TopicAggregateRow[];
  strengths: TopicAggregateRow[];
  weaknesses: TopicAggregateRow[];
  studentVsCohort: Array<{
    assessmentId: string;
    assessmentTitle: string;
    quizId?: string;
    quizTitle?: string;
    studentPercent: number | null;
    cohortPercent: number | null;
  }>;
  assessments: Array<{
    assessmentId: string;
    assessmentTitle: string;
    quizId?: string;
    quizTitle?: string;
    className: string;
    scorePercent: number | null;
    earned: number | null;
    possible: number;
    submittedAt: string | null;
  }>;
  recentActivity: Array<{
    at: string;
    label: string;
    assessmentTitle: string;
    scorePercent: number | null;
  }>;
}

export interface CohortOverviewResponse {
  kpis: {
    activeStudents: number;
    cohortAveragePercent: number | null;
    studentsNeedingAttention: number;
  };
  needingAttention: StudentsEngagementRow[];
  engagement: StudentsEngagementRow[];
}

export interface StudentMasteryResponse {
  attempts: Array<{
    attemptId: string;
    quizId: string;
    quizTitle: string;
    classId: string;
    classTitle?: string;
    score: number | null;
    totalMarks: number;
    percentage: number | null;
    submittedAt: string | null;
    topicBreakdown: unknown;
    outcome?: { correct: number; wrong: number; unanswered: number };
  }>;
  topicMastery: TopicAggregateRow[];
  summary?: {
    attemptCount: number;
    averagePercentage: number | null;
    completedCount: number;
    bestPercentage?: number | null;
    latestPercentage?: number | null;
    deltaFromPrevious?: number | null;
    streak?: number;
    outcomeMix: { correct: number; wrong: number; unanswered: number };
  };
}

export type CohortBand = 'top_25' | 'mid' | 'bottom_25';

export interface StudentProgressResponse {
  summary: {
    attemptCount: number;
    averagePercentage: number | null;
    completedCount: number;
    bestPercentage: number | null;
    latestPercentage: number | null;
    deltaFromPrevious: number | null;
    streak: number;
    outcomeMix: { correct: number; wrong: number; unanswered: number };
    publishedQuizCount: number;
    quizzesAvailable: number;
    unansweredRate: number;
  };
  focusTopics: Array<{
    topic: string;
    percentage: number;
    missCount: number;
    total: number;
    trend: TopicTrend;
  }>;
  improvingTopics: Array<{
    topic: string;
    percentage: number;
    total: number;
    trend: TopicTrend;
  }>;
  nextActions: {
    pendingQuizzes: Array<{
      id: string;
      title: string;
      classId: string;
      classTitle: string;
      questionCount: number;
      totalMarks: number;
    }>;
    reviewAttempt: {
      attemptId: string;
      quizId: string;
      quizTitle: string;
      percentage: number | null;
      classId: string;
    } | null;
  };
  cohort: Array<{
    classId: string;
    classTitle: string;
    studentAveragePercent: number | null;
    classAveragePercent: number | null;
    band: CohortBand | null;
    peerCount: number;
    visible: boolean;
  }>;
  consistency: {
    completedCount: number;
    publishedCount: number;
    unansweredRate: number;
  };
}
