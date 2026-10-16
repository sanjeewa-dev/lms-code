import bcrypt from 'bcryptjs';
import { basePrisma as prisma } from './lib/prisma';

async function findOrCreateUser(
  tenantId: string | null,
  data: { name: string; email: string; role: 'superadmin' | 'admin' | 'teacher' | 'student' },
  passwordHash: string
) {
  const existing = await prisma.user.findFirst({ where: { tenantId, email: data.email } });
  if (existing) return existing;
  return prisma.user.create({
    data: { tenantId, name: data.name, email: data.email, role: data.role, passwordHash },
  });
}

async function ensureEnrollment(tenantId: string, classId: string, studentId: string) {
  const existing = await prisma.enrollment.findFirst({ where: { classId, studentId } });
  if (existing) {
    if (existing.status !== 'active') {
      return prisma.enrollment.update({ where: { id: existing.id }, data: { status: 'active' } });
    }
    return existing;
  }
  return prisma.enrollment.create({
    data: { tenantId, classId, studentId, status: 'active' },
  });
}

async function ensureStubFile(tenantId: string, ownerId: string, name: string) {
  const existing = await prisma.file.findFirst({
    where: { tenantId, ownerId, originalName: name, kind: 'submission' },
  });
  if (existing) return existing;
  return prisma.file.create({
    data: {
      tenantId,
      ownerId,
      storageKey: `seed/${tenantId}/${name}`,
      originalName: name,
      mimeType: 'application/pdf',
      size: 12_000,
      kind: 'submission',
    },
  });
}

async function ensureAssessment(
  tenantId: string,
  classId: string,
  title: string,
  maxMarks: number,
  daysAgo: number
) {
  const existing = await prisma.material.findFirst({
    where: { classId, title, kind: 'assessment' },
  });
  if (existing) {
    if (existing.maxMarks !== maxMarks) {
      return prisma.material.update({
        where: { id: existing.id },
        data: { maxMarks },
      });
    }
    return existing;
  }
  const created = new Date();
  created.setDate(created.getDate() - daysAgo);
  return prisma.material.create({
    data: {
      tenantId,
      classId,
      title,
      description: `${title} — seeded assessment for gradebook demos.`,
      kind: 'assessment',
      maxMarks,
      dueDate: created,
      createdAt: created,
    },
  });
}

async function quizTopicIdFor(tenantId: string, name: string): Promise<string | null> {
  if (!name || name === 'General') return null;
  const row = await prisma.quizTopic.findUnique({
    where: { tenantId_name: { tenantId, name } },
  });
  return row?.id ?? null;
}

async function ensurePublishedQuiz(
  tenantId: string,
  classId: string,
  title: string,
  totalMarks: number,
  questionTexts: string[],
  daysAgo: number,
  topics: string[] = []
) {
  const marksEach = totalMarks / questionTexts.length;
  const existing = await prisma.quiz.findFirst({
    where: { classId, title },
    include: { questions: { orderBy: { order: 'asc' } } },
  });
  if (existing) {
    if (!existing.isPublished || existing.totalMarks !== totalMarks) {
      await prisma.quiz.update({
        where: { id: existing.id },
        data: { isPublished: true, totalMarks },
      });
    }
    // Backfill / refresh topics + marks on existing questions for analytics
    for (let i = 0; i < existing.questions.length; i++) {
      const q = existing.questions[i];
      const topic = topics[i] ?? q.topic ?? 'General';
      const quizTopicId = await quizTopicIdFor(tenantId, topic);
      await prisma.question.update({
        where: { id: q.id },
        data: { topic, marks: marksEach, quizTopicId },
      });
    }
    return prisma.quiz.findUniqueOrThrow({
      where: { id: existing.id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
  }
  const created = new Date();
  created.setDate(created.getDate() - daysAgo);
  return prisma.quiz.create({
    data: {
      tenantId,
      classId,
      title,
      description: `${title} — seeded quiz for gradebook graphs.`,
      timeLimitSec: 600,
      totalMarks,
      isPublished: true,
      createdAt: created,
      questions: {
        create: await Promise.all(
          questionTexts.map(async (text, order) => {
            const topic = topics[order] ?? 'General';
            return {
              tenantId,
              text,
              options: ['A', 'B', 'C', 'D'],
              correctIndex: 0,
              marks: marksEach,
              order,
              topic,
              quizTopicId: await quizTopicIdFor(tenantId, topic),
            };
          }),
        ),
      },
    },
    include: { questions: { orderBy: { order: 'asc' } } },
  });
}

async function upsertSubmission(params: {
  tenantId: string;
  classId: string;
  assessmentId: string;
  studentId: string;
  grade: number | null;
  feedback?: string;
  daysAgo: number;
}) {
  const existing = await prisma.submission.findFirst({
    where: {
      classId: params.classId,
      assessmentId: params.assessmentId,
      studentId: params.studentId,
    },
  });
  const submittedAt = new Date();
  submittedAt.setDate(submittedAt.getDate() - params.daysAgo);
  if (existing) {
    return prisma.submission.update({
      where: { id: existing.id },
      data: {
        grade: params.grade,
        feedback: params.feedback ?? existing.feedback,
        submittedAt,
      },
    });
  }
  const file = await ensureStubFile(
    params.tenantId,
    params.studentId,
    `submission-${params.assessmentId.slice(-6)}-${params.studentId.slice(-6)}.pdf`
  );
  return prisma.submission.create({
    data: {
      tenantId: params.tenantId,
      classId: params.classId,
      assessmentId: params.assessmentId,
      studentId: params.studentId,
      fileId: file.id,
      grade: params.grade,
      feedback: params.feedback,
      submittedAt,
    },
  });
}

/**
 * Build correct/incorrect flags to hit ~targetScore.
 * Questions whose topic is in missTopics are preferred as wrong answers so
 * topic mastery fluctuates paper-to-paper instead of looking flat.
 */
function planCorrectFlags(
  questions: { id: string; marks: number; topic?: string }[],
  targetScore: number,
  missTopics: string[] = []
): boolean[] {
  const miss = new Set(missTopics.map((t) => t.toLowerCase()));
  const flags = questions.map(() => false);
  let earned = 0;
  // Prefer keeping missTopics wrong; otherwise higher marks first
  const order = questions
    .map((_, i) => i)
    .sort((a, b) => {
      const aMiss = miss.has((questions[a].topic || '').toLowerCase()) ? 1 : 0;
      const bMiss = miss.has((questions[b].topic || '').toLowerCase()) ? 1 : 0;
      if (aMiss !== bMiss) return aMiss - bMiss; // non-miss first (more likely correct)
      return questions[b].marks - questions[a].marks || a - b;
    });
  for (const i of order) {
    if (earned + questions[i].marks <= targetScore + 0.001) {
      flags[i] = true;
      earned += questions[i].marks;
    }
  }
  return flags;
}

async function upsertQuizAttempt(params: {
  tenantId: string;
  quizId: string;
  studentId: string;
  score: number;
  daysAgo: number;
  questions: { id: string; marks: number; topic: string; correctIndex: number }[];
  unansweredCount?: number;
  /** Topics this student should tend to miss on this paper (fluctuating mastery). */
  missTopics?: string[];
}) {
  const submittedAt = new Date();
  submittedAt.setDate(submittedAt.getDate() - params.daysAgo);
  const startedAt = new Date(submittedAt);
  startedAt.setMinutes(startedAt.getMinutes() - 12);

  const correctFlags = planCorrectFlags(params.questions, params.score, params.missTopics ?? []);
  const unanswered = new Set<number>();
  const wantUnanswered = Math.min(params.unansweredCount ?? 0, params.questions.length);
  for (let i = params.questions.length - 1; i >= 0 && unanswered.size < wantUnanswered; i--) {
    if (!correctFlags[i]) unanswered.add(i);
  }
  for (let i = params.questions.length - 1; i >= 0 && unanswered.size < wantUnanswered; i--) {
    unanswered.add(i);
    correctFlags[i] = false;
  }

  const questionScores = params.questions.map((q, i) => {
    const skipped = unanswered.has(i);
    const correct = !skipped && correctFlags[i];
    return {
      questionId: q.id,
      correct: skipped ? null : correct,
      marks: q.marks,
      earned: correct ? q.marks : 0,
      topic: q.topic || 'General',
    };
  });
  const actualScore = questionScores.reduce((s, r) => s + r.earned, 0);
  const topicMap: Record<string, { correct: number; total: number }> = {};
  for (const row of questionScores) {
    if (!topicMap[row.topic]) topicMap[row.topic] = { correct: 0, total: 0 };
    topicMap[row.topic].total += 1;
    if (row.correct) topicMap[row.topic].correct += 1;
  }
  const topicBreakdown: Record<string, { correct: number; total: number; percentage: number }> = {};
  for (const [topic, v] of Object.entries(topicMap)) {
    topicBreakdown[topic] = {
      ...v,
      percentage: v.total > 0 ? Math.round((v.correct / v.total) * 1000) / 10 : 0,
    };
  }

  const existing = await prisma.quizAttempt.findUnique({
    where: { quizId_studentId: { quizId: params.quizId, studentId: params.studentId } },
  });

  const attempt = existing
    ? await prisma.quizAttempt.update({
        where: { id: existing.id },
        data: {
          score: actualScore,
          submittedAt,
          startedAt,
          topicBreakdown,
          questionScores,
          displayOrder: params.questions.map((q) => q.id),
        },
      })
    : await prisma.quizAttempt.create({
        data: {
          tenantId: params.tenantId,
          quizId: params.quizId,
          studentId: params.studentId,
          score: actualScore,
          submittedAt,
          startedAt,
          topicBreakdown,
          questionScores,
          displayOrder: params.questions.map((q) => q.id),
        },
      });

  // Replace answers so AI weak-topics / quiz report have real selections
  await prisma.answer.deleteMany({ where: { attemptId: attempt.id } });
  const answerRows = params.questions
    .map((q, i) =>
      unanswered.has(i)
        ? null
        : {
            tenantId: params.tenantId,
            attemptId: attempt.id,
            questionId: q.id,
            selectedIndex: correctFlags[i] ? q.correctIndex : (q.correctIndex + 1) % 4,
          },
    )
    .filter((row): row is NonNullable<typeof row> => row != null);
  if (answerRows.length) {
    await prisma.answer.createMany({ data: answerRows });
  }

  return attempt;
}

async function upsertAttendance(params: {
  tenantId: string;
  classId: string;
  studentId: string;
  markedById: string;
  daysAgo: number;
  status: 'present' | 'absent' | 'late' | 'excused';
}) {
  const sessionDate = new Date();
  sessionDate.setHours(12, 0, 0, 0);
  sessionDate.setDate(sessionDate.getDate() - params.daysAgo);
  const existing = await prisma.attendance.findUnique({
    where: {
      classId_studentId_sessionDate: {
        classId: params.classId,
        studentId: params.studentId,
        sessionDate,
      },
    },
  });
  if (existing) {
    return prisma.attendance.update({
      where: { id: existing.id },
      data: { status: params.status, markedById: params.markedById },
    });
  }
  return prisma.attendance.create({
    data: {
      tenantId: params.tenantId,
      classId: params.classId,
      studentId: params.studentId,
      sessionDate,
      status: params.status,
      markedById: params.markedById,
    },
  });
}

async function ensureIntervention(params: {
  tenantId: string;
  studentId: string;
  createdById: string;
  reason: string;
  action: string;
  status: 'open' | 'in_progress' | 'resolved' | 'escalated';
  daysAgo: number;
  followUpInDays?: number;
}) {
  const existing = await prisma.intervention.findFirst({
    where: {
      tenantId: params.tenantId,
      studentId: params.studentId,
      reason: params.reason,
    },
  });
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - params.daysAgo);
  const followUpDate =
    params.followUpInDays != null
      ? (() => {
          const d = new Date();
          d.setDate(d.getDate() + params.followUpInDays);
          return d;
        })()
      : undefined;
  const resolvedAt =
    params.status === 'resolved'
      ? (() => {
          const d = new Date(createdAt);
          d.setDate(d.getDate() + 5);
          return d;
        })()
      : null;

  if (existing) {
    return prisma.intervention.update({
      where: { id: existing.id },
      data: {
        action: params.action,
        status: params.status,
        followUpDate,
        resolvedAt,
        resolvedNote: params.status === 'resolved' ? 'Improved after coaching session.' : null,
      },
    });
  }
  return prisma.intervention.create({
    data: {
      tenantId: params.tenantId,
      studentId: params.studentId,
      createdById: params.createdById,
      reason: params.reason,
      action: params.action,
      status: params.status,
      followUpDate,
      resolvedAt,
      resolvedNote: params.status === 'resolved' ? 'Improved after coaching session.' : null,
      createdAt,
    },
  });
}

async function ensureMonthlyPayment(params: {
  tenantId: string;
  enrollmentId: string;
  studentId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  forMonth: string;
  reviewedById?: string;
}) {
  const existing = await prisma.payment.findFirst({
    where: {
      enrollmentId: params.enrollmentId,
      forMonth: params.forMonth,
      paymentType: 'monthly',
    },
  });
  if (existing) {
    return prisma.payment.update({
      where: { id: existing.id },
      data: {
        amount: params.amount,
        status: params.status,
        reviewedById: params.status === 'approved' ? params.reviewedById : null,
        reviewedAt: params.status === 'approved' ? new Date() : null,
      },
    });
  }
  const slip = await ensureStubFile(
    params.tenantId,
    params.studentId,
    `fee-slip-${params.forMonth}-${params.studentId.slice(-6)}.pdf`
  );
  // slip files should be kind slip for realism
  await prisma.file.update({ where: { id: slip.id }, data: { kind: 'slip' } });
  return prisma.payment.create({
    data: {
      tenantId: params.tenantId,
      enrollmentId: params.enrollmentId,
      amount: params.amount,
      slipFileId: slip.id,
      paymentType: 'monthly',
      forMonth: params.forMonth,
      status: params.status,
      reviewedById: params.status === 'approved' ? params.reviewedById : null,
      reviewedAt: params.status === 'approved' ? new Date() : null,
    },
  });
}

async function ensurePaidTute(
  tenantId: string,
  classId: string,
  title: string,
  price: number,
  description: string
) {
  const existing = await prisma.material.findFirst({
    where: { classId, title, kind: 'material' },
  });
  if (existing) {
    return prisma.material.update({
      where: { id: existing.id },
      data: {
        price,
        published: true,
        description: existing.description || description,
      },
    });
  }
  return prisma.material.create({
    data: {
      tenantId,
      classId,
      title,
      description,
      kind: 'material',
      price,
      published: true,
      viewOnly: true,
      pageCount: 12,
    },
  });
}

async function ensureMaterialPayment(params: {
  tenantId: string;
  enrollmentId: string;
  studentId: string;
  materialId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  forMonth: string;
  slipFileId: string;
  reviewedById?: string;
}) {
  const existing = await prisma.payment.findFirst({
    where: {
      enrollmentId: params.enrollmentId,
      materialId: params.materialId,
      paymentType: 'material',
      forMonth: params.forMonth,
    },
  });
  if (existing) {
    return prisma.payment.update({
      where: { id: existing.id },
      data: {
        amount: params.amount,
        status: params.status,
        slipFileId: params.slipFileId,
        reviewedById:
          params.status === 'approved' || params.status === 'rejected' ? params.reviewedById : null,
        reviewedAt:
          params.status === 'approved' || params.status === 'rejected' ? new Date() : null,
      },
    });
  }
  return prisma.payment.create({
    data: {
      tenantId: params.tenantId,
      enrollmentId: params.enrollmentId,
      materialId: params.materialId,
      amount: params.amount,
      slipFileId: params.slipFileId,
      paymentType: 'material',
      forMonth: params.forMonth,
      status: params.status,
      reviewedById:
        params.status === 'approved' || params.status === 'rejected' ? params.reviewedById : null,
      reviewedAt:
        params.status === 'approved' || params.status === 'rejected' ? new Date() : null,
    },
  });
}

type SeedOrderStatus =
  | 'approval_pending'
  | 'active'
  | 'processing'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

async function ensureMaterialOrder(params: {
  tenantId: string;
  orderNo: string;
  student: { id: string; name: string; email: string };
  enrollmentId: string;
  classId: string;
  classTitle: string;
  materials: Array<{ id: string; title: string; price: number }>;
  status: SeedOrderStatus;
  adminId: string;
  forMonth: string;
  daysAgo: number;
  address: string;
  phone: string;
  shippingLabelNo?: string;
  cancelNote?: string;
}) {
  const existing = await prisma.materialOrder.findUnique({
    where: { tenantId_orderNo: { tenantId: params.tenantId, orderNo: params.orderNo } },
    include: { items: true },
  });
  if (existing) return existing;

  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - params.daysAgo);

  const slip = await ensureStubFile(
    params.tenantId,
    params.student.id,
    `tute-slip-${params.orderNo}.pdf`
  );
  await prisma.file.update({ where: { id: slip.id }, data: { kind: 'slip' } });

  const paymentStatus: 'pending' | 'approved' | 'rejected' =
    params.status === 'rejected'
      ? 'rejected'
      : params.status === 'approval_pending'
        ? 'pending'
        : 'approved';

  const payments: Awaited<ReturnType<typeof ensureMaterialPayment>>[] = [];
  for (const mat of params.materials) {
    payments.push(
      await ensureMaterialPayment({
        tenantId: params.tenantId,
        enrollmentId: params.enrollmentId,
        studentId: params.student.id,
        materialId: mat.id,
        amount: mat.price,
        status: paymentStatus,
        forMonth: params.forMonth,
        slipFileId: slip.id,
        reviewedById: params.adminId,
      })
    );
  }

  // Skip if any payment already linked to an order item (idempotent across re-seeds)
  const linked = await prisma.materialOrderItem.findFirst({
    where: { paymentId: { in: payments.map((p) => p.id) } },
  });
  if (linked) {
    return prisma.materialOrder.findFirstOrThrow({ where: { id: linked.orderId } });
  }

  const reviewed =
    params.status !== 'approval_pending'
      ? { reviewedById: params.adminId, reviewedAt: createdAt }
      : {};

  return prisma.materialOrder.create({
    data: {
      tenantId: params.tenantId,
      studentId: params.student.id,
      orderNo: params.orderNo,
      shippingLabelNo: params.shippingLabelNo ?? null,
      status: params.status,
      recipientName: params.student.name,
      email: params.student.email,
      phone: params.phone,
      address: params.address,
      grade: 'Grade 11',
      remarks: `Seeded tute order (${params.status})`,
      slipFileId: slip.id,
      createdAt,
      statusChangedAt: createdAt,
      ...reviewed,
      cancelledAt: params.status === 'cancelled' ? createdAt : null,
      cancelledById: params.status === 'cancelled' ? params.adminId : null,
      cancelNote: params.cancelNote ?? null,
      items: {
        create: params.materials.map((mat, i) => ({
          paymentId: payments[i]!.id,
          materialId: mat.id,
          classId: params.classId,
          materialTitle: mat.title,
          classTitle: params.classTitle,
          amount: mat.price,
        })),
      },
    },
  });
}

/**
 * Seed tute (material) orders for ICT With Pasidu using existing class tutes + roster students.
 */
async function seedIctPasiduTuteOrders(params: {
  tenantId: string;
  classId: string;
  classTitle: string;
  adminId: string;
  students: Array<{
    email: string;
    user: { id: string; name: string; email: string };
    enrollment: { id: string };
  }>;
}) {
  const tute1 = await ensurePaidTute(
    params.tenantId,
    params.classId,
    'tute1',
    750,
    'Grade 11 ICT Tute 1 — Number Systems & Boolean Algebra'
  );
  const tute2 = await ensurePaidTute(
    params.tenantId,
    params.classId,
    'tute 2',
    1000,
    'Grade 11 ICT Tute 2 — Hardware, Memory & Networking'
  );
  const testTute = await ensurePaidTute(
    params.tenantId,
    params.classId,
    'Test tute',
    500,
    'Paid demo tute for order / payment flows'
  );

  const byEmail = Object.fromEntries(params.students.map((s) => [s.email, s]));
  const forMonth = new Date().toISOString().slice(0, 7);

  const specs: Array<{
    orderNo: string;
    email: string;
    materials: Array<{ id: string; title: string; price: number }>;
    status: SeedOrderStatus;
    daysAgo: number;
    phone: string;
    address: string;
    shippingLabelNo?: string;
    cancelNote?: string;
  }> = [
    {
      orderNo: 'ORD-SEED-0001',
      email: 'sanjeewa@ictpasidu.lms',
      materials: [{ id: testTute.id, title: testTute.title, price: Number(testTute.price) }],
      status: 'approval_pending',
      daysAgo: 1,
      phone: '0771234567',
      address: '12 Lake Road, Kandy',
    },
    {
      orderNo: 'ORD-SEED-0002',
      email: 'student@ictpasidu.lms',
      materials: [{ id: tute1.id, title: tute1.title, price: Number(tute1.price) }],
      status: 'active',
      daysAgo: 5,
      phone: '0712345678',
      address: '45 Galle Road, Colombo 03',
    },
    {
      orderNo: 'ORD-SEED-0003',
      email: 'nimali@ictpasidu.lms',
      materials: [{ id: tute2.id, title: tute2.title, price: Number(tute2.price) }],
      status: 'processing',
      daysAgo: 8,
      phone: '0765551212',
      address: '8 Temple Lane, Galle',
      shippingLabelNo: 'SL-SEED-0003',
    },
    {
      orderNo: 'ORD-SEED-0004',
      email: 'kasun@ictpasidu.lms',
      materials: [{ id: testTute.id, title: testTute.title, price: Number(testTute.price) }],
      status: 'delivered',
      daysAgo: 18,
      phone: '0758889999',
      address: '22 Station Road, Negombo',
      shippingLabelNo: 'SL-SEED-0004',
    },
    {
      orderNo: 'ORD-SEED-0005',
      email: 'ishara@ictpasidu.lms',
      materials: [
        { id: tute1.id, title: tute1.title, price: Number(tute1.price) },
        { id: tute2.id, title: tute2.title, price: Number(tute2.price) },
      ],
      status: 'active',
      daysAgo: 4,
      phone: '0741112233',
      address: '3 Hill Street, Matara',
    },
    {
      orderNo: 'ORD-SEED-0006',
      email: 'chathuranga@ictpasidu.lms',
      materials: [{ id: testTute.id, title: testTute.title, price: Number(testTute.price) }],
      status: 'rejected',
      daysAgo: 3,
      phone: '0774445566',
      address: '90 Main Street, Kurunegala',
    },
    {
      orderNo: 'ORD-SEED-0007',
      email: 'tharindu@ictpasidu.lms',
      materials: [{ id: tute1.id, title: tute1.title, price: Number(tute1.price) }],
      status: 'cancelled',
      daysAgo: 10,
      phone: '0723334455',
      address: '15 Park Avenue, Jaffna',
      cancelNote: 'Student cancelled — will reorder next month',
    },
  ];

  let created = 0;
  for (const spec of specs) {
    const student = byEmail[spec.email];
    if (!student) continue;
    await prisma.user.update({
      where: { id: student.user.id },
      data: {
        phone: spec.phone,
        address: spec.address,
      },
    });
    const before = await prisma.materialOrder.findUnique({
      where: { tenantId_orderNo: { tenantId: params.tenantId, orderNo: spec.orderNo } },
    });
    await ensureMaterialOrder({
      tenantId: params.tenantId,
      orderNo: spec.orderNo,
      student: student.user,
      enrollmentId: student.enrollment.id,
      classId: params.classId,
      classTitle: params.classTitle,
      materials: spec.materials,
      status: spec.status,
      adminId: params.adminId,
      forMonth,
      daysAgo: spec.daysAgo,
      address: spec.address,
      phone: spec.phone,
      shippingLabelNo: spec.shippingLabelNo,
      cancelNote: spec.cancelNote,
    });
    if (!before) created += 1;
  }

  return { tutes: [tute1, tute2, testTute], created };
}

async function ensureQuizTopics(
  tenantId: string,
  classId: string,
  teacherId: string,
  names: string[]
) {
  for (const name of names) {
    const topic =
      (await prisma.quizTopic.findUnique({
        where: { tenantId_name: { tenantId, name } },
      })) ??
      (await prisma.quizTopic.create({
        data: { tenantId, name, createdById: teacherId },
      }));
    await prisma.quizTopicClass.upsert({
      where: { quizTopicId_classId: { quizTopicId: topic.id, classId } },
      create: { quizTopicId: topic.id, classId },
      update: {},
    });
  }
}

/**
 * Rich Grade 11 ICT analytics demo for ICT With Pasidu:
 * gradebook, quiz topic mastery, question performance, attendance,
 * at-risk signals, interventions, and monthly fee payments.
 */
async function seedGrade11IctGradebook(passwordHash: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'ictpasidu' } });
  if (!tenant) return;

  const teacher = await findOrCreateUser(
    tenant.id,
    { name: 'ICT With Pasidu Teacher', email: 'teacher@ictpasidu.lms', role: 'teacher' },
    passwordHash
  );
  const admin = await findOrCreateUser(
    tenant.id,
    { name: 'ICT With Pasidu Admin', email: 'admin@ictpasidu.lms', role: 'admin' },
    passwordHash
  );

  const klass =
    (await prisma.class.findFirst({ where: { tenantId: tenant.id, title: 'Grade 11 ICT' } })) ??
    (await prisma.class.create({
      data: {
        tenantId: tenant.id,
        title: 'Grade 11 ICT',
        description: 'Grade 11 ICT — seeded class with rich gradebook data.',
        price: 3000,
        teacherId: teacher.id,
        isPublished: true,
      },
    }));

  if (klass.teacherId !== teacher.id) {
    await prisma.class.update({ where: { id: klass.id }, data: { teacherId: teacher.id } });
  }

  const topicNames = [
    'Hardware',
    'Software',
    'Memory',
    'Systems Architecture',
    'Operating Systems',
    'Networking',
    'Databases',
    'SQL',
    'Number Systems',
    'Boolean Algebra',
    'Logic Gates',
  ];
  await ensureQuizTopics(tenant.id, klass.id, teacher.id, topicNames);

  const roster = [
    { name: 'ICT With Pasidu Student', email: 'student@ictpasidu.lms', profile: 'steady' as const },
    { name: 'Sanjeewa Perera', email: 'sanjeewa@ictpasidu.lms', profile: 'strong' as const },
    { name: 'Chathuranga Bandara', email: 'chathuranga@ictpasidu.lms', profile: 'incomplete' as const },
    { name: 'Nimali Fernando', email: 'nimali@ictpasidu.lms', profile: 'rising' as const },
    { name: 'Kasun Jayasuriya', email: 'kasun@ictpasidu.lms', profile: 'struggling' as const },
    { name: 'Ishara Silva', email: 'ishara@ictpasidu.lms', profile: 'quizStar' as const },
    { name: 'Tharindu Wickramasinghe', email: 'tharindu@ictpasidu.lms', profile: 'assignmentStar' as const },
  ];

  const students: Array<
    (typeof roster)[number] & {
      user: Awaited<ReturnType<typeof findOrCreateUser>>;
      enrollment: Awaited<ReturnType<typeof ensureEnrollment>>;
    }
  > = [];
  for (const s of roster) {
    const user = await findOrCreateUser(
      tenant.id,
      { name: s.name, email: s.email, role: 'student' },
      passwordHash
    );
    const enrollment = await ensureEnrollment(tenant.id, klass.id, user.id);
    students.push({ ...s, user, enrollment });
  }

  const a1 = await ensureAssessment(tenant.id, klass.id, 'Lab Report — Number Systems', 20, 45);
  const a2 = await ensureAssessment(tenant.id, klass.id, 'Worksheet — Boolean Algebra', 25, 35);
  const a3 = await ensureAssessment(tenant.id, klass.id, 'Project — Database Design', 40, 20);
  const a4 = await ensureAssessment(tenant.id, klass.id, 'Essay — ICT & Society', 30, 8);
  const assessments = [a1, a2, a3, a4];

  const qSample = await ensurePublishedQuiz(
    tenant.id,
    klass.id,
    'Sample Quiz',
    3,
    ['2x + 3 = 11 → x?', 'Binary of 5?', 'AND gate output for 1,1?'],
    50,
    ['Number Systems', 'Number Systems', 'Logic Gates']
  );
  const q1 = await ensurePublishedQuiz(
    tenant.id,
    klass.id,
    'Quiz 1 — Intro to ICT',
    10,
    ['What is hardware?', 'What is software?', 'CPU stands for?', 'RAM is…?', 'Input device?'],
    40,
    ['Hardware', 'Software', 'Hardware', 'Memory', 'Hardware']
  );
  const qSystems = await ensurePublishedQuiz(
    tenant.id,
    klass.id,
    'Quiz on Computer Systems',
    20,
    [
      'Fetch–decode–execute?',
      'Primary storage?',
      'OS role?',
      'LAN vs WAN?',
      'IP address purpose?',
    ],
    28,
    ['Systems Architecture', 'Memory', 'Operating Systems', 'Networking', 'Networking']
  );
  const qDb = await ensurePublishedQuiz(
    tenant.id,
    klass.id,
    'Quiz — Databases',
    15,
    ['Primary key?', 'Foreign key?', 'Normalisation?', 'SQL SELECT?', 'ER diagram?'],
    14,
    ['Databases', 'Databases', 'Databases', 'SQL', 'Databases']
  );
  const qNet = await ensurePublishedQuiz(
    tenant.id,
    klass.id,
    'Quiz — Networking',
    15,
    ['Router purpose?', 'HTTP vs HTTPS?', 'DNS?', 'Firewall?', 'Bandwidth?'],
    5,
    ['Networking', 'Networking', 'Networking', 'Networking', 'Networking']
  );
  const qBool = await ensurePublishedQuiz(
    tenant.id,
    klass.id,
    'Quiz — Boolean Algebra',
    12,
    [
      'Simplify A·1',
      'De Morgan for NAND?',
      'Truth table of XOR?',
      'Boolean of majority of 3 inputs?',
    ],
    3,
    ['Boolean Algebra', 'Boolean Algebra', 'Boolean Algebra', 'Logic Gates']
  );
  const qTerm = await ensurePublishedQuiz(
    tenant.id,
    klass.id,
    'End-of-term ICT Paper',
    18,
    [
      'ALU vs CU?',
      'Virtual memory?',
      'Process vs thread?',
      'SELECT with JOIN?',
      'Two’s complement of −5?',
      'AND-OR equivalent gate?',
    ],
    1,
    [
      'Systems Architecture',
      'Memory',
      'Operating Systems',
      'SQL',
      'Number Systems',
      'Logic Gates',
    ]
  );
  const quizzes = [qSample, q1, qSystems, qDb, qNet, qBool, qTerm];

  // max marks: assignments 20/25/40/30 · quizzes 3/10/20/15/15/12/18
  // "steady" (student@ictpasidu.lms): rising trend with visible dips — not a straight line.
  // Approx %: 33 → 60 → 50 → 73 → 53 → 75 → 83
  const scorePlans: Record<
    (typeof roster)[number]['profile'],
    { assignments: (number | null)[]; quizzes: (number | null)[] }
  > = {
    steady: {
      assignments: [11, 19, 28, 25], // 55% → 76% → 70% → 83%
      quizzes: [1, 6, 10, 11, 8, 9, 15],
    },
    strong: {
      assignments: [19, 24, 38, 28],
      quizzes: [3, 10, 19, 14, 14, 11, 17],
    },
    incomplete: {
      assignments: [null, 12, null, null],
      quizzes: [null, 4, null, null, null, null, 7],
    },
    rising: {
      assignments: [10, 15, 30, 27],
      quizzes: [1, 5, 12, 12, 13, 7, 15],
    },
    struggling: {
      assignments: [8, 9, 14, 11],
      quizzes: [1, 3, 7, 5, 4, 4, 6],
    },
    quizStar: {
      assignments: [12, 14, 22, 18],
      quizzes: [3, 9, 18, 14, 14, 11, 16],
    },
    assignmentStar: {
      assignments: [18, 23, 36, 27],
      quizzes: [2, 5, 10, 8, 7, 6, 10],
    },
  };

  /** Per-quiz weak topics for student@ictpasidu.lms so mastery bars wobble over time. */
  const steadyMissTopicsByQuiz: string[][] = [
    ['Logic Gates'], // Sample
    ['Memory', 'Software'], // Quiz 1
    ['Networking', 'Operating Systems'], // Systems
    ['SQL'], // Databases — strong elsewhere, weak SQL this paper
    ['Networking'], // Networking dip
    ['Boolean Algebra'], // Boolean dip
    ['Memory', 'Operating Systems'], // End-of-term: recovering but still soft on OS/Memory
  ];

  const feedbackByProfile: Partial<Record<(typeof roster)[number]['profile'], string>> = {
    strong: 'Excellent depth and clarity. Keep this standard.',
    rising: 'Clear improvement — keep practising past papers.',
    struggling: 'Please revise the worked examples and resubmit corrections.',
    incomplete: 'Submission incomplete — please upload the missing sections.',
  };

  // Attendance patterns over last ~28 days (8 sessions) — drives at-risk attendance
  const attendancePlans: Record<(typeof roster)[number]['profile'], Array<'present' | 'absent' | 'late' | 'excused'>> = {
    steady: ['present', 'present', 'present', 'late', 'present', 'present', 'present', 'present'],
    strong: ['present', 'present', 'present', 'present', 'present', 'present', 'present', 'present'],
    incomplete: ['absent', 'present', 'absent', 'absent', 'late', 'absent', 'present', 'absent'],
    rising: ['present', 'late', 'present', 'present', 'absent', 'present', 'present', 'late'],
    struggling: ['absent', 'late', 'absent', 'present', 'absent', 'late', 'absent', 'present'],
    quizStar: ['present', 'present', 'late', 'present', 'present', 'present', 'present', 'present'],
    assignmentStar: ['present', 'present', 'present', 'excused', 'present', 'present', 'late', 'present'],
  };
  const sessionDaysAgo = [26, 23, 19, 16, 12, 9, 5, 2];

  for (const s of students) {
    const plan = scorePlans[s.profile];
    for (let i = 0; i < assessments.length; i++) {
      const grade = plan.assignments[i];
      if (grade == null) continue;
      await upsertSubmission({
        tenantId: tenant.id,
        classId: klass.id,
        assessmentId: assessments[i].id,
        studentId: s.user.id,
        grade,
        feedback: feedbackByProfile[s.profile],
        daysAgo: 40 - i * 10,
      });
    }
    for (let i = 0; i < quizzes.length; i++) {
      const score = plan.quizzes[i];
      if (score == null) continue;
      const quiz = quizzes[i];
      const isDemoStudent = s.email === 'student@ictpasidu.lms';
      await upsertQuizAttempt({
        tenantId: tenant.id,
        quizId: quiz.id,
        studentId: s.user.id,
        score,
        daysAgo: 48 - i * 7,
        unansweredCount: isDemoStudent && i === quizzes.length - 1 ? 1 : 0,
        missTopics: isDemoStudent ? steadyMissTopicsByQuiz[i] ?? [] : [],
        questions: quiz.questions.map((q) => ({
          id: q.id,
          marks: q.marks,
          topic: q.topic || 'General',
          correctIndex: q.correctIndex,
        })),
      });
    }

    const attPlan = attendancePlans[s.profile];
    for (let i = 0; i < sessionDaysAgo.length; i++) {
      await upsertAttendance({
        tenantId: tenant.id,
        classId: klass.id,
        studentId: s.user.id,
        markedById: teacher.id,
        daysAgo: sessionDaysAgo[i],
        status: attPlan[i],
      });
    }
  }

  // Interventions for at-risk / recovering students
  const byEmail = Object.fromEntries(students.map((s) => [s.email, s]));
  await ensureIntervention({
    tenantId: tenant.id,
    studentId: byEmail['kasun@ictpasidu.lms'].user.id,
    createdById: teacher.id,
    reason: 'Low quiz average and declining attendance in Grade 11 ICT.',
    action: 'Scheduled weekly catch-up on Networking & Databases; shared revision pack.',
    status: 'open',
    daysAgo: 6,
    followUpInDays: 7,
  });
  await ensureIntervention({
    tenantId: tenant.id,
    studentId: byEmail['chathuranga@ictpasidu.lms'].user.id,
    createdById: teacher.id,
    reason: 'Multiple missing assessments and sparse quiz attempts.',
    action: 'Parent call + deadline extension for Project — Database Design.',
    status: 'in_progress',
    daysAgo: 10,
    followUpInDays: 3,
  });
  await ensureIntervention({
    tenantId: tenant.id,
    studentId: byEmail['nimali@ictpasidu.lms'].user.id,
    createdById: teacher.id,
    reason: 'Early-term weak quiz scores; needed study-plan coaching.',
    action: 'Paired with peer mentor and set topic drills for Number Systems.',
    status: 'resolved',
    daysAgo: 21,
  });

  // Monthly fees — mix of approved / pending for dashboard + parent trust
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  const paymentStatusByProfile: Record<(typeof roster)[number]['profile'], 'approved' | 'pending'> = {
    steady: 'approved',
    strong: 'approved',
    incomplete: 'pending',
    rising: 'approved',
    struggling: 'pending',
    quizStar: 'approved',
    assignmentStar: 'approved',
  };
  for (const s of students) {
    await ensureMonthlyPayment({
      tenantId: tenant.id,
      enrollmentId: s.enrollment.id,
      studentId: s.user.id,
      amount: 3000,
      status: 'approved',
      forMonth: lastMonth,
      reviewedById: admin.id,
    });
    await ensureMonthlyPayment({
      tenantId: tenant.id,
      enrollmentId: s.enrollment.id,
      studentId: s.user.id,
      amount: 3000,
      status: paymentStatusByProfile[s.profile],
      forMonth: thisMonth,
      reviewedById: admin.id,
    });
  }

  const tuteOrders = await seedIctPasiduTuteOrders({
    tenantId: tenant.id,
    classId: klass.id,
    classTitle: klass.title,
    adminId: admin.id,
    students,
  });

  console.log(
    `\nGrade 11 ICT enriched: ${students.length} students, ${assessments.length} assessments, ${quizzes.length} quizzes with topic analytics, attendance, interventions & payments.`
  );
  console.log(
    '  student@ictpasidu.lms has a full quiz history (7 papers, topic mastery, score trend, outcome mix) for Analytics → My results.',
  );
  console.log(
    `  Tute orders: ${tuteOrders.created} new (seed keys ORD-SEED-0001…0007) across ${tuteOrders.tutes.map((t) => t.title).join(', ')}.`,
  );
}

async function seedTenant(
  slug: string,
  name: string,
  classTitle: string,
  batchName: string,
  passwordHash: string
) {
  const tenant =
    (await prisma.tenant.findUnique({ where: { slug } })) ??
    (await prisma.tenant.create({ data: { slug, name } }));

  const admin = await findOrCreateUser(
    tenant.id,
    { name: `${name} Admin`, email: `admin@${slug}.lms`, role: 'admin' },
    passwordHash
  );
  const teacher = await findOrCreateUser(
    tenant.id,
    { name: `${name} Teacher`, email: `teacher@${slug}.lms`, role: 'teacher' },
    passwordHash
  );
  const student = await findOrCreateUser(
    tenant.id,
    { name: `${name} Student`, email: `student@${slug}.lms`, role: 'student' },
    passwordHash
  );

  const batch =
    (await prisma.batch.findFirst({ where: { tenantId: tenant.id, name: batchName } })) ??
    (await prisma.batch.create({ data: { tenantId: tenant.id, name: batchName, year: 2026 } }));

  let klass = await prisma.class.findFirst({ where: { tenantId: tenant.id, title: classTitle } });
  if (!klass) {
    klass = await prisma.class.create({
      data: {
        tenantId: tenant.id,
        title: classTitle,
        description: `${classTitle} - a sample class for ${name}.`,
        price: 2500,
        teacherId: teacher.id,
        batchId: batch.id,
        isPublished: true,
      },
    });
  }

  await ensureEnrollment(tenant.id, klass.id, student.id);

  const quizExists = await prisma.quiz.findFirst({
    where: { tenantId: tenant.id, title: 'Sample Quiz' },
  });
  if (!quizExists) {
    await prisma.quiz.create({
      data: {
        tenantId: tenant.id,
        classId: klass.id,
        title: 'Sample Quiz',
        description: 'Test your understanding.',
        timeLimitSec: 300,
        totalMarks: 3,
        isPublished: true,
        questions: {
          create: [
            {
              tenantId: tenant.id,
              text: 'Solve for x: 2x + 3 = 11',
              options: ['2', '4', '5', '8'],
              correctIndex: 1,
              marks: 1,
              order: 0,
            },
            {
              tenantId: tenant.id,
              text: 'What is the slope of y = 3x + 2?',
              options: ['2', '3', '5', '1'],
              correctIndex: 1,
              marks: 1,
              order: 1,
            },
            {
              tenantId: tenant.id,
              text: 'Simplify: (x^2)(x^3)',
              options: ['x^5', 'x^6', 'x', '2x^5'],
              correctIndex: 0,
              marks: 1,
              order: 2,
            },
          ],
        },
      },
    });
  }

  const noticeExists = await prisma.notice.findFirst({ where: { tenantId: tenant.id } });
  if (!noticeExists) {
    await prisma.notice.create({
      data: {
        tenantId: tenant.id,
        title: 'Welcome to the new term',
        body: 'Classes resume next week. Check your timetable.',
        pinned: true,
      },
    });
  }

  const eventExists = await prisma.event.findFirst({ where: { tenantId: tenant.id } });
  if (!eventExists) {
    await prisma.event.create({
      data: {
        tenantId: tenant.id,
        title: '2026 A/L BATCH',
        body: 'Target revision starts today. Lesson 02.',
        eventDate: new Date(),
        batchLabel: batchName,
      },
    });
  }

  const videoExists = await prisma.videoLesson.findFirst({ where: { tenantId: tenant.id } });
  if (!videoExists) {
    await prisma.videoLesson.create({
      data: {
        tenantId: tenant.id,
        title: 'Introduction lesson',
        description: 'A free intro video for all students.',
        provider: 'youtube',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        visibility: 'all',
      },
    });
  }

  return { tenant, admin, teacher, student };
}

async function main() {
  console.log('Seeding multi-tenant database...');
  const passwordHash = await bcrypt.hash('1234', 10);

  const superadmin = await findOrCreateUser(
    null,
    { name: 'Platform Owner', email: 'superadmin@lms.test', role: 'superadmin' },
    passwordHash
  );

  const t1 = await seedTenant('topmaths', 'Top Maths', 'A/L Combined Maths', '2026 A/L', passwordHash);
  const t2 = await seedTenant('ictpasidu', 'ICT With Pasidu', 'Grade 11 ICT', 'Grade 11', passwordHash);

  await seedGrade11IctGradebook(passwordHash);

  console.log('\nSeed complete. Password for ALL accounts: 1234\n');
  console.log(`Platform super-admin: ${superadmin.email}  ->  /admin/login`);
  for (const t of [t1, t2]) {
    console.log(`\nTenant "${t.tenant.name}" (/t/${t.tenant.slug})`);
    console.log(`  Admin:   ${t.admin.email}`);
    console.log(`  Teacher: ${t.teacher.email}`);
    console.log(`  Student: ${t.student.email}`);
  }
  console.log('\nGrade 11 ICT demo students (password 1234):');
  console.log('  student@ictpasidu.lms  ← complete student analytics (My results)');
  console.log('  sanjeewa@ictpasidu.lms · chathuranga@ictpasidu.lms · nimali@ictpasidu.lms');
  console.log('  kasun@ictpasidu.lms · ishara@ictpasidu.lms · tharindu@ictpasidu.lms');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
