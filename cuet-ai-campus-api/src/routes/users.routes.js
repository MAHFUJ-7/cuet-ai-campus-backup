import express from 'express';
import { protect, requireAdmin } from '../middleware/auth.js';
import { User } from '../models/index.js';
import { AppError, asyncHandler, parsePagination, sendData } from '../utils/http.js';
import { serializeProfile } from '../services/profile.js';
import {
  requireBatch,
  requireDepartment,
  requireSection,
  resolveSession,
  resolveTermForProfile,
} from '../services/academicResolver.js';
import { logAudit } from '../services/audit.js';
import {
  normalizeStudentId,
  validateName,
} from '../utils/validation.js';
import { sectionForStudentId } from '../services/sectionAssignment.js';

const router = express.Router();
router.use(protect);

router.put(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) throw new AppError(404, 'Account not found');

    if (req.body?.name != null) {
      const nameError = validateName(req.body.name);
      if (nameError) throw new AppError(400, nameError);
      user.name = String(req.body.name).trim();
    }
    if (req.body?.phone != null) {
      user.phone = String(req.body.phone).trim().slice(0, 30);
    }
    if (req.body?.photoURL != null) {
      user.photoURL = String(req.body.photoURL).trim() || null;
    }
    await user.save();
    sendData(res, serializeProfile(await User.findById(user._id)));
  })
);

router.post(
  '/complete-profile',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) throw new AppError(404, 'Account not found');

    if (req.body?.name != null) {
      const nameError = validateName(req.body.name);
      if (nameError) throw new AppError(400, nameError);
      user.name = String(req.body.name).trim();
    }

    const studentId = normalizeStudentId(req.body?.studentId || user.studentId);
    if (!studentId) {
      throw new AppError(400, 'Student ID must be exactly 7 digits');
    }
    if (studentId !== user.studentId) {
      const taken = await User.findOne({ studentId, _id: { $ne: user._id } });
      if (taken) throw new AppError(409, 'This student ID is already registered');
      user.studentId = studentId;
    }

    const department = await requireDepartment(
      req.body?.departmentId || req.body?.department
    );
    const batch = await requireBatch(
      req.body?.batchId || req.body?.batch || department.code,
      department._id
    );
    const assignedSectionId = await sectionForStudentId(studentId, batch._id);
    const requestedSection = req.body?.sectionId || req.body?.section;
    const section = assignedSectionId
      ? await requireSection(assignedSectionId, batch._id)
      : await requireSection(requestedSection, batch._id);
    if (assignedSectionId && requestedSection && String(section._id) !== String(await requireSection(requestedSection, batch._id)._id)) {
      throw new AppError(409, 'Your section is assigned by the coordinator and cannot be changed here');
    }

    const term = await resolveTermForProfile({
      termId: req.body?.termId,
      level: req.body?.level,
      term: req.body?.term,
    });

    const session = await resolveSession(
      req.body?.academicSessionId ||
        req.body?.session ||
        req.body?.academicSession
    );

    user.departmentId = department._id;
    user.batchId = batch._id;
    user.sectionId = section._id;
    if (term) {
      // The section itself already has a term; keep it consistent when the
      // client supplies a matching term.
      if (String(section.termId) !== String(term._id)) {
        throw new AppError(400, 'The selected section does not belong to this term');
      }
    }
    if (session) user.academicSessionId = session._id;

    await user.save();
    await logAudit({
      action: 'student_profile_completed',
      user,
      sectionId: section._id,
      details: `${user.name} completed their academic profile`,
      req,
    });

    const populated = await User.findById(user._id)
      .populate('departmentId', 'name code')
      .populate('batchId', 'departmentId batchNumber label name')
      .populate('sectionId', 'termId name label')
      .populate('academicSessionId', 'name startYear endYear');
    sendData(res, serializeProfile(populated));
  })
);

router.post(
  '/fcm-token',
  asyncHandler(async (req, res) => {
    const token = String(req.body?.fcmToken || '').trim();
    if (!token) throw new AppError(400, 'fcmToken is required');

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { fcmTokens: token },
    });
    sendData(res, { message: 'Token saved' });
  })
);

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query, {
      defaultLimit: 50,
      maxLimit: 500,
    });
    const filter = {};
    if (req.query.role) filter.roles = req.query.role;
    if (req.query.q) {
      const regex = new RegExp(String(req.query.q).trim(), 'i');
      filter.$or = [{ name: regex }, { email: regex }, { studentId: regex }];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('sectionId', 'name label'),
      User.countDocuments(filter),
    ]);

    sendData(res, { users, total, page, limit });
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError(404, 'User not found');

    if (req.body?.name != null) {
      const nameError = validateName(req.body.name);
      if (nameError) throw new AppError(400, nameError);
      user.name = String(req.body.name).trim();
    }
    if (req.body?.roles != null) {
      if (!Array.isArray(req.body.roles) || req.body.roles.length === 0) {
        throw new AppError(400, 'roles must be a non-empty array');
      }
      user.roles = req.body.roles;
    }
    if (req.body?.departmentId) user.departmentId = req.body.departmentId;
    if (req.body?.batchId) user.batchId = req.body.batchId;
    if (req.body?.sectionId) user.sectionId = req.body.sectionId;
    if (req.body?.isActive != null) user.isActive = Boolean(req.body.isActive);

    await user.save();
    await logAudit({
      action: 'admin_user_updated',
      user: req.user,
      targetId: user._id,
      details: `Updated account ${user.email}`,
      req,
    });
    const safeUser = user.toObject({ virtuals: true });
    delete safeUser.passwordHash;
    delete safeUser.fcmTokens;
    sendData(res, safeUser);
  })
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (String(req.params.id) === String(req.user._id)) {
      throw new AppError(400, 'You cannot deactivate your own admin account');
    }
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError(404, 'User not found');

    user.isActive = false;
    await user.save();
    await logAudit({
      action: 'admin_user_deactivated',
      user: req.user,
      targetId: user._id,
      details: `Deactivated account ${user.email}`,
      req,
    });
    sendData(res, { message: 'Account deactivated' });
  })
);

export default router;
