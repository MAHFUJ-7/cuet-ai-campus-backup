import mongoose from 'mongoose';
import { baseOptions } from './options.js';
import { DAYS } from '../constants.js';

const routineEntrySchema = new mongoose.Schema(
  {
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      default: null,
    },
    day: { type: String, enum: DAYS, required: true, index: true },
    period: { type: Number, required: true, min: 0, max: 12 },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    room: { type: String, default: null },
    classType: { type: String, default: 'lecture', trim: true },
    isBreak: { type: Boolean, default: false },
    breakType: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  baseOptions
);

routineEntrySchema.index(
  { sectionId: 1, day: 1, period: 1 },
  { unique: true }
);
routineEntrySchema.index({ sectionId: 1, day: 1, startTime: 1 });
routineEntrySchema.index({ teacherId: 1, day: 1, period: 1 });

export const RoutineEntry = mongoose.model('RoutineEntry', routineEntrySchema);
