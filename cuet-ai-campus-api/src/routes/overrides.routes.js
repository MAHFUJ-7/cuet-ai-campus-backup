import express from 'express';
import mongoose from 'mongoose';
import { protect, requireCr } from '../middleware/auth.js';
import { ScheduleOverride, RoutineEntry, Update } from '../models/index.js';
import { asyncHandler, sendData } from '../utils/http.js';
import { AppError } from '../utils/http.js';
import { isValidTime, normalizeDate, dayNameFor } from '../utils/dates.js';
import { logAudit } from '../services/audit.js';
import { idOf } from '../services/access.js';
import { overridePopulate } from '../services/routineSerializer.js';

const router = express.Router();
router.use(protect);

/**
 * The Updates-feed post that mirrors a CR declaration. Without it students on
 * other devices would only see the change if they opened the calendar on the
 * exact date — the feed would stay silent.
 */
function overrideFeedContent(override) {
  const course =
    override.courseId && typeof override.courseId === 'object'
      ? override.courseId
      : null;
  const code = course?.code || 'Class';
  const title = course?.title || '';
  const date = override.specificDate || override.startDate;
  const time =
    override.startTime && override.endTime
      ? `${override.startTime}–${override.endTime}`
      : '';
  const detail = [title, time, override.room ? `Room ${override.room}` : '', override.reason]
    .filter(Boolean)
    .join(' · ');

  switch (override.type) {
    case 'auto_day_off':
      return {
        type: 'cancellation',
        priority: 'important',
        title: `Day off declared on ${date}`,
        description: override.reason || 'Classes are suspended for the day.',
      };
    case 'mid_break':
      return {
        type: 'cancellation',
        priority: 'important',
        title: `Mid-break declared ${override.startDate} → ${override.endDate}`,
        description: override.reason || 'Classes are suspended for the mid-break.',
      };
    case 'class_cancellation':
      return {
        type: 'class_cancellation',
        priority: 'urgent',
        title: `${code} class cancelled on ${date}`,
        description: detail || 'This class has been cancelled.',
      };
    case 'room_change':
      return {
        type: 'room_change',
        priority: 'important',
        title: `${code} room changed on ${date}`,
        description: `New room: ${override.room || 'TBA'}${override.reason ? ` · ${override.reason}` : ''}`,
      };
    case 'time_change':
      return {
        type: 'time_change',
        priority: 'important',
        title: `${code} time changed on ${date}`,
        description: `New time: ${time || 'TBA'}${override.reason ? ` · ${override.reason}` : ''}`,
      };
    case 'extra_class':
      return override.classType === 'ct'
        ? {
            type: 'ct_reminder',
            priority: 'important',
            title: `${code} CT on ${date}`,
            description: detail || 'A class test has been declared.',
          }
        : {
            type: 'extra_class',
            priority: 'normal',
            title: `${code} extra class on ${date}`,
            description: detail || 'An extra class has been scheduled.',
          };
    default:
      return {
        type: 'other',
        priority: 'normal',
        title: `${code} schedule updated on ${date}`,
        description: detail || 'The class schedule has been updated.',
      };
  }
}

async function createLinkedUpdate(override, user) {
  const feed = overrideFeedContent(override);
  return Update.create({
    authorId: user._id,
    sectionId: idOf(override.sectionId),
    batchId: idOf(user.batchId) || null,
    courseId: override.courseId?._id || override.courseId || null,
    type: feed.type,
    title: feed.title,
    description: feed.description,
    priority: feed.priority,
    scope: 'section',
    departmentCode: String(user.departmentId?.code || '').toUpperCase() || null,
    status: 'approved',
    sourceOverrideId: override._id,
  });
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.sectionId) filter.sectionId = req.query.sectionId;
    if (req.query.status) filter.status = req.query.status;

    // CRs see their own overrides unless an admin/coordinator asks for another section.
    if (!req.user.roles.includes('admin') && !req.user.roles.includes('coordinator')) {
      filter.sectionId = idOf(req.user.sectionId);
    }

    const overrides = await ScheduleOverride.find(filter)
      .populate(overridePopulate)
      .sort({ createdAt: -1 });

    sendData(res, overrides);
  })
);

router.post(
  '/',
  requireCr,
  asyncHandler(async (req, res) => {
    const body = req.body;
    const user = req.user;
    if (!user.sectionId) throw new AppError(400, 'You are not assigned to a section');

    const type = body.type;
    const now = new Date();
    const sectionId = idOf(user.sectionId);

    const basePayload = {
      sectionId,
      declaredBy: user._id,
      status: 'approved',
      type,
      reason: body.reason || '',
    };

    let override;

    if (type === 'auto_day_off') {
      const date = normalizeDate(body.date);
      if (!date) throw new AppError(400, 'A valid date (YYYY-MM-DD) is required');
      override = new ScheduleOverride({
        ...basePayload,
        specificDate: date,
        startDate: date,
        endDate: date,
      });
    } else if (type === 'mid_break') {
      const startDate = normalizeDate(body.startDate);
      const endDate = normalizeDate(body.endDate);
      if (!startDate || !endDate || endDate < startDate) {
        throw new AppError(400, 'Valid mid-break date range is required');
      }
      override = new ScheduleOverride({
        ...basePayload,
        startDate,
        endDate,
      });
    } else if (
      type === 'class_cancellation' ||
      type === 'room_change' ||
      type === 'time_change'
    ) {
      const date = normalizeDate(body.date);
      if (!date) throw new AppError(400, 'A valid date (YYYY-MM-DD) is required');
      if (type === 'time_change') {
        if (!isValidTime(body.startTime) || !isValidTime(body.endTime)) {
          throw new AppError(400, 'Valid startTime and endTime are required');
        }
        if (body.startTime >= body.endTime) {
          throw new AppError(400, 'startTime must be before endTime');
        }
      }
      if (type === 'room_change' && !String(body.room || '').trim()) {
        throw new AppError(400, 'A new room is required');
      }
      let entry = null;
      let originalValues;
      let courseId;

      // The target may be a routine entry (e.g. the daily CT slot) or a
      // CR-declared extra class / class test (an extra_class override id).
      if (body.routineEntryId) {
        if (!mongoose.isValidObjectId(body.routineEntryId)) {
          throw new AppError(404, 'Routine entry not found');
        }
        entry = await RoutineEntry.findById(body.routineEntryId);
        if (entry) {
          if (String(entry.sectionId) !== String(sectionId)) {
            throw new AppError(403, 'You cannot override classes in another section');
          }
          originalValues = {
            startTime: entry.startTime,
            endTime: entry.endTime,
            room: entry.room || null,
          };
          courseId = body.courseId || entry.courseId;
        } else {
          const declared = await ScheduleOverride.findOne({
            _id: body.routineEntryId,
            sectionId,
            type: 'extra_class',
          });
          if (!declared) {
            throw new AppError(404, 'Routine entry not found');
          }
          if (String(declared.sectionId) !== String(sectionId)) {
            throw new AppError(403, 'You cannot override classes in another section');
          }
          originalValues = {
            startTime: declared.startTime,
            endTime: declared.endTime,
            room: declared.room || null,
          };
          courseId = body.courseId || declared.courseId;
        }
      } else {
        courseId = body.courseId || null;
        originalValues = { startTime: null, endTime: null, room: null };
      }

      override = new ScheduleOverride({
        ...basePayload,
        specificDate: date,
        routineEntryId: body.routineEntryId || null,
        courseId,
        originalValues,
        startTime: type === 'time_change' ? body.startTime || originalValues.startTime : originalValues.startTime,
        endTime: type === 'time_change' ? body.endTime || originalValues.endTime : originalValues.endTime,
        room: type === 'room_change' ? body.room : originalValues.room,
      });
    } else if (type === 'extra_class') {
      const date = normalizeDate(body.date);
      if (!date) throw new AppError(400, 'A valid date (YYYY-MM-DD) is required');
      const classType = body.classType === 'ct' ? 'ct' : 'lecture';

      let startTime = body.startTime || null;
      let endTime = body.endTime || null;

      const hasBothTimes = Boolean(startTime && endTime);
      const hasOneTime = Boolean(startTime) !== Boolean(endTime);
      if (hasOneTime) {
        throw new AppError(400, 'Both startTime and endTime are required for a scheduled class');
      }
      if (hasBothTimes) {
        if (!isValidTime(startTime) || !isValidTime(endTime)) {
          throw new AppError(400, 'startTime and endTime must use HH:mm format');
        }
        if (startTime >= endTime) {
          throw new AppError(400, 'startTime must be before endTime');
        }
      }

      if (classType === 'ct') {
        if (!body.courseId) {
          throw new AppError(400, 'courseId is required to declare a class test');
        }
        if (!hasBothTimes) {
          // No explicit time: land the CT in the section's CT slot (period 1)
          // for that weekday so "declare CT" only needs a course + a date.
          const day = dayNameFor(date);
          const ctSlot = day
            ? await RoutineEntry.findOne({ sectionId, day, classType: 'ct' }).sort({ period: 1 })
            : null;
          if (!ctSlot) {
            throw new AppError(
              400,
              'startTime and endTime are required — the routine has no CT slot for this day'
            );
          }
          startTime = ctSlot.startTime;
          endTime = ctSlot.endTime;
        }
      }

      override = new ScheduleOverride({
        ...basePayload,
        specificDate: date,
        courseId: body.courseId || null,
        startTime,
        endTime,
        room: body.room || null,
        classType,
      });
    } else {
      throw new AppError(400, 'Unknown override type');
    }

    await override.save();
    await logAudit({
      action: 'override_created',
      user,
      sectionId,
      targetId: override._id,
      details: `${type}${override.classType === 'ct' ? ' (CT)' : ''} for ${
        override.specificDate || `${override.startDate} → ${override.endDate}`
      }`,
      req,
    });

    const populated = await ScheduleOverride.findById(override._id).populate(overridePopulate);
    // Mirror the declaration into the section feed so every student account
    // sees it in Updates, not only inside the calendar on that exact date.
    const linkedUpdate = await createLinkedUpdate(populated, user);
    sendData(
      res,
      {
        id: String(populated._id),
        _id: String(populated._id),
        updateId: String(linkedUpdate._id),
        message: 'Declaration submitted',
      },
      201
    );
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const override = await ScheduleOverride.findById(req.params.id);
    if (!override) throw new AppError(404, 'Override not found');

    const isOwner = String(override.declaredBy) === String(req.user._id);
    if (
      !isOwner &&
      !req.user.roles.includes('admin') &&
      !req.user.roles.includes('coordinator')
    ) {
      throw new AppError(403, 'You cannot withdraw this declaration');
    }

    await ScheduleOverride.findByIdAndDelete(req.params.id);
    // The matching feed post must disappear too, or students keep seeing a
    // cancelled notice after the CR withdrew it.
    await Update.deleteMany({ sourceOverrideId: override._id });
    await logAudit({
      action: 'override_withdrawn',
      user: req.user,
      sectionId: override.sectionId,
      targetId: override._id,
      details: `Withdrew ${override.type}`,
    });
    sendData(res, { message: 'Declaration withdrawn' });
  })
);

router.put(
  '/:id/review',
  asyncHandler(async (req, res) => {
    const { decision, note } = req.body || {};
    if (!req.user.roles.includes('admin') && !req.user.roles.includes('coordinator')) {
      throw new AppError(403, 'Coordinator access required');
    }
    if (!['approved', 'rejected'].includes(decision)) {
      throw new AppError(400, 'Invalid decision');
    }

    const override = await ScheduleOverride.findById(req.params.id);
    if (!override) throw new AppError(404, 'Override not found');

    override.status = decision;
    override.reviewNote = note || null;
    override.reviewedBy = req.user._id;
    override.reviewedAt = new Date();
    await override.save();

    if (decision === 'rejected') {
      // A rejected declaration must not linger in the section Updates feed.
      await Update.deleteMany({ sourceOverrideId: override._id });
    }

    await logAudit({
      action: 'override_reviewed',
      user: req.user,
      sectionId: override.sectionId,
      targetId: override._id,
      details: `${decision} ${override.type}`,
    });

    const populated = await ScheduleOverride.findById(override._id).populate(overridePopulate);
    sendData(res, populated);
  })
);

export default router;
