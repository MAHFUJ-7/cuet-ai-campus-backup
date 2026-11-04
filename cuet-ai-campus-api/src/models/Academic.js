import mongoose from 'mongoose';
import { baseOptions } from './options.js';

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
  },
  baseOptions
);

const academicSessionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    startYear: { type: Number, required: true },
    endYear: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  baseOptions
);

const termSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    level: { type: Number, default: null },
    termNumber: { type: Number, default: null },
    academicSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicSession',
    },
    isActive: { type: Boolean, default: true },
  },
  baseOptions
);
termSchema.index({ label: 1, academicSessionId: 1 }, { unique: false });

const batchSchema = new mongoose.Schema(
  {
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    batchNumber: { type: Number, required: true, index: true },
    label: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    startYear: { type: Number, default: null },
    endYear: { type: Number, default: null },
  },
  baseOptions
);
batchSchema.index({ departmentId: 1, batchNumber: 1 }, { unique: true });

const sectionSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      required: true,
      index: true,
    },
    termId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Term',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    maxStudents: { type: Number, default: 45, min: 1 },
  },
  baseOptions
);
sectionSchema.index({ batchId: 1, termId: 1, name: 1 }, { unique: true });

const courseSchema = new mongoose.Schema(
  {
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    code: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    credits: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  baseOptions
);
courseSchema.index({ departmentId: 1, code: 1, title: 1 }, { unique: true });

const teacherSchema = new mongoose.Schema(
  {
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    designation: { type: String, default: null },
    email: { type: String, default: null, lowercase: true, trim: true, sparse: true },
    phone: { type: String, default: null },
    office: { type: String, default: null },
  },
  baseOptions
);
teacherSchema.index({ departmentId: 1, name: 1 });

export const Department = mongoose.model('Department', departmentSchema);
export const AcademicSession = mongoose.model('AcademicSession', academicSessionSchema);
export const Term = mongoose.model('Term', termSchema);
export const Batch = mongoose.model('Batch', batchSchema);
export const Section = mongoose.model('Section', sectionSchema);
export const Course = mongoose.model('Course', courseSchema);
export const Teacher = mongoose.model('Teacher', teacherSchema);
