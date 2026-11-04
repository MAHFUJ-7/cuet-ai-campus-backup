import express from 'express';
import { protect } from '../middleware/auth.js';
import { Feedback } from '../models/index.js';
import { AppError, asyncHandler, sendData } from '../utils/http.js';

const router = express.Router();
router.use(protect);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body.type || !body.subject || !body.description) {
      throw new AppError(400, 'type, subject, and description are required');
    }
    if (String(body.description).length < 10) {
      throw new AppError(400, 'Description must be at least 10 characters');
    }

    const feedback = new Feedback({
      userId: req.user._id,
      type: body.type,
      subject: body.subject,
      description: body.description,
    });
    await feedback.save();
    sendData(res, { id: String(feedback._id), message: 'Feedback submitted' }, 201);
  })
);

export default router;
