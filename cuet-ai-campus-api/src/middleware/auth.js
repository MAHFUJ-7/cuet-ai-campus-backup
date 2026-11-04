import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { AppError, asyncHandler } from '../utils/http.js';
import { populatedUserQuery } from '../services/profile.js';

export const signToken = (user) =>
  jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      roles: user.roles,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    throw new AppError(401, 'Authentication required');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new AppError(401, 'Your session has expired. Please sign in again.');
  }

  const user = await populatedUserQuery(User.findById(decoded.sub));
  if (!user || !user.isActive) {
    throw new AppError(401, 'Account not found or disabled');
  }

  req.user = user;
  req.auth = decoded;
  next();
});

export const allow = (...roles) => (req, _res, next) => {
  const userRoles = req.user?.roles?.length ? req.user.roles : [req.user?.role];
  if (!userRoles.some((role) => roles.includes(role))) {
    return next(new AppError(403, 'You do not have access to this resource'));
  }
  next();
};

export const requireAdmin = allow('admin');
export const requireCoordinator = allow('coordinator', 'admin');
export const requireCr = allow('cr', 'coordinator', 'admin');

export const hasRole = (user, role) =>
  Boolean(user?.roles?.includes(role) || user?.role === role);

export const isAdmin = (user) => hasRole(user, 'admin');
export const isCoordinator = (user) => hasRole(user, 'coordinator');
export const isCr = (user) => hasRole(user, 'cr');
