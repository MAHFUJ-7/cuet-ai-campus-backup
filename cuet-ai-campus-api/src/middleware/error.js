import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/http.js';

export const notFound = (req, _res, next) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

const duplicateMessage = (error) => {
  const field = Object.keys(error.keyPattern || error.keyValue || {})[0];
  if (field === 'email') return 'An account with this email already exists';
  if (field === 'studentId') return 'This student ID is already registered';
  return field ? `${field} already exists` : 'A record with these values already exists';
};

export function errorHandler(error, req, res, _next) {
  let status = error.status || error.statusCode || 500;
  let message = error.message || 'Something went wrong';
  let details = error.details || null;

  if (error instanceof multer.MulterError) {
    status = 400;
    message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `File is too large. Maximum size is ${env.maxUploadMb} MB.`
        : error.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Unexpected file field.'
          : error.message;
  } else if (error.code === 11000) {
    status = 409;
    message = duplicateMessage(error);
  } else if (error.name === 'ValidationError') {
    status = 400;
    const first = Object.values(error.errors)[0];
    message = first?.message || 'Validation failed';
    details = Object.fromEntries(
      Object.entries(error.errors).map(([key, value]) => [key, value.message])
    );
  } else if (error.name === 'CastError') {
    status = 400;
    message = `Invalid ${error.path}`;
  } else if (error.name === 'JsonWebTokenError') {
    status = 401;
    message = 'Invalid session token';
  } else if (error.name === 'TokenExpiredError') {
    status = 401;
    message = 'Your session has expired. Please sign in again.';
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, error);
  }

  res.status(status).json({
    success: false,
    message,
    ...(details && !env.isProduction ? { details } : {}),
  });
}
