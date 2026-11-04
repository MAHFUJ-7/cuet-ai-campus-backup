import express from 'express';
import { protect } from '../middleware/auth.js';
import * as scheduleService from '../services/schedule.js';
import { AppError, asyncHandler, sendData } from '../utils/http.js';
import { resolveSectionForUser } from '../services/access.js';

const router = express.Router();
router.use(protect);

router.get(
  '/day',
  asyncHandler(async (req, res) => {
    const date = req.query.date;
    if (!date) throw new AppError(400, 'date is required');
    // Never trust a client-supplied sectionId on its own: students only see
    // their own section, coordinators only sections in their scope.
    const section = await resolveSectionForUser(req.user, req.query.sectionId || null);
    const day = await scheduleService.getDaySchedule({
      date,
      sectionId: section._id,
    });
    sendData(res, day);
  })
);

router.get(
  '/range',
  asyncHandler(async (req, res) => {
    const from = req.query.from;
    const to = req.query.to;
    if (!from || !to) throw new AppError(400, 'from and to are required');
    const section = await resolveSectionForUser(req.user, req.query.sectionId || null);
    const days = await scheduleService.getDayStatuses({
      from,
      to,
      sectionId: section._id,
    });
    sendData(res, { days });
  })
);

export default router;
