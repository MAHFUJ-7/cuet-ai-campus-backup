import express from 'express';
import { protect } from '../middleware/auth.js';
import { ChatRoom, ChatMessage } from '../models/index.js';
import { AppError, asyncHandler, parsePagination, sendData } from '../utils/http.js';

const router = express.Router();
router.use(protect);

router.get(
  '/rooms',
  asyncHandler(async (req, res) => {
    const rooms = await ChatRoom.find()
      .populate('participants', 'name role')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    sendData(res, rooms);
  })
);

router.post(
  '/rooms',
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body.name) throw new AppError(400, 'name is required');
    const room = new ChatRoom({
      name: body.name,
      sectionId: body.sectionId || null,
      participants: body.participants ? body.participants.filter(Boolean) : [req.user._id],
      createdBy: req.user._id,
    });
    await room.save();
    sendData(res, room, 201);
  })
);

router.get(
  '/rooms/:roomId/messages',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const [items, total] = await Promise.all([
      ChatMessage.find({ roomId: req.params.roomId })
        .populate('senderId', 'name role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ChatMessage.countDocuments({ roomId: req.params.roomId }),
    ]);
    sendData(res, { items, page, limit, total });
  })
);

router.post(
  '/rooms/:roomId/messages',
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body.text) throw new AppError(400, 'text is required');
    const message = new ChatMessage({
      roomId: req.params.roomId,
      senderId: req.user._id,
      text: body.text,
    });
    await message.save();
    sendData(res, message, 201);
  })
);

export default router;
