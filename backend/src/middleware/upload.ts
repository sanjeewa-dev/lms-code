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

function makeUploader(allowed: string[]) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.maxUploadBytes },
    fileFilter: (_req, file, cb) => {
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(badRequest(`Unsupported file type: ${file.mimetype}`));
      }
    },
  });
}

// Payment slips: images or PDF.
export const uploadSlip = makeUploader([...IMAGE_TYPES, 'application/pdf']).single('slip');

// Teacher view-only materials: PDF or images (rendered server-side).
export const uploadMaterial = makeUploader([...IMAGE_TYPES, 'application/pdf']).single('file');

// Student submissions: documents or images.
export const uploadSubmission = makeUploader([...IMAGE_TYPES, ...DOC_TYPES]).single('file');

// Class cover image.
export const uploadCover = makeUploader(IMAGE_TYPES).single('cover');

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];

// Uploaded lesson videos (stored on platform, streamed to students).
export const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_VIDEO_UPLOAD_MB ?? '500', 10) * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (VIDEO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(badRequest(`Unsupported video type: ${file.mimetype}. Use MP4, WebM, or OGG.`));
    }
  },
}).single('video');
