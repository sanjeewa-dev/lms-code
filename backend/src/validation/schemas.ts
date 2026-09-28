import { z } from 'zod';
import { passwordSchema } from './password';

// --- Auth ---
export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: passwordSchema,
  /** Required — students must enroll in a published class at registration. */
  classId: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  tenantSlug: z.string().min(1).optional(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// --- Platform (superadmin) ---
export const createTenantSchema = z.object({
  name: z.string().min(2).max(150),
  logoUrl: z.string().url().optional(),
  /** First institute admin — invited by email to complete name + password setup. */
  admin: z.object({
    email: z.string().email(),
  }),
});

export const updatePlatformUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  logoUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
  plan: z.enum(['pro', 'enterprise']).optional(),
  planFeatures: z
    .object({
      aiStudent: z.boolean().optional(),
      aiTeacher: z.boolean().optional(),
      parentTrust: z.boolean().optional(),
      interventions: z.boolean().optional(),
      smartJobs: z.boolean().optional(),
      maxStudents: z.number().int().positive().nullable().optional(),
      aiTokenLimit: z.number().int().positive().optional(),
    })
    .optional(),
});

export const selfEnrollmentRuleSchema = z.object({
  targetClassId: z.string().min(1),
  audience: z.enum(['all_students', 'batches', 'enrolled_in_classes']),
  sourceClassIds: z.array(z.string().min(1)).optional(),
  sourceBatchIds: z.array(z.string().min(1)).optional(),
});

export const selfEnrollmentSettingsSchema = z.object({
  enabled: z.boolean(),
  scope: z.enum(['all_classes', 'selected_classes']),
  rules: z.array(selfEnrollmentRuleSchema).optional(),
});

export const instituteSettingsSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  logoUrl: z
    .union([z.string().url(), z.string().startsWith('/api/'), z.literal(''), z.null()])
    .optional(),
  contactEmail: z.string().email().nullable().optional().or(z.literal('')),
  contactPhone: z.string().max(40).nullable().optional(),
  bankName: z.string().max(120).nullable().optional(),
  bankAccountName: z.string().max(120).nullable().optional(),
  bankAccountNumber: z.string().max(60).nullable().optional(),
  bankBranch: z.string().max(120).nullable().optional(),
  paymentInstructions: z.string().max(5000).nullable().optional(),
  graceDays: z.coerce.number().int().min(0).max(28).optional(),
  requireMonthlyPayment: z.boolean().optional(),
  payhereMerchantId: z.string().max(120).nullable().optional(),
  payhereMerchantSecret: z.string().max(200).nullable().optional(),
  payhereEnabled: z.boolean().optional(),
  selfEnrollment: selfEnrollmentSettingsSchema.optional(),
});

export const createTenantAdminSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  /** Optional — omit so password is never set/shown; use override to assign one. */
  password: passwordSchema.optional(),
});

/** Superadmin invites an institute admin by email; they complete setup via link. */
export const inviteTenantAdminSchema = z.object({
  email: z.string().email(),
});

export const adminOnboardingSchema = z
  .object({
    name: z.string().min(2).max(100),
    password: passwordSchema,
    confirmPassword: z.string().max(100),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/** Superadmin override of an institute admin password (never returns the old password). */
export const overrideTenantAdminPasswordSchema = z.object({
  password: passwordSchema,
  /** Client must send true after an explicit confirm step. */
  confirm: z.literal(true),
});

// --- Teachers (managed by tenant admins) ---
export const teacherCreateSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: passwordSchema,
  subject: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(500).optional(),
  classIds: z.array(z.string().min(1)).optional(),
});

export const teacherUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  password: passwordSchema.optional(),
  subject: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(500).optional().nullable(),
  classIds: z.array(z.string().min(1)).optional(),
});

// --- Profile (self-service) ---
export const profileUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional().nullable(),
  subject: z.string().max(120).optional().nullable(),
  guardianName: z.string().max(100).optional().nullable(),
  guardianPhone: z.string().max(40).optional().nullable(),
  guardianEmail: z.string().email().optional().nullable().or(z.literal('')),
  area: z.string().max(100).optional().nullable(),
  district: z.string().max(100).optional().nullable(),
  school: z.string().max(200).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  shippingLabelPhotoOnly: z.coerce.boolean().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// --- Classes ---
export const classSchema = z.object({
  title: z.string().min(2).max(150),
  description: z.string().max(5000).optional(),
  /** Class subject — used with teacher (+ batch grade) for question banks. */
  subject: z.string().min(1).max(120),
  price: z.coerce.number().min(0).default(0),
  batchId: z.string().optional(),
  isPublished: z.coerce.boolean().optional(),
  /** Institute admin may assign / reassign the class teacher. */
  teacherId: z.string().min(1).optional(),
});

// Admin/teacher adds a student directly to a class (creates the account if new).
export const classStudentSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: passwordSchema,
});

// Invite a student to a class (no password — student completes onboarding via email link).
export const studentInviteSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  phones: z.array(z.string().max(40)).max(5).optional(),
  guardianName: z.string().max(100).optional(),
  guardianPhone: z.string().max(40).optional(),
  area: z.string().max(120).optional(),
  district: z.string().max(80).optional(),
  school: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  freeIdCard: z.coerce.boolean().optional(),
  feeWaiverAmount: z.coerce.number().min(0).max(1_000_000).optional(),
});

export const enrollExistingStudentSchema = z.object({
  studentId: z.string().min(1),
  freeIdCard: z.coerce.boolean().optional(),
  feeWaiverAmount: z.coerce.number().min(0).max(1_000_000).optional(),
});

export const studentOnboardingSchema = z
  .object({
    phone: z.string().max(40).optional(),
    phones: z.array(z.string().max(40)).max(5).optional(),
    guardianName: z.string().min(2).max(100),
    guardianPhone: z.string().min(7).max(40),
    area: z.string().min(2).max(120),
    district: z.string().min(2).max(80),
    school: z.string().max(200).optional().or(z.literal('')),
    address: z.string().min(3).max(500),
    password: passwordSchema,
    confirmPassword: z.string().max(100),
  })
  .superRefine((d, ctx) => {
    const phones = (d.phones ?? []).map((p) => p.trim()).filter(Boolean);
    const primary = d.phone?.trim();
    if (phones.length === 0 && (!primary || primary.length < 7)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one telephone number is required',
        path: ['phones'],
      });
    }
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const studentFreeCardSchema = z.object({
  freeIdCard: z.boolean(),
});

/** Staff update of student contact / guardian details from class roster. */
export const studentUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional().nullable(),
  phones: z.array(z.string().max(40)).max(5).optional(),
  guardianName: z.string().max(100).optional().nullable(),
  guardianPhone: z.string().max(40).optional().nullable(),
  guardianEmail: z.string().email().optional().nullable().or(z.literal('')),
  area: z.string().max(120).optional().nullable(),
  district: z.string().max(80).optional().nullable(),
  school: z.string().max(200).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  freeIdCard: z.coerce.boolean().optional(),
});

/** Per-enrollment fee assistance (free card) — amount waived from class.price. */
export const enrollmentFeeWaiverSchema = z.object({
  feeWaiverAmount: z.coerce.number().min(0).max(1_000_000),
  freeIdCard: z.coerce.boolean().optional(),
});

/** Self-register via a reusable class invite link. */
export const classJoinRegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: passwordSchema,
});

// --- Payments ---
export const paymentSchema = z.object({
  // Amount is ignored server-side; net class fee (price − waiver) is authoritative.
  amount: z.coerce.number().min(0).optional(),
  forMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM format'),
});

/** One bank slip covering one or more class enrollments for the same month. */
export const multiPaymentSchema = z.object({
  forMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM format'),
  enrollmentIds: z
    .union([z.array(z.string().min(1)), z.string().min(1)])
    .transform((v) => (Array.isArray(v) ? v : v.split(',').map((s) => s.trim()).filter(Boolean)))
    .pipe(z.array(z.string().min(1)).min(1).max(50)),
});

/** Staff submission when a student sends a bank slip through another channel. */
export const staffPaymentSlipSchema = z.object({
  enrollmentId: z.string().min(1),
  forMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM format'),
});

export const reviewPaymentSchema = z.object({
  note: z.string().max(1000).optional(),
});

export const attendanceMarkSchema = z.object({
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduleId: z.string().optional(),
  records: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(['present', 'absent', 'late', 'excused']),
        note: z.string().max(500).optional(),
      })
    )
    .min(1),
});

export const payhereInitSchema = z.object({
  enrollmentId: z.string().min(1),
  forMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

// --- Materials ---
export const materialSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  kind: z.enum(['material', 'assessment']).default('material'),
  dueDate: z.coerce.date().optional(),
  maxMarks: z.coerce.number().min(0).optional(),
  price: z.coerce.number().min(0).optional(),
  published: z
    .union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === 'boolean') return v;
      return v === 'true' || v === '1';
    }),
});

/** One bank slip covering one or more paid class materials. */
export const materialPaymentSlipSchema = z.object({
  materialIds: z
    .union([z.array(z.string().min(1)), z.string().min(1)])
    .transform((v) => (Array.isArray(v) ? v : v.split(',').map((s) => s.trim()).filter(Boolean)))
    .pipe(z.array(z.string().min(1)).min(1).max(50)),
});

// --- Submissions ---
export const gradeSubmissionSchema = z.object({
  grade: z.coerce.number().min(0),
  feedback: z.string().max(2000).optional(),
});

// --- Quizzes ---
export const questionInputSchema = z.object({
  text: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(8),
  correctIndex: z.coerce.number().int().min(0),
  marks: z.coerce.number().min(0).default(1),
  topic: z.string().min(1).max(120).default('General'),
  quizTopicId: z.string().min(1).nullable().optional(),
  complexity: z.enum(['not_defined', 'low', 'medium', 'high']).default('not_defined'),
  imageUrls: z.array(z.string().min(1)).max(5).optional(),
  sourceBankItemId: z.string().min(1).optional(),
});

export const quizSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    timeLimitSec: z.coerce.number().int().min(0).default(0),
    availableFrom: z.coerce.date().optional(),
    availableTo: z.coerce.date().optional(),
    isPublished: z.coerce.boolean().optional(),
    shuffleQuestions: z.coerce.boolean().optional(),
    navigationMode: z.enum(['bidirectional', 'unidirectional']).optional(),
    timeRemindersMinutes: z.array(z.coerce.number().int().positive()).max(6).optional(),
    questions: z.array(questionInputSchema).min(1),
  })
  .refine((data) => data.questions.every((q) => q.correctIndex < q.options.length), {
    message: 'correctIndex must be within the options range',
    path: ['questions'],
  });

export const quizUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    timeLimitSec: z.coerce.number().int().min(0).optional(),
    availableFrom: z.coerce.date().nullable().optional(),
    availableTo: z.coerce.date().nullable().optional(),
    isPublished: z.coerce.boolean().optional(),
    shuffleQuestions: z.coerce.boolean().optional(),
    navigationMode: z.enum(['bidirectional', 'unidirectional']).optional(),
    timeRemindersMinutes: z.array(z.coerce.number().int().positive()).max(6).optional(),
    questions: z.array(questionInputSchema).min(1).optional(),
  })
  .refine(
    (data) =>
      data.questions === undefined ||
      data.questions.every((q) => q.correctIndex < q.options.length),
    {
      message: 'correctIndex must be within the options range',
      path: ['questions'],
    }
  );

export const quizTopicSchema = z.object({
  name: z.string().min(1).max(120),
});

export const questionBankItemSchema = z
  .object({
    bankId: z.string().min(1, 'Select a question bank first'),
    subject: z.string().min(1).max(120).optional(),
    grade: z.string().max(120).optional(),
    text: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(8),
    correctIndex: z.coerce.number().int().min(0),
    marks: z.coerce.number().min(0).default(1),
    topic: z.string().min(1).max(120).default('General'),
    complexity: z.enum(['not_defined', 'low', 'medium', 'high']).default('not_defined'),
    imageUrls: z.array(z.string().min(1)).max(5).optional(),
  })
  .refine((data) => data.correctIndex < data.options.length, {
    message: 'correctIndex must be within the options range',
    path: ['correctIndex'],
  });

export const questionBankBulkItemsSchema = z.object({
  bankId: z.string().min(1, 'Select a question bank first'),
  items: z
    .array(
      z
        .object({
          text: z.string().min(1),
          options: z.array(z.string().min(1)).min(2).max(8),
          correctIndex: z.coerce.number().int().min(0),
          marks: z.coerce.number().min(0).default(1),
          topic: z.string().min(1).max(120).default('General'),
          complexity: z.enum(['not_defined', 'low', 'medium', 'high']).default('not_defined'),
        })
        .refine((data) => data.correctIndex < data.options.length, {
          message: 'correctIndex must be within the options range',
        })
    )
    .min(1)
    .max(200),
});

export const questionBankConfirmPaperSchema = z.object({
  items: z
    .array(
      z
        .object({
          text: z.string().min(1),
          options: z.array(z.string()).min(2).max(8),
          correctIndex: z.coerce.number().int().min(0),
          marks: z.coerce.number().min(0).default(1),
          topic: z.string().min(1).max(120).default('General'),
          complexity: z.enum(['not_defined', 'low', 'medium', 'high']).default('not_defined'),
          imageUrls: z.array(z.string().min(1)).max(5).optional(),
        })
        .refine((data) => data.correctIndex < data.options.length, {
          message: 'Pick a correct answer for each question',
          path: ['correctIndex'],
        })
        .refine((data) => data.options.filter((o) => o.trim()).length >= 2, {
          message: 'Each question needs at least 2 options',
          path: ['options'],
        })
    )
    .min(1)
    .max(200),
});

export const questionBankCreateSchema = z.object({
  subject: z.string().min(1).max(120),
  grade: z.string().max(120).optional().default(''),
  title: z.string().min(1).max(200).optional(),
});

export const importBankItemsSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1).max(100),
});

export const saveQuestionsToBankSchema = z.object({
  questionIds: z.array(z.string().min(1)).min(1).max(100).optional(),
  subject: z.string().min(1).max(120).optional(),
  grade: z.string().max(120).optional(),
  bankId: z.string().min(1).optional(),
});

export const submitAttemptSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedIndex: z.coerce.number().int().min(0),
      })
    )
    .default([]),
});

// --- Batches ---
export const batchSchema = z.object({
  name: z.string().min(1).max(100),
  year: z.coerce.number().int().optional(),
});

// --- Video lessons ---
export const videoLessonSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  provider: z.enum(['youtube', 'vimeo', 'url']).default('youtube'),
  videoUrl: z.string().url().refine((url) => new URL(url).protocol === 'https:', {
    message: 'Video URL must use HTTPS',
  }),
  visibility: z.enum(['all', 'class', 'batch']).default('all'),
  classId: z.string().optional(),
  batchId: z.string().optional(),
  topicId: z.string().optional().nullable(),
  /** Create a new class topic (playlist) and attach this video to it. Requires classId. */
  newTopicTitle: z.string().min(1).max(150).optional(),
  playlistOrder: z.coerce.number().int().min(1).optional(),
});

export const classTopicSchema = z.object({
  title: z.string().min(1).max(150),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

// --- Notices ---
export const noticeSchema = z
  .object({
    title: z.string().min(1).max(200),
    body: z.string().max(5000).optional(),
    pinned: z.coerce.boolean().optional(),
    scope: z.enum(['all', 'classes']).default('all'),
    classIds: z.array(z.string()).optional(),
  })
  .refine((data) => data.scope !== 'classes' || (data.classIds && data.classIds.length > 0), {
    message: 'Select at least one class',
    path: ['classIds'],
  });

// --- Events ---
export const eventSchema = z
  .object({
    title: z.string().min(1).max(200),
    body: z.string().max(5000).optional(),
    eventDate: z.coerce.date(),
    batchLabel: z.string().max(100).optional().nullable(),
    scope: z.enum(['all', 'classes']).default('all'),
    classIds: z.array(z.string()).optional(),
    isActive: z.coerce.boolean().optional(),
  })
  .refine((data) => data.scope !== 'classes' || (data.classIds && data.classIds.length > 0), {
    message: 'Select at least one class',
    path: ['classIds'],
  });

// --- Class schedules ---
function normalizeClassTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})/);
  if (!match) return value;
  return `${match[1]}:${match[2]}`;
}

export const classScheduleSchema = z.object({
  classDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  classTime: z
    .string()
    .transform(normalizeClassTime)
    .pipe(z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM (24-hour)')),
  platform: z.enum(['zoom', 'teams', 'google_meet', 'jitsi']),
  meetingText: z.string().max(2000).optional(),
  externalMeetingUrl: z.string().url().max(2000).optional().or(z.literal('')),
  /** Create only: once (default) or recurring pattern */
  repeat: z
    .enum(['once', 'daily', 'weekly', 'weekdays', 'weekends', 'custom'])
    .optional()
    .default('once'),
  /** Inclusive end date for recurring schedules (YYYY-MM-DD) */
  repeatUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
  /** For custom: weekdays as 0=Sun … 6=Sat */
  customDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
});

// --- Chat ---
export const chatStartSchema = z.object({
  peerId: z.string().min(1),
});

export const chatMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
