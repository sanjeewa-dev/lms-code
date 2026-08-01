export type Role = 'superadmin' | 'admin' | 'teacher' | 'student';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  tenantId: string | null;
  tenantSlug: string | null;
  supportSession?: {
    id: string;
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    expiresAt: string;
  } | null;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName?: string | null;
  phone?: string | null;
  subject?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  area?: string | null;
  district?: string | null;
  status?: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string | null;
  isActive: boolean;
  plan?: 'pro' | 'enterprise';
  createdAt: string;
  userCount?: number;
  classCount?: number;
}

export interface TenantStats {
  users: number;
  classes: number;
  students: number;
  teachers: number;
  pendingPayments: number;
}

export interface AdminStats {
  students: number;
  teachers: number;
  classes: number;
  videos: number;
  notices: number;
  events: number;
  quizzes: number;
  attempts: number;
  enrollments: number;
  pendingPayments: number;
  revenue: number;
  openInterventions?: number;
  liveTodayCount?: number;
  draftQuizzes?: number;
}

export type StudentStatus = 'pending' | 'approved' | 'rejected';
export type EnrollmentStatus = 'pending' | 'active' | 'rejected';
export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export interface TenantUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  phones?: string[];
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  area?: string | null;
  district?: string | null;
  address?: string | null;
  freeIdCard?: boolean;
  status?: StudentStatus;
  classes?: string[];
  classEnrollments?: { classId: string; title: string; status: EnrollmentStatus }[];
  createdAt: string;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  subject: string;
  phone: string;
  createdAt: string;
  classes?: { id: string; title: string }[];
}

export interface ClassSummary {
  id: string;
  title: string;
  description: string;
  price: number;
  isPublished: boolean;
  coverImageId?: string | null;
  batch?: { id: string; name: string } | null;
  teacher?: { id: string; name: string };
  studentCount?: number;
  createdAt: string;
}

export interface Enrollment {
  id: string;
  classId: string;
  studentId: string;
  status: EnrollmentStatus;
  payments?: Payment[];
}

export interface Payment {
  id: string;
  enrollmentId: string;
  amount: number;
  paymentType: 'enrollment' | 'monthly';
  forMonth: string;
  forMonthLabel?: string;
  status: PaymentStatus;
  note?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: { id: string; name: string } | null;
  enrollment?: {
    id: string;
    status: EnrollmentStatus;
    student: { id: string; name: string; email: string; regId?: string | null; phone?: string | null };
    class: { id: string; title: string; price: number; teacherId: string };
  };
}

export interface PaymentEnrollmentStatus {
  enrollmentId: string;
  enrollmentStatus: EnrollmentStatus;
  class: { id: string; title: string; price: number };
  payment: Payment | null;
}

export interface Material {
  id: string;
  title: string;
  description: string;
  kind: 'material' | 'assessment';
  pageCount: number;
  viewOnly: boolean;
  fileId?: string | null;
  dueDate?: string | null;
  maxMarks?: number | null;
  createdAt?: string;
}

export interface SubmissionItem {
  id: string;
  assessmentId?: string | null;
  grade?: number | null;
  feedback?: string | null;
  submittedAt: string;
  file?: { originalName: string };
  assessment?: {
    id: string;
    title: string;
    dueDate?: string | null;
    maxMarks?: number | null;
    description?: string;
  } | null;
  student?: { id: string; name: string; email: string };
}

export type MeetingPlatform = 'zoom' | 'teams' | 'google_meet' | 'jitsi';
export type SessionStatus = 'scheduled' | 'live' | 'ended';

export interface ClassSchedule {
  id: string;
  classDate: string;
  classTime: string;
  platform: MeetingPlatform;
  meetingText: string;
  status: SessionStatus;
  roomName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  recordingUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  timeLimitSec: number;
  totalMarks: number;
  questionCount: number;
  isPublished: boolean;
  availableFrom?: string | null;
  availableTo?: string | null;
  myAttempt?: { id: string; submittedAt: string | null; score: number | null } | null;
}

export interface AttemptQuestion {
  id: string;
  text: string;
  options: string[];
  marks: number;
}

export interface AttemptStart {
  attempt: { id: string; startedAt: string };
  quiz: { id: string; title: string; timeLimitSec: number; questions: AttemptQuestion[] };
}

export interface AttemptResult {
  score: number | null;
  totalMarks: number;
  submittedAt?: string;
  correctCount?: number;
  questionCount?: number;
  quizId?: string;
  quizTitle?: string;
  classId?: string;
  questions?: {
    id: string;
    text: string;
    options: string[];
    correctIndex: number;
    selectedIndex: number;
    marks: number;
    explanation?: string | null;
    explanationSteps?: string[] | null;
  }[];
}

export interface QuizLeaderboardEntry {
  rank: number;
  attemptId: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  score: number;
  totalMarks: number;
  percentage: number;
  submittedAt: string | null;
  isMe: boolean;
}

export interface QuizLeaderboard {
  quiz: {
    id: string;
    title: string;
    totalMarks: number;
    attemptCount: number;
  };
  leaderboard: QuizLeaderboardEntry[];
  myPlace: {
    rank: number;
    score: number;
    totalMarks: number;
    percentage: number;
    attemptId: string;
  } | null;
}

export interface Batch {
  id: string;
  name: string;
  year?: number | null;
  classCount?: number;
}

export type VideoProvider = 'youtube' | 'vimeo' | 'url' | 'upload';
export type VideoVisibility = 'all' | 'class' | 'batch';

export interface ClassTopic {
  id: string;
  classId: string;
  title: string;
  sortOrder?: number;
  videoCount?: number;
  class?: { id: string; title: string } | null;
  createdAt?: string;
}

export interface VideoLesson {
  id: string;
  title: string;
  description: string;
  provider: VideoProvider;
  videoUrl?: string;
  visibility: VideoVisibility;
  classId?: string | null;
  batchId?: string | null;
  topicId?: string | null;
  playlistOrder?: number;
  class?: { title: string } | null;
  batch?: { name: string } | null;
  topic?: { id: string; title: string; classId: string } | null;
  createdAt: string;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  scope: 'all' | 'classes';
  publishedAt: string;
  classes?: { id: string; title: string }[];
  isRead?: boolean;
}

export interface EventItem {
  id: string;
  title: string;
  body: string;
  eventDate: string;
  batchLabel?: string | null;
  scope?: 'all' | 'classes';
  isActive?: boolean;
  classes?: { id: string; title: string }[];
}

export interface PublicTenant {
  tenant: { name: string; slug: string; logoUrl?: string | null };
  notices: Notice[];
  events: EventItem[];
  videos: VideoLesson[];
}

export interface ChatPeerClass {
  id: string;
  title: string;
}

export interface ChatContact {
  id: string;
  name: string;
  email: string;
  role: 'teacher' | 'student';
  subtitle?: string;
  classes?: ChatPeerClass[];
}

export interface ChatConversation {
  id: string;
  peer: { id: string; name: string; email: string };
  peerClasses: ChatPeerClass[];
  lastMessage: { body: string; createdAt: string; senderId: string } | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  body: string;
  senderId: string;
  senderName: string;
  readAt: string | null;
  createdAt: string;
  mine: boolean;
}
