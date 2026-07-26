import { PrismaClient } from '@prisma/client';
import { getContext } from './tenantContext';

/**
 * Unscoped client. Use ONLY for platform (superadmin) operations and for
 * auth / tenant-resolution queries that must run before a tenant context
 * exists. Everything tenant-facing should go through the scoped `prisma`.
 */
export const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// Models that carry a tenantId and must be isolated per tenant.
const TENANT_MODELS = new Set<string>([
  'Class',
  'Enrollment',
  'Payment',
  'Material',
  'Submission',
  'Quiz',
  'Question',
  'QuizAttempt',
  'Answer',
  'File',
  'Batch',
  'VideoLesson',
  'Notice',
  'Event',
  'ClassSchedule',
  'Attendance',
  'Notification',
]);

// Operations that accept a `where` we can safely constrain by tenantId.
const WHERE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

/**
 * Tenant-scoped Prisma client. A query hook reads the current request's
 * tenantId from AsyncLocalStorage and:
 *   - constrains reads / bulk writes with `where.tenantId`
 *   - stamps `data.tenantId` on top-level creates
 * Single-record findUnique/update/delete are left untouched; controllers scope
 * those explicitly (findFirst by { id, tenantId } or verify then mutate by id).
 * When there is no tenant context (platform / auth flows via basePrisma), the
 * hook is a no-op.
 */
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const ctx = getContext();
        const tenantId = ctx?.tenantId ?? null;
        if (!model || !TENANT_MODELS.has(model) || !tenantId) {
          return query(args);
        }

        const typedArgs = args as Record<string, unknown>;
        if (WHERE_OPS.has(operation)) {
          typedArgs.where = { AND: [typedArgs.where ?? {}, { tenantId }] };
        } else if (operation === 'create') {
          typedArgs.data = { tenantId, ...(typedArgs.data as object) };
        } else if (operation === 'createMany') {
          const data = typedArgs.data;
          typedArgs.data = Array.isArray(data)
            ? data.map((d) => ({ tenantId, ...(d as object) }))
            : { tenantId, ...(data as object) };
        }

        return query(args);
      },
    },
  },
});

export type ScopedPrisma = typeof prisma;
