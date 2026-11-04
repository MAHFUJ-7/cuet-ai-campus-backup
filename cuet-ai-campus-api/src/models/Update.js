import mongoose from 'mongoose';
import { baseOptions } from './options.js';
import {
  UPDATE_PRIORITIES,
  UPDATE_SCOPES,
  UPDATE_STATUSES,
} from '../constants.js';

const updateSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      default: null,
      index: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      default: null,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
    },
    type: { type: String, default: 'announcement', trim: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: '', trim: true, maxlength: 5000 },
    priority: {
      type: String,
      enum: UPDATE_PRIORITIES,
      default: 'normal',
    },
    scope: {
      type: String,
      enum: UPDATE_SCOPES,
      default: 'section',
      index: true,
    },
    departmentCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },
    batchNumber: { type: Number, default: null },
    effectiveDate: { type: Date, default: null },
    /** Optional event start time (ISO-like: YYYY-MM-DDTHH:mm). */
    eventDateTime: { type: String, default: null, trim: true },
    /** Optional event location (room / venue). */
    eventLocation: { type: String, default: null, trim: true, maxlength: 240 },
    status: {
      type: String,
      enum: UPDATE_STATUSES,
      default: 'approved',
      index: true,
    },
    upvotes: { type: Number, default: 0, min: 0 },
    upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    attachments: { type: [String], default: [] },
    /** When this post mirrors a CR schedule declaration, points at it. */
    sourceOverrideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScheduleOverride',
      default: null,
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewNote: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
  },
  baseOptions
);

updateSchema.index({ status: 1, scope: 1, createdAt: -1 });
updateSchema.index({ sectionId: 1, status: 1, createdAt: -1 });
updateSchema.index({ batchId: 1, status: 1, createdAt: -1 });
updateSchema.index({ departmentCode: 1, status: 1, createdAt: -1 });

export const Update = mongoose.model('Update', updateSchema);
