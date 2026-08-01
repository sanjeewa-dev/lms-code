import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../lib/prisma';
import { storage } from './storage';
import { requireTenantId } from '../lib/tenantContext';
import type { FileKind } from '@prisma/client';
import { badRequest } from '../utils/httpError';

async function validateUploadedFile(file: Express.Multer.File, buffer: Buffer) {
  const mime = file.mimetype.toLowerCase();
  if (mime === 'image/svg+xml' || path.extname(file.originalname).toLowerCase() === '.svg') {
    throw badRequest('SVG uploads are not allowed');
  }
  if (mime.startsWith('image/')) {
    try {
      const metadata = await sharp(buffer, { failOn: 'error' }).metadata();
      if (!metadata.format || metadata.format === 'svg') throw new Error('Invalid image');
    } catch {
      throw badRequest('Invalid image upload');
    }
  }
  if (mime === 'application/pdf' && !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw badRequest('Invalid PDF upload');
  }
}

export async function persistUploadedFile(
  file: Express.Multer.File,
  ownerId: string,
  kind: FileKind
) {
  const isDiskVideo = Boolean(file.path && file.mimetype.startsWith('video/'));
  const buffer = isDiskVideo ? null : file.buffer ?? (file.path ? await fs.readFile(file.path) : null);
  if (!buffer && !isDiskVideo) throw badRequest('Uploaded file could not be read');
  try {
    if (buffer) await validateUploadedFile(file, buffer);
    const storageKey = isDiskVideo
      ? await storage.saveFromPath(file.path, file.originalname)
      : await storage.save(buffer!, file.originalname);
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
  } finally {
    if (file.path) await fs.rm(file.path, { force: true });
  }
}
