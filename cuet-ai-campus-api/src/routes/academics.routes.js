import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  Batch,
  Course,
  Department,
  Section,
  Teacher,
  Term,
} from '../models/index.js';
import { asyncHandler, parsePagination, sendData } from '../utils/http.js';

const router = express.Router();
router.use(protect);

router.get(
  '/departments',
  asyncHandler(async (_req, res) => {
    const departments = await Department.find().sort({ name: 1 });
    sendData(res, departments);
  })
);

router.get(
  '/departments/:id',
  asyncHandler(async (req, res) => {
    const department = await Department.findById(req.params.id);
    sendData(res, department);
  })
);

router.get(
  '/batches',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    const batches = await Batch.find(filter).sort({ batchNumber: -1 });
    sendData(res, batches);
  })
);

router.get(
  '/sections',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.batchId) filter.batchId = req.query.batchId;
    if (req.query.termId) filter.termId = req.query.termId;
    const sections = await Section.find(filter)
      .populate('termId', 'label level termNumber')
      .populate('batchId', 'batchNumber label name')
      .sort({ name: 1 });
    sendData(res, sections);
  })
);

router.get(
  '/terms',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.sessionId) filter.academicSessionId = req.query.sessionId;
    const terms = await Term.find(filter).sort({ level: 1, termNumber: 1 });
    sendData(res, terms);
  })
);

router.get(
  '/courses',
  asyncHandler(async (req, res) => {
    const filter = { isActive: { $ne: false } };
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    const courses = await Course.find(filter).sort({ code: 1, title: 1 });
    sendData(res, courses);
  })
);

router.get(
  '/teachers',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query, {
      defaultLimit: 200,
      maxLimit: 500,
    });
    const filter = {};
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    if (req.query.q) {
      const regex = new RegExp(String(req.query.q).trim(), 'i');
      filter.$or = [{ name: regex }, { designation: regex }, { email: regex }];
    }

    const [items, total] = await Promise.all([
      Teacher.find(filter)
        .populate('departmentId', 'name code')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Teacher.countDocuments(filter),
    ]);

    sendData(res, { items, total, page, limit });
  })
);

export default router;
