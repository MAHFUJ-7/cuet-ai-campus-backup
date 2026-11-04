import express from 'express';
import { protect, requireAdmin } from '../middleware/auth.js';
import { User, AuditLog, Update } from '../models/index.js';
import { asyncHandler, parsePagination, sendData } from '../utils/http.js';

const router = express.Router();
router.use(protect);
router.use(requireAdmin);

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [students, crs, coordinators, admins, totalUsers, totalUpdates] =
      await Promise.all([
        User.countDocuments({ roles: 'student' }),
        User.countDocuments({ roles: 'cr' }),
        User.countDocuments({ roles: 'coordinator' }),
        User.countDocuments({ roles: 'admin' }),
        User.countDocuments(),
        Update.countDocuments(),
      ]);
    const roleCounts = { students, crs, coordinators, admins };
    sendData(res, {
      totalUsers,
      activeCRs: crs,
      totalUpdates,
      roleCounts,
    });
  })
);

router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 5 });
    const [logs, total] = await Promise.all([
      AuditLog.find()
        .populate('userId', 'name role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(),
    ]);
    sendData(res, { logs, total, page, limit });
  })
);

export default router;
