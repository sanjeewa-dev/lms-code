import sharp from 'sharp';
import { prisma } from '../lib/prisma';
import { storage } from './storage';
import { questionFigureUrl } from '../lib/questionFigureUrl';
import { persistUploadedFile } from './files';
import { badRequest } from '../utils/httpError';

export async function persistQuestionFigureBuffer(params: {
  tenantId: string;
  ownerId: string;
  slug: string;
  buffer: Buffer;
  originalName?: string;
}): Promise<{ fileId: string; imageUrl: string }> {
  const jpeg = await sharp(params.buffer)
    .rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const originalName = `${(params.originalName ?? 'figure').replace(/\.[^.]+$/, '')}.jpg`;
  const storageKey = await storage.save(jpeg, originalName);
  const file = await prisma.file.create({
    data: {
      tenantId: params.tenantId,
      ownerId: params.ownerId,
      storageKey,
      originalName,
      mimeType: 'image/jpeg',
      size: jpeg.length,
      kind: 'question_figure',
    },
  });
  return { fileId: file.id, imageUrl: questionFigureUrl(params.slug, file.id) };
}

export async function persistQuestionFigureUpload(params: {
  file: Express.Multer.File;
  ownerId: string;
  slug: string;
}) {
  if (!params.file) throw badRequest('No figure uploaded');
  const saved = await persistUploadedFile(params.file, params.ownerId, 'question_figure');
  return { fileId: saved.id, imageUrl: questionFigureUrl(params.slug, saved.id) };
}
