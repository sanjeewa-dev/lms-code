import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { chatMessageSchema, chatStartSchema } from '../validation/schemas';
import { badRequest, forbidden, notFound } from '../utils/httpError';
import { createNotification } from '../services/notifications';

const router = Router({ mergeParams: true });

function isStaff(role: string) {
  return role === 'teacher' || role === 'admin';
}

function requireTenant(req: { tenant?: { id: string; slug: string } | null }) {
  if (!req.tenant?.id) throw badRequest('Tenant context required');
  return req.tenant;
}

async function studentCanMessageTeacher(
  tenantId: string,
  studentId: string,
  teacherId: string
) {
  const link = await prisma.class.findFirst({
    where: {
      tenantId,
      teacherId,
      enrollments: { some: { studentId, status: 'active', tenantId } },
    },
    select: { id: true },
  });
  return Boolean(link);
}

async function loadConversationForUser(
  tenantId: string,
  conversationId: string,
  userId: string,
  role: string
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    include: {
      teacher: { select: { id: true, name: true, email: true, role: true, tenantId: true } },
      student: { select: { id: true, name: true, email: true, role: true, tenantId: true } },
    },
  });
  if (!conversation) throw notFound('Conversation not found');
  if (conversation.teacher.tenantId !== tenantId || conversation.student.tenantId !== tenantId) {
    throw forbidden('Cross-tenant conversation is not allowed');
  }

  const isParticipant =
    conversation.teacherId === userId || conversation.studentId === userId;
  if (!isParticipant) throw forbidden('You are not a participant in this conversation');

  if (role === 'student' && conversation.studentId === userId) {
    const ok = await studentCanMessageTeacher(tenantId, userId, conversation.teacherId);
    if (!ok) throw forbidden('You can only chat with teachers of your enrolled classes');
  }

  return conversation;
}

type PeerClass = { id: string; title: string };

function serializeConversation(
  c: {
    id: string;
    teacherId: string;
    studentId: string;
    lastMessageAt: Date | null;
    createdAt: Date;
    teacher: { id: string; name: string; email: string };
    student: { id: string; name: string; email: string };
  },
  viewerId: string,
  lastMessage?: { body: string; createdAt: Date; senderId: string } | null,
  unreadCount = 0,
  peerClasses: PeerClass[] = []
) {
  const peer = viewerId === c.teacherId ? c.student : c.teacher;
  return {
    id: c.id,
    peer: { id: peer.id, name: peer.name, email: peer.email },
    peerClasses,
    lastMessage: lastMessage
      ? {
          body: lastMessage.body,
          createdAt: lastMessage.createdAt.toISOString(),
          senderId: lastMessage.senderId,
        }
      : null,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    unreadCount,
    createdAt: c.createdAt.toISOString(),
  };
}

async function sharedClasses(
  tenantId: string,
  teacherId: string,
  studentId: string
): Promise<PeerClass[]> {
  const classes = await prisma.class.findMany({
    where: {
      tenantId,
      teacherId,
      enrollments: { some: { studentId, status: 'active', tenantId } },
    },
    select: { id: true, title: true },
  });
  return classes.sort((a, b) => a.title.localeCompare(b.title));
}

async function studentActiveClasses(tenantId: string, studentId: string): Promise<PeerClass[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId, studentId, status: 'active' },
    select: { class: { select: { id: true, title: true } } },
  });
  return enrollments
    .map((e) => e.class)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** GET /chat/contacts — people the current user can start a chat with */
router.get(
  '/chat/contacts',
  authenticate,
  requireRole('admin', 'teacher', 'student'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const tenant = requireTenant(req);
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const classId = String(req.query.classId ?? '').trim() || undefined;

    if (user.role === 'student') {
      const filterClasses = await prisma.class.findMany({
        where: {
          tenantId: tenant.id,
          enrollments: { some: { studentId: user.sub, status: 'active', tenantId: tenant.id } },
        },
        select: { id: true, title: true },
        orderBy: { title: 'asc' },
      });

      const enrolled = await prisma.class.findMany({
        where: {
          tenantId: tenant.id,
          enrollments: { some: { studentId: user.sub, status: 'active', tenantId: tenant.id } },
          ...(classId ? { id: classId } : {}),
        },
        select: {
          id: true,
          title: true,
          teacher: { select: { id: true, name: true, email: true, subject: true, tenantId: true } },
        },
        orderBy: { title: 'asc' },
      });

      const byTeacher = new Map<
        string,
        {
          id: string;
          name: string;
          email: string;
          subject: string | null;
          classes: PeerClass[];
        }
      >();
      for (const cls of enrolled) {
        if (cls.teacher.tenantId !== tenant.id) continue;
        const existing = byTeacher.get(cls.teacher.id);
        if (existing) {
          if (!existing.classes.some((c) => c.id === cls.id)) {
            existing.classes.push({ id: cls.id, title: cls.title });
          }
        } else {
          byTeacher.set(cls.teacher.id, {
            id: cls.teacher.id,
            name: cls.teacher.name,
            email: cls.teacher.email,
            subject: cls.teacher.subject,
            classes: [{ id: cls.id, title: cls.title }],
          });
        }
      }

      let contacts = [...byTeacher.values()].map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        role: 'teacher' as const,
        subtitle: t.classes.map((c) => c.title).join(', ') || t.subject || 'Teacher',
        classes: t.classes,
      }));

      if (q) {
        contacts = contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q) ||
            c.subtitle.toLowerCase().includes(q)
        );
      }

      return res.json({ contacts, filterClasses });
    }

    // Teacher / admin — approved students in THIS tenant only
    const students = await prisma.user.findMany({
      where: {
        tenantId: tenant.id,
        role: 'student',
        status: 'approved',
        ...(classId
          ? {
              enrollments: {
                some: {
                  tenantId: tenant.id,
                  status: 'active',
                  classId,
                  ...(user.role === 'teacher'
                    ? { class: { teacherId: user.sub, tenantId: tenant.id } }
                    : {}),
                },
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        enrollments: {
          where: {
            tenantId: tenant.id,
            status: 'active',
            ...(user.role === 'teacher'
              ? { class: { teacherId: user.sub, tenantId: tenant.id } }
              : {}),
          },
          select: { class: { select: { id: true, title: true } } },
        },
      },
      orderBy: { name: 'asc' },
      take: 50,
    });

    const filterClasses =
      user.role === 'teacher'
        ? await prisma.class.findMany({
            where: { tenantId: tenant.id, teacherId: user.sub },
            select: { id: true, title: true },
            orderBy: { title: 'asc' },
          })
        : await prisma.class.findMany({
            where: { tenantId: tenant.id },
            select: { id: true, title: true },
            orderBy: { title: 'asc' },
            take: 100,
          });

    res.json({
      contacts: students.map((s) => {
        const classes = s.enrollments
          .map((e) => e.class)
          .sort((a, b) => a.title.localeCompare(b.title));
        return {
          id: s.id,
          name: s.name,
          email: s.email,
          role: 'student' as const,
          subtitle: classes.length ? classes.map((c) => c.title).join(', ') : s.email,
          classes,
        };
      }),
      filterClasses,
    });
  })
);

/** GET /chat/unread-count — total unread messages for the current user */
router.get(
  '/chat/unread-count',
  authenticate,
  requireRole('admin', 'teacher', 'student'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const tenant = requireTenant(req);
    const conversationWhere =
      user.role === 'student'
        ? { tenantId: tenant.id, studentId: user.sub }
        : { tenantId: tenant.id, teacherId: user.sub };

    const count = await prisma.message.count({
      where: {
        tenantId: tenant.id,
        senderId: { not: user.sub },
        readAt: null,
        conversation: conversationWhere,
      },
    });

    res.json({ count });
  })
);

/** GET /chat/conversations */
router.get(
  '/chat/conversations',
  authenticate,
  requireRole('admin', 'teacher', 'student'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const tenant = requireTenant(req);
    const where =
      user.role === 'student'
        ? { tenantId: tenant.id, studentId: user.sub, lastMessageAt: { not: null } as const }
        : { tenantId: tenant.id, teacherId: user.sub, lastMessageAt: { not: null } as const };

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        student: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, createdAt: true, senderId: true },
        },
      },
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      take: 100,
    });

    const withUnread = await Promise.all(
      conversations.map(async (c) => {
        const unreadCount = await prisma.message.count({
          where: {
            tenantId: tenant.id,
            conversationId: c.id,
            senderId: { not: user.sub },
            readAt: null,
          },
        });
        let peerClasses: PeerClass[];
        if (user.role === 'student') {
          peerClasses = await sharedClasses(tenant.id, c.teacherId, c.studentId);
        } else {
          peerClasses = await sharedClasses(tenant.id, c.teacherId, c.studentId);
          if (peerClasses.length === 0) {
            peerClasses = await studentActiveClasses(tenant.id, c.studentId);
          }
        }
        return serializeConversation(c, user.sub, c.messages[0] ?? null, unreadCount, peerClasses);
      })
    );

    res.json({ conversations: withUnread });
  })
);

/** POST /chat/conversations — start or resume a thread with peerId */
router.post(
  '/chat/conversations',
  authenticate,
  requireRole('admin', 'teacher', 'student'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const tenant = requireTenant(req);
    const { peerId } = chatStartSchema.parse(req.body);
    if (peerId === user.sub) throw badRequest('Cannot chat with yourself');

    const peer = await prisma.user.findFirst({
      where: { id: peerId, tenantId: tenant.id },
      select: { id: true, name: true, email: true, role: true, status: true, tenantId: true },
    });
    if (!peer || peer.status !== 'approved') throw notFound('User not found');

    let teacherId: string;
    let studentId: string;

    if (user.role === 'student') {
      if (!isStaff(peer.role)) throw forbidden('Students can only chat with teachers');
      const ok = await studentCanMessageTeacher(tenant.id, user.sub, peer.id);
      if (!ok) throw forbidden('You can only chat with teachers of your enrolled classes');
      teacherId = peer.id;
      studentId = user.sub;
    } else {
      if (peer.role !== 'student') throw forbidden('Staff can only chat with students');
      teacherId = user.sub;
      studentId = peer.id;
    }

    let conversation = await prisma.conversation.findUnique({
      where: {
        tenantId_teacherId_studentId: {
          tenantId: tenant.id,
          teacherId,
          studentId,
        },
      },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        student: { select: { id: true, name: true, email: true } },
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          tenantId: tenant.id,
          teacherId,
          studentId,
        },
        include: {
          teacher: { select: { id: true, name: true, email: true } },
          student: { select: { id: true, name: true, email: true } },
        },
      });
    }

    let peerClasses = await sharedClasses(tenant.id, teacherId, studentId);
    if (peerClasses.length === 0 && user.role !== 'student') {
      peerClasses = await studentActiveClasses(tenant.id, studentId);
    }

    res.status(201).json({
      conversation: serializeConversation(conversation, user.sub, null, 0, peerClasses),
    });
  })
);

/** GET /chat/conversations/:id/messages */
router.get(
  '/chat/conversations/:id/messages',
  authenticate,
  requireRole('admin', 'teacher', 'student'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const tenant = requireTenant(req);
    const conversation = await loadConversationForUser(tenant.id, req.params.id, user.sub, user.role);

    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);
    const before = req.query.before ? new Date(String(req.query.before)) : undefined;

    const messages = await prisma.message.findMany({
      where: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: { select: { id: true, name: true } },
      },
    });

    await prisma.message.updateMany({
      where: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        senderId: { not: user.sub },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    res.json({
      messages: messages
        .reverse()
        .map((m) => ({
          id: m.id,
          body: m.body,
          senderId: m.senderId,
          senderName: m.sender.name,
          readAt: m.readAt?.toISOString() ?? null,
          createdAt: m.createdAt.toISOString(),
          mine: m.senderId === user.sub,
        })),
    });
  })
);

/** POST /chat/conversations/:id/messages */
router.post(
  '/chat/conversations/:id/messages',
  authenticate,
  requireRole('admin', 'teacher', 'student'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const tenant = requireTenant(req);
    const conversation = await loadConversationForUser(tenant.id, req.params.id, user.sub, user.role);
    const { body } = chatMessageSchema.parse(req.body);

    const message = await prisma.message.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        senderId: user.sub,
        body,
      },
      include: {
        sender: { select: { id: true, name: true } },
      },
    });

    await prisma.conversation.updateMany({
      where: { id: conversation.id, tenantId: tenant.id },
      data: { lastMessageAt: message.createdAt },
    });

    const peerId =
      user.sub === conversation.teacherId ? conversation.studentId : conversation.teacherId;
    const sender = await prisma.user.findFirst({
      where: { id: user.sub, tenantId: tenant.id },
      select: { name: true },
    });

    try {
      await createNotification({
        tenantId: tenant.id,
        userId: peerId,
        type: 'chat_message',
        title: `New message from ${sender?.name ?? 'someone'}`,
        body: body.length > 120 ? `${body.slice(0, 117)}...` : body,
        link: `/${tenant.slug}/chat?c=${conversation.id}`,
      });
    } catch {
      /* notification is best-effort */
    }

    res.status(201).json({
      message: {
        id: message.id,
        body: message.body,
        senderId: message.senderId,
        senderName: message.sender.name,
        readAt: null,
        createdAt: message.createdAt.toISOString(),
        mine: true,
      },
    });
  })
);

export default router;
