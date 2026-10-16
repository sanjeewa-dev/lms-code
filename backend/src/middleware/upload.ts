import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from '../config/env';
import { badRequest } from '../utils/httpError';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'text/plain',
];

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.zip': 'application/zip',
  '.txt': 'text/plain',
};

function normalizeUploadMime(file: Express.Multer.File, allowed: string[]): string | null {
  const mime = (file.mimetype || '').toLowerCase();
  if (allowed.includes(mime)) return mime;
  // Browsers sometimes send empty or generic MIME for Office docs.
  if (!mime || mime === 'application/octet-stream') {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const guessed = EXT_MIME[ext];
    if (guessed && allowed.includes(guessed)) {
      file.mimetype = guessed;
      return guessed;
    }
  }
  return null;
}

function makeUploader(allowed: string[]) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.maxUploadBytes },
    fileFilter: (_req, file, cb) => {
      if (normalizeUploadMime(file, allowed)) {
        cb(null, true);
      } else {
        cb(badRequest(`Unsupported file type: ${file.mimetype || path.extname(file.originalname) || 'unknown'}`));
      }
    },
  });
}

// Payment slips: images or PDF.
export const uploadSlip = makeUploader([...IMAGE_TYPES, 'application/pdf']).single('slip');

// Teacher view-only materials: PDF or images (rendered server-side).
export const uploadMaterial = makeUploader([...IMAGE_TYPES, 'application/pdf']).single('file');

// Student submissions: documents or images (no generic zip/txt unless needed elsewhere).
export const uploadSubmission = makeUploader([...IMAGE_TYPES, ...DOC_TYPES]).single('file');

// Class cover image.
export const uploadCover = makeUploader(IMAGE_TYPES).single('cover');

// Institute logo.
export const uploadLogo = makeUploader(IMAGE_TYPES).single('logo');

// Teacher shipping-label branding photo / flyer.
export const uploadShippingLabelPhoto = makeUploader(IMAGE_TYPES).single('photo');

export const uploadQuestionFigure = makeUploader(IMAGE_TYPES).single('figure');

/** Question bank paper uploads: JPEG/PNG, PDF, or Word .docx (ScoreSmart parity). */
export const QUESTION_BANK_PAPER_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const uploadQuestionBankPaper = makeUploader(QUESTION_BANK_PAPER_TYPES).single('paper');

/** Legacy attachment uploads: images, PDF, or Word. */
export const QUESTION_BANK_UPLOAD_TYPES = [
  ...IMAGE_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const uploadQuestionBankFile = makeUploader(QUESTION_BANK_UPLOAD_TYPES).single('file');

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];

// Uploaded lesson videos (stored on platform, streamed to students).
export const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const directory = path.join(env.uploadDir, 'tmp');
      fs.mkdirSync(directory, { recursive: true });
      cb(null, directory);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`);
    },
  }),
  limits: {
    fileSize: parseInt(process.env.MAX_VIDEO_UPLOAD_MB ?? '100', 10) * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (VIDEO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(badRequest(`Unsupported video type: ${file.mimetype}. Use MP4, WebM, or OGG.`));
    }
  },
}).single('video');
