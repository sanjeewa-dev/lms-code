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
  school?: string | null;
  address?: string | null;
  shippingLabelPhotoUrl?: string | null;
  shippingLabelPhotoOnly?: boolean;
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
  school?: string | null;
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
  address?: string;
  createdAt: string;
  classes?: { id: string; title: string }[];
}

export interface ClassSummary {
  id: string;
  title: string;
  description: string;
  subject?: string;
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
  feeWaiverAmount?: number;
  payments?: Payment[];
}

export interface Payment {
  id: string;
  enrollmentId: string;
  materialId?: string | null;
  amount: number;
  paymentType: 'enrollment' | 'monthly' | 'material';
  forMonth: string;
  forMonthLabel?: string;
  status: PaymentStatus;
  note?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: { id: string; name: string } | null;
  material?: {
    id: string;
    title: string;
    price: number;
    classId: string;
  } | null;
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

export type MaterialPurchaseStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface Material {
  id: string;
  title: string;
  description: string;
  kind: 'material' | 'assessment';
  pageCount: number;
  viewOnly: boolean;
  fileId?: string | null;
  classId?: string;
  price?: number;
  published?: boolean;
  purchaseStatus?: MaterialPurchaseStatus;
  canPreview?: boolean;
  hasFile?: boolean;
  dueDate?: string | null;
  maxMarks?: number | null;
  createdAt?: string;
}

export interface MaterialPaymentItem {
  materialId: string;
  title: string;
  description: string;
  price: number;
  pageCount: number;
  hasFile: boolean;
  classId: string;
  classTitle: string;
  enrollmentId: string;
  purchaseStatus: MaterialPurchaseStatus;
  canPreview: boolean;
  payment: Payment | null;
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
  hasExternalMeetingLink: boolean;
  externalMeetingUrl?: string | null;
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
  topic?: string;
  images?: { id: string; imageUrl: string }[];
}

export interface AttemptStart {
  attempt: { id: string; startedAt: string };
  quiz: {
    id: string;
    title: string;
    timeLimitSec: number;
    navigationMode?: string;
    shuffleQuestions?: boolean;
    timeRemindersMinutes?: number[];
    questions: AttemptQuestion[];
  };
}

export interface TopicBreakdownStat {
  correct: number;
  total: number;
  percentage: number;
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
  topicBreakdown?: Record<string, TopicBreakdownStat> | null;
  questions?: {
    id: string;
    text: string;
    options: string[];
    correctIndex: number;
    selectedIndex: number;
    marks: number;
    topic?: string;
    images?: { id: string; imageUrl: string }[];
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
  tenant: {
    name: string;
    slug: string;
    logoUrl?: string | null;
    selfEnrollmentEnabled?: boolean;
  };
  notices: Notice[];
  events: EventItem[];
  videos: VideoLesson[];
}

export type SelfEnrollmentAudience = 'all_students' | 'batches' | 'enrolled_in_classes';

export type SelfEnrollmentScope = 'all_classes' | 'selected_classes';

export interface SelfEnrollmentRule {
  targetClassId: string;
  audience: SelfEnrollmentAudience;
  sourceClassIds: string[];
  sourceBatchIds: string[];
}

export interface SelfEnrollmentSettings {
  enabled: boolean;
  scope: SelfEnrollmentScope;
  rules: SelfEnrollmentRule[];
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

export type MaterialOrderStatus =
  | 'approval_pending'
  | 'active'
  | 'processing'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

export interface MaterialOrderItem {
  id: string;
  paymentId: string;
  materialId: string;
  classId: string;
  materialTitle: string;
  classTitle: string;
  amount: number;
  teacherId?: string | null;
  teacher?: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    shippingLabelPhotoFileId?: string | null;
    shippingLabelPhotoOnly?: boolean;
  } | null;
}

export interface MaterialOrder {
  id: string;
  orderNo: string;
  shippingLabelNo: string | null;
  status: MaterialOrderStatus;
  recipientName: string;
  email: string;
  phone: string;
  address: string;
  grade: string;
  remarks: string | null;
  slipFileId: string;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  cancelledAt: string | null;
  cancelledBy: { id: string; name: string } | null;
  cancelNote: string | null;
  materials: string[];
  relatedClasses: string[];
  items: MaterialOrderItem[];
  student: { id: string; name: string; email: string; phone: string | null } | null;
}

