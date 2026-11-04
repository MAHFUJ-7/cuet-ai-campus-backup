export class AppError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
    this.isOperational = true;
  }
}

export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export const sendData = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });

export const sendList = (
  res,
  items,
  { page = 1, limit = items.length, total = items.length } = {},
  status = 200
) =>
  res.status(status).json({
    success: true,
    data: {
      items,
      page,
      limit,
      total,
      pages: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  });

export const sendMessage = (res, message, data = null, status = 200) =>
  res.status(status).json({ success: true, message, ...(data ? { data } : {}) });

export function parsePagination(query = {}, options = {}) {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 200;
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit)
  );
  return { page, limit, skip: (page - 1) * limit };
}

export const cleanString = (value) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();

export function assert(condition, status, message) {
  if (!condition) throw new AppError(status, message);
}
