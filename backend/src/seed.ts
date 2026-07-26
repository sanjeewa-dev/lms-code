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

  const enrollment = await prisma.enrollment.findFirst({
    where: { classId: klass.id, studentId: student.id },
  });
  if (!enrollment) {
    await prisma.enrollment.create({
      data: { tenantId: tenant.id, classId: klass.id, studentId: student.id, status: 'active' },
    });
  }

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
            { tenantId: tenant.id, text: 'Solve for x: 2x + 3 = 11', options: ['2', '4', '5', '8'], correctIndex: 1, marks: 1, order: 0 },
            { tenantId: tenant.id, text: 'What is the slope of y = 3x + 2?', options: ['2', '3', '5', '1'], correctIndex: 1, marks: 1, order: 1 },
            { tenantId: tenant.id, text: 'Simplify: (x^2)(x^3)', options: ['x^5', 'x^6', 'x', '2x^5'], correctIndex: 0, marks: 1, order: 2 },
          ],
        },
      },
    });
  }

  const noticeExists = await prisma.notice.findFirst({ where: { tenantId: tenant.id } });
  if (!noticeExists) {
    await prisma.notice.create({
      data: { tenantId: tenant.id, title: 'Welcome to the new term', body: 'Classes resume next week. Check your timetable.', pinned: true },
    });
  }

  const eventExists = await prisma.event.findFirst({ where: { tenantId: tenant.id } });
  if (!eventExists) {
    await prisma.event.create({
      data: { tenantId: tenant.id, title: '2026 A/L BATCH', body: 'Target revision starts today. Lesson 02.', eventDate: new Date(), batchLabel: batchName },
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

  console.log('\nSeed complete. Password for ALL accounts: 1234\n');
  console.log(`Platform super-admin: ${superadmin.email}  ->  /admin/login`);
  for (const t of [t1, t2]) {
    console.log(`\nTenant "${t.tenant.name}" (/t/${t.tenant.slug})`);
    console.log(`  Admin:   ${t.admin.email}`);
    console.log(`  Teacher: ${t.teacher.email}`);
    console.log(`  Student: ${t.student.email}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
