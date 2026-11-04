import mongoose from 'mongoose';
import {
  AcademicSession,
  Batch,
  Department,
  Section,
  Term,
} from '../models/index.js';
import { escapeRegex } from '../utils/validation.js';
import { AppError } from '../utils/http.js';

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const exact = (value) => new RegExp(`^${escapeRegex(value)}$`, 'i');

export async function resolveDepartment(value) {
  if (!value) return null;
  if (isObjectId(value)) {
    const byId = await Department.findById(value);
    if (byId) return byId;
  }
  const raw = String(value).trim();
  return Department.findOne({
    $or: [{ code: raw.toUpperCase() }, { name: exact(raw) }],
  });
}

export async function resolveBatch(value, departmentId = null) {
  if (!value) return null;
  if (isObjectId(value)) {
    const byId = await Batch.findById(value);
    if (byId) return byId;
  }

  const raw = String(value).trim();
  const digits = Number(raw.replace(/\D/g, ''));
  const candidates = [];
  if (Number.isFinite(digits) && digits > 0) {
    candidates.push(digits);
    if (digits >= 1000) candidates.push(digits % 100);
  }

  const filter = {
    $or: [
      ...(candidates.length ? [{ batchNumber: { $in: candidates } }] : []),
      { label: exact(raw) },
      { name: exact(raw) },
    ],
  };
  if (departmentId) filter.departmentId = departmentId;
  return Batch.findOne(filter);
}

export async function resolveSection(value, batchId = null) {
  if (!value) return null;
  if (isObjectId(value)) {
    const byId = await Section.findById(value);
    if (byId) return byId;
  }

  const raw = String(value).trim();
  const sectionName = raw
    .replace(/^section\s+/i, '')
    .replace(/\s+—.*$/, '')
    .trim();

  const filter = {
    $or: [{ name: exact(sectionName) }, { label: exact(raw) }],
  };
  if (batchId) filter.batchId = batchId;
  return Section.findOne(filter);
}

export async function resolveTerm(value) {
  if (!value) return null;
  if (isObjectId(value)) {
    const byId = await Term.findById(value);
    if (byId) return byId;
  }
  return Term.findOne({ label: exact(value) });
}

export async function resolveSession(value) {
  if (!value) return null;
  if (isObjectId(value)) {
    const byId = await AcademicSession.findById(value);
    if (byId) return byId;
  }

  const raw = String(value).trim();
  const years = raw.match(/\d{4}/g)?.map(Number) || [];
  return AcademicSession.findOne({
    $or: [
      { name: exact(raw) },
      ...(years.length ? [{ startYear: years[0] }] : []),
    ],
  });
}

export async function resolveTermForProfile({ termId, level, term }) {
  if (termId) {
    const resolved = await resolveTerm(termId);
    if (resolved) return resolved;
  }
  if (level != null || term != null) {
    const filter = {};
    if (level != null) filter.level = Number(level);
    if (term != null) filter.termNumber = Number(term);
    const found = await Term.findOne(filter).sort({ createdAt: 1 });
    if (found) return found;
  }
  return null;
}

export async function requireDepartment(value) {
  const department = await resolveDepartment(value);
  if (!department) throw new AppError(400, 'Unknown department');
  return department;
}

export async function requireBatch(value, departmentId) {
  const batch = await resolveBatch(value, departmentId);
  if (!batch) throw new AppError(400, 'Unknown batch');
  return batch;
}

export async function requireSection(value, batchId) {
  const section = await resolveSection(value, batchId);
  if (!section) throw new AppError(400, 'Unknown section');
  return section;
}
