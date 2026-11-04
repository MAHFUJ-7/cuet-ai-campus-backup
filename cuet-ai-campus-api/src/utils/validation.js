export const STUDENT_EMAIL_RE = /^u?\d{2}\d{2}\d{3}@student\.cuet\.ac\.bd$/i;
export const STAFF_EMAIL_RE = /^[^\s@]+@cuet\.ac\.bd$/i;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const isStudentEmail = (email) => STUDENT_EMAIL_RE.test(email);
export const isStaffEmail = (email) => STAFF_EMAIL_RE.test(email);

export function studentIdFromEmail(email) {
  const match = /^u?(\d{7})@student\.cuet\.ac\.bd$/i.exec(email || '');
  return match ? match[1] : '';
}

const DEPARTMENT_CODES = {
  '01': 'CE',
  '02': 'EEE',
  '03': 'ME',
  '04': 'CSE',
  '05': 'URP',
  '06': 'ARCH',
  '07': 'PME',
  '08': 'ETE',
  '09': 'MIE',
  '10': 'WRE',
  '11': 'BME',
  '12': 'MME',
};

export function academicPartsFromStudentEmail(email) {
  const match = /^u?(\d{2})(\d{2})(\d{3})@student\.cuet\.ac\.bd$/i.exec(email || '');
  if (!match) return null;
  const [, batchCode, departmentCode, roll] = match;
  return {
    batchNumber: Number(batchCode),
    departmentCode: DEPARTMENT_CODES[departmentCode] || null,
    roll: Number(roll),
    studentId: `${batchCode}${departmentCode}${roll}`,
  };
}

export function validateName(name) {
  const value = String(name || '').trim();
  if (value.length < 2 || value.length > 100) {
    return 'Name must be between 2 and 100 characters';
  }
  return null;
}

export function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(value)) return 'Password must include an uppercase letter';
  if (!/[a-z]/.test(value)) return 'Password must include a lowercase letter';
  if (!/\d/.test(value)) return 'Password must include a number';
  if (value.length > 128) return 'Password is too long';
  return null;
}

export function normalizeStudentId(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 7 ? digits : '';
}

export const escapeRegex = (value) =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
