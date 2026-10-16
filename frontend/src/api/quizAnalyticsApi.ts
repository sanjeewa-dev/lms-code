import type { AxiosRequestConfig } from 'axios';
import type {
  ClassOverviewResponse,
  CohortLeaderboardResponse,
  CohortOverviewResponse,
  CohortScoreDistributionResponse,
  QuizDetailResponse,
  StudentDetailResponse,
  StudentMasteryResponse,
  StudentProgressResponse,
  StudentsEngagementResponse,
  TeacherAnalyticsDashboard,
  TrendSeriesResponse,
} from './quizAnalytics.types';

type TenantClient = {
  get: <T = unknown>(path: string, config?: AxiosRequestConfig) => Promise<{ data: T }>;
};

/** Thin helpers around tenant API for ScoreSmart-parity analytics. */
export function createQuizAnalyticsApi(t: TenantClient) {
  return {
    getDashboard: () => t.get<TeacherAnalyticsDashboard>('/quiz-analytics').then((r) => r.data),
    getTrends: (params: {
      classId?: string;
      quizId?: string;
      studentId?: string;
      topic?: string;
    }) =>
      t
        .get<TrendSeriesResponse>('/quiz-analytics/trends', { params })
        .then((r) => r.data),
    getClassOverview: (classId: string) =>
      t
        .get<ClassOverviewResponse>('/quiz-analytics/class-overview', { params: { classId } })
        .then((r) => r.data),
    getStudentsEngagement: (params?: { classId?: string; page?: number; pageSize?: number }) =>
      t
        .get<StudentsEngagementResponse>('/quiz-analytics/students-engagement', { params })
        .then((r) => r.data),
    getQuizDetail: (quizId: string) =>
      t
        .get<{ detail: QuizDetailResponse }>(`/quiz-analytics/quizzes/${quizId}/detail`)
        .then((r) => r.data.detail),
    getStudentDetail: (studentId: string, params?: { classId?: string }) =>
      t
        .get<StudentDetailResponse>(`/quiz-analytics/student/${studentId}`, { params })
        .then((r) => r.data),
    getCohortOverview: (params?: { classId?: string }) =>
      t
        .get<CohortOverviewResponse>('/quiz-analytics/cohort-overview', { params })
        .then((r) => r.data),
    getLeaderboard: (params?: { classId?: string; quizId?: string; size?: number }) =>
      t
        .get<CohortLeaderboardResponse>('/quiz-analytics/leaderboard', { params })
        .then((r) => r.data),
    getScoreDistribution: (params?: { classId?: string; quizId?: string }) =>
      t
        .get<CohortScoreDistributionResponse>('/quiz-analytics/score-distribution', { params })
        .then((r) => r.data),
    getMyMastery: (params?: { classId?: string; studentId?: string }) =>
      t
        .get<StudentMasteryResponse>('/quiz-analytics/my-mastery', { params })
        .then((r) => r.data),
    getMyProgress: (params?: { classId?: string; studentId?: string }) =>
      t
        .get<StudentProgressResponse>('/quiz-analytics/my-progress', { params })
        .then((r) => r.data),
  };
}

export type QuizAnalyticsApi = ReturnType<typeof createQuizAnalyticsApi>;

