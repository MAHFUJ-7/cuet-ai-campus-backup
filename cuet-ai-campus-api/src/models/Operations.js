import mongoose from 'mongoose';
import { baseOptions } from './options.js';

const crAssignmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: true,
      index: true,
    },
    permissions: {
      allowedUpdateTypes: { type: [String], default: [] },
      directPublishTypes: { type: [String], default: [] },
    },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  baseOptions
);
crAssignmentSchema.index({ userId: 1, sectionId: 1 }, { unique: true });

const assignmentRuleSchema = new mongoose.Schema(
  {
    termId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Term',
      required: true,
      index: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: true,
      index: true,
    },
    startId: { type: String, required: true, trim: true },
    endId: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  baseOptions
);
assignmentRuleSchema.index({ termId: 1, sectionId: 1 });

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: 'System' },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      default: null,
      index: true,
    },
    targetId: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
  },
  {
    ...baseOptions,
    timestamps: { createdAt: true, updatedAt: false },
  }
);
auditLogSchema.index({ createdAt: -1 });

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    type: { type: String, default: 'update' },
    updateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Update', default: null },
    readAt: { type: Date, default: null },
  },
  baseOptions
);
notificationSchema.index({ userId: 1, createdAt: -1 });

const feedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, default: 'other' },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved'],
      default: 'open',
    },
  },
  baseOptions
);

const sharedFileSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, default: 'other' },
    url: { type: String, required: true },
    filename: { type: String, default: null },
    originalName: { type: String, default: null },
    mimeType: { type: String, default: null },
    size: { type: Number, default: 0 },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
      default: null,
    },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseOptions
);

const chatRoomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', default: null },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  baseOptions
);

const chatMessageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatRoom',
      required: true,
      index: true,
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  baseOptions
);
chatMessageSchema.index({ roomId: 1, createdAt: -1 });

export const CRAssignment = mongoose.model('CRAssignment', crAssignmentSchema);
export const AssignmentRule = mongoose.model('AssignmentRule', assignmentRuleSchema);
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export const Notification = mongoose.model('Notification', notificationSchema);
export const Feedback = mongoose.model('Feedback', feedbackSchema);
export const SharedFile = mongoose.model('SharedFile', sharedFileSchema);
export const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);
export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
