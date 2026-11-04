import mongoose from 'mongoose';
import { baseOptions } from './options.js';
import {
  ROLES,
  permissionsForRoles,
  primaryRoleFor,
} from '../constants.js';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    passwordHash: { type: String, select: false },
    photoURL: { type: String, default: null },
    phone: { type: String, default: '' },
    studentId: { type: String, trim: true, sparse: true, unique: true },
    role: { type: String, enum: ROLES, default: 'student' },
    roles: {
      type: [{ type: String, enum: ROLES }],
      default: ['student'],
    },
    permissions: { type: [String], default: [] },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    academicSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicSession',
    },
    hasPassword: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    fcmTokens: { type: [String], default: [] },
    lastLoginAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  baseOptions
);

userSchema.index({ sectionId: 1, roles: 1 });
userSchema.index({ departmentId: 1, batchId: 1 });

userSchema.pre('save', function normalizeRoles(next) {
  if (!Array.isArray(this.roles) || this.roles.length === 0) {
    this.roles = ['student'];
  }
  if (this.roles.includes('cr') && !this.roles.includes('student')) {
    this.roles.push('student');
  }
  this.role = primaryRoleFor(this.roles);
  this.permissions = permissionsForRoles(this.roles);
  if (this.email) this.email = this.email.toLowerCase().trim();
  if (
    (this.roles.includes('coordinator') || this.roles.includes('admin')) &&
    !/@cuet\.ac\.bd$/i.test(this.email || '')
  ) {
    return next(new Error('Coordinator and admin accounts must use a @cuet.ac.bd email address'));
  }
  next();
});

export const User = mongoose.model('User', userSchema);
