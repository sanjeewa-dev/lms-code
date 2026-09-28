import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../lib/prisma';
import { storage } from './storage';
import { requireTenantId } from '../lib/tenantContext';
import type { FileKind } from '@prisma/client';
import { badRequest } from '../utils/httpError';

function startsWith(buffer: Buffer, bytes: number[]) {
  if (buffer.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[i] !== bytes[i]) return false;
  }
  return true;
}

async function validateUploadedFile(file: Express.Multer.File, buffer: Buffer) {
  const mime = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();

  // Block dangerous / scriptable types explicitly
  const blockedExt = new Set([
    '.svg',
    '.html',
    '.htm',
    '.js',
    '.mjs',
    '.ts',
    '.exe',
    '.bat',
    '.cmd',
    '.ps1',
    '.sh',
    '.php',
    '.jar',
    '.dll',
    '.cshtml',
    '.aspx',
  ]);
  if (blockedExt.has(ext) || mime === 'image/svg+xml' || mime.includes('javascript') || mime === 'text/html') {
    throw badRequest('This file type is not allowed');
  }

  // Reject double extensions like evil.pdf.exe
  const parts = (file.originalname || '').toLowerCase().split('.');
  if (parts.length > 2) {
    const last = `.${parts[parts.length - 1]}`;
    const prev = `.${parts[parts.length - 2]}`;
    if (blockedExt.has(last) || blockedExt.has(prev)) {
      throw badRequest('Suspicious file name rejected');
    }
  }

  if (mime.startsWith('image/')) {
    try {
      const metadata = await sharp(buffer, { failOn: 'error' }).metadata();
      if (!metadata.format || metadata.format === 'svg') throw new Error('Invalid image');
      const allowedImage = new Set(['jpeg', 'png', 'webp', 'gif']);
      if (!allowedImage.has(metadata.format)) throw new Error('Unsupported image format');
    } catch {
      throw badRequest('Invalid or malicious image upload');
    }
    return;
  }

  if (mime === 'application/pdf' || ext === '.pdf') {
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw badRequest('Invalid PDF upload');
    }
    // Reject PDFs that embed JS in the scanned header region
    const head = buffer.subarray(0, Math.min(buffer.length, 64 * 1024)).toString('latin1');
    if (/\/JavaScript\b|\/JS\b/i.test(head)) {
      throw badRequest('PDF contains disallowed active content');
    }
    return;
  }

  // Legacy Word .doc (OLE Compound File)
  if (mime === 'application/msword' || ext === '.doc') {
    if (!startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
      throw badRequest('Invalid Word (.doc) upload');
    }
    return;
  }

  // DOCX is a ZIP package containing word/
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    if (!startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
      throw badRequest('Invalid Word (.docx) upload');
    }
    const sample = buffer.subarray(0, Math.min(buffer.length, 128 * 1024)).toString('latin1');
    if (!sample.includes('word/')) {
      throw badRequest('File is not a valid Word document');
    }
    return;
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
