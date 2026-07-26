import { prisma } from '../lib/prisma';
import { storage } from './storage';
import { requireTenantId } from '../lib/tenantContext';
import type { FileKind } from '@prisma/client';

export async function persistUploadedFile(
  file: Express.Multer.File,
  ownerId: string,
  kind: FileKind
) {
  const storageKey = await storage.save(file.buffer, file.originalname);
  return prisma.file.create({
    data: {
      tenantId: requireTenantId(),
      ownerId,
      storageKey,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      kind,
    },
  });
}
