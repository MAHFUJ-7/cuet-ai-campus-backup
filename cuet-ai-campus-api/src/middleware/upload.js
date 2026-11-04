import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env, publicUrl } from '../config/env.js';

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
]);

const safeExt = (originalName = '') => {
  const ext = path.extname(originalName).toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(ext)) return ext;
  return '.bin';
};

const storageFor = (subdirectory) => {
  const destination = path.join(env.uploadDir, subdirectory);
  fs.mkdirSync(destination, { recursive: true });

  return multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, destination),
    filename: (_req, file, callback) => {
      const stem = path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'file';
      callback(
        null,
        `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${stem}${safeExt(file.originalname)}`
      );
    },
  });
};

const fileFilter = (_req, file, callback) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return callback(new Error('Unsupported file type'));
  }
  callback(null, true);
};

const pdfFilter = (_req, file, callback) => {
  if (
    file.mimetype !== 'application/pdf' ||
    path.extname(file.originalname).toLowerCase() !== '.pdf'
  ) {
    return callback(new Error('Only PDF files are allowed'));
  }
  callback(null, true);
};

const limits = { fileSize: env.maxUploadMb * 1024 * 1024 };

export const updateUpload = multer({
  storage: storageFor('updates'),
  fileFilter,
  limits,
});

export const sharedUpload = multer({
  storage: storageFor('shared'),
  fileFilter,
  limits,
});

export const routinePdfUpload = multer({
  storage: storageFor('routine'),
  fileFilter: pdfFilter,
  limits,
});

export const noticePdfUpload = multer({
  storage: storageFor('updates'),
  fileFilter: pdfFilter,
  limits: { ...limits, files: 1 },
});

export const uploadedFileUrl = (file, subdirectory) =>
  publicUrl(`/uploads/${subdirectory}/${file.filename}`);

export const relativeUploadPath = (file, subdirectory) =>
  `/uploads/${subdirectory}/${file.filename}`;
