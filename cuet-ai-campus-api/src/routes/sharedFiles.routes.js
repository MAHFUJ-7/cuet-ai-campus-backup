import express from 'express';
import { protect } from '../middleware/auth.js';
import { sharedUpload } from '../middleware/upload.js';
import { SharedFile } from '../models/index.js';
import { AppError, asyncHandler, parsePagination, sendData } from '../utils/http.js';

const router = express.Router();
router.use(protect);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.courseId) filter.courseId = req.query.courseId;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.assignmentId) filter.assignmentId = req.query.assignmentId;

    const [items, total] = await Promise.all([
      SharedFile.find(filter)
        .populate('uploadedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SharedFile.countDocuments(filter),
    ]);
    sendData(res, { items, page, limit, total });
  })
);

router.post(
  '/',
  sharedUpload.array('files', 10),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const files = Array.isArray(req.files) ? req.files : [];

    if (!files.length && !body.url) {
      throw new AppError(400, 'Upload at least one file or provide a URL');
    }

    const created = [];
    for (const file of files) {
      const sharedFile = new SharedFile({
        title: body.title || file.originalname,
        type: body.type || 'other',
        url: `${req.protocol}://${req.get('host')}/uploads/shared/${file.filename}`,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        courseId: body.courseId || null,
        assignmentId: body.assignmentId || null,
        uploadedBy: req.user._id,
      });
      await sharedFile.save();
      created.push(sharedFile);
    }

    // Link-only shares (no upload) still create a record so it appears in the
    // shared-files list instead of silently disappearing.
    if (!files.length && body.url) {
      const sharedFile = new SharedFile({
        title: body.title || String(body.url),
        type: body.type || 'other',
        url: String(body.url),
        courseId: body.courseId || null,
        assignmentId: body.assignmentId || null,
        uploadedBy: req.user._id,
      });
      await sharedFile.save();
      created.push(sharedFile);
    }

    sendData(res, created.length === 1 ? created[0] : created, 201);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const sharedFile = await SharedFile.findById(req.params.id);
    if (!sharedFile) throw new AppError(404, 'File not found');
    if (
      String(sharedFile.uploadedBy) !== String(req.user._id) &&
      !req.user.roles.includes('coordinator') &&
      !req.user.roles.includes('admin')
    ) {
      throw new AppError(403, 'You cannot delete this file');
    }
    await SharedFile.findByIdAndDelete(req.params.id);
    sendData(res, { message: 'File deleted' });
  })
);

export default router;
