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

async function ensurePublishedQuiz(
  tenantId: string,
  classId: string,
  title: string,
  totalMarks: number,
  questionTexts: string[],
  daysAgo: number
) {
  const existing = await prisma.quiz.findFirst({ where: { classId, title } });
  if (existing) {
    if (!existing.isPublished || existing.totalMarks !== totalMarks) {
      return prisma.quiz.update({
        where: { id: existing.id },
        data: { isPublished: true, totalMarks },
      });
    }
    return existing;
  }
  const created = new Date();
  created.setDate(created.getDate() - daysAgo);
  const marksEach = totalMarks / questionTexts.length;
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
        create: questionTexts.map((text, order) => ({
          tenantId,
          text,
          options: ['A', 'B', 'C', 'D'],
          correctIndex: 0,
          marks: marksEach,
          order,
        })),
      },
    },
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

async function upsertQuizAttempt(params: {
  tenantId: string;
  quizId: string;
  studentId: string;
  score: number;
  daysAgo: number;
}) {
  const submittedAt = new Date();
  submittedAt.setDate(submittedAt.getDate() - params.daysAgo);
  const existing = await prisma.quizAttempt.findUnique({
    where: { quizId_studentId: { quizId: params.quizId, studentId: params.studentId } },
  });
  if (existing) {
    return prisma.quizAttempt.update({
      where: { id: existing.id },
      data: { score: params.score, submittedAt },
    });
  }
  return prisma.quizAttempt.create({
    data: {
      tenantId: params.tenantId,
      quizId: params.quizId,
      studentId: params.studentId,
      score: params.score,
      submittedAt,
    },
  });
}

/**
 * Rich Grade 11 ICT gradebook demo data for graphs:
 * overall / quiz / assignment progress with varied student profiles.
 */
async function seedGrade11IctGradebook(passwordHash: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'ictpasidu' } });
  if (!tenant) return;

  const teacher = await findOrCreateUser(
    tenant.id,
    { name: 'ICT With Pasidu Teacher', email: 'teacher@ictpasidu.lms', role: 'teacher' },
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

  const roster = [
    { name: 'ICT With Pasidu Student', email: 'student@ictpasidu.lms', profile: 'steady' as const },
    { name: 'Sanjeewa Perera', email: 'sanjeewa@ictpasidu.lms', profile: 'strong' as const },
    { name: 'Chathuranga Bandara', email: 'chathuranga@ictpasidu.lms', profile: 'incomplete' as const },
    { name: 'Nimali Fernando', email: 'nimali@ictpasidu.lms', profile: 'rising' as const },
    { name: 'Kasun Jayasuriya', email: 'kasun@ictpasidu.lms', profile: 'struggling' as const },
    { name: 'Ishara Silva', email: 'ishara@ictpasidu.lms', profile: 'quizStar' as const },
    { name: 'Tharindu Wickramasinghe', email: 'tharindu@ictpasidu.lms', profile: 'assignmentStar' as const },
  ];

  const students = [];
  for (const s of roster) {
    const user = await findOrCreateUser(
      tenant.id,
      { name: s.name, email: s.email, role: 'student' },
      passwordHash
    );
    await ensureEnrollment(tenant.id, klass.id, user.id);
    students.push({ ...s, user });
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
    50
  );
  const q1 = await ensurePublishedQuiz(
    tenant.id,
    klass.id,
    'Quiz 1 — Intro to ICT',
    10,
    ['What is hardware?', 'What is software?', 'CPU stands for?', 'RAM is…?', 'Input device?'],
    40
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
    28
  );
  const qDb = await ensurePublishedQuiz(
    tenant.id,
    klass.id,
    'Quiz — Databases',
    15,
    ['Primary key?', 'Foreign key?', 'Normalisation?', 'SQL SELECT?', 'ER diagram?'],
    14
  );
  const qNet = await ensurePublishedQuiz(
    tenant.id,
    klass.id,
    'Quiz — Networking',
    15,
    ['Router purpose?', 'HTTP vs HTTPS?', 'DNS?', 'Firewall?', 'Bandwidth?'],
    5
  );
  const quizzes = [qSample, q1, qSystems, qDb, qNet];

  // max marks: assignments 20/25/40/30 · quizzes 3/10/20/15/15
  const scorePlans: Record<
    (typeof roster)[number]['profile'],
    { assignments: (number | null)[]; quizzes: (number | null)[] }
  > = {
    steady: {
      assignments: [16, 20, 32, 24],
      quizzes: [2, 8, 16, 12, 11],
    },
    strong: {
      assignments: [19, 24, 38, 28],
      quizzes: [3, 10, 19, 14, 14],
    },
    incomplete: {
      assignments: [null, 12, null, null],
      quizzes: [null, 4, null, null, null],
    },
    rising: {
      assignments: [10, 15, 30, 27],
      quizzes: [1, 5, 12, 12, 13],
    },
    struggling: {
      assignments: [8, 9, 14, 11],
      quizzes: [1, 3, 7, 5, 4],
    },
    quizStar: {
      assignments: [12, 14, 22, 18],
      quizzes: [3, 9, 18, 14, 14],
    },
    assignmentStar: {
      assignments: [18, 23, 36, 27],
      quizzes: [2, 5, 10, 8, 7],
    },
  };

  const feedbackByProfile: Partial<Record<(typeof roster)[number]['profile'], string>> = {
    strong: 'Excellent depth and clarity. Keep this standard.',
    rising: 'Clear improvement — keep practising past papers.',
    struggling: 'Please revise the worked examples and resubmit corrections.',
    incomplete: 'Submission incomplete — please upload the missing sections.',
  };

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
      await upsertQuizAttempt({
        tenantId: tenant.id,
        quizId: quizzes[i].id,
        studentId: s.user.id,
        score,
        daysAgo: 48 - i * 9,
      });
    }
  }

  console.log(
    `\nGrade 11 ICT enriched: ${students.length} students, ${assessments.length} assessments, ${quizzes.length} quizzes with graded attempts.`
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
