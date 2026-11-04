/** Serializes a populated user as the exact profile shape the web client parses. */
export function serializeProfile(user) {
  if (!user) return null;
  const raw = typeof user.toObject === 'function' ? user.toObject({ virtuals: true }) : { ...user };

  delete raw.passwordHash;
  delete raw.passwordResetTokenHash;
  delete raw.passwordResetExpires;
  delete raw.fcmTokens;

  raw.role = raw.role || 'student';
  raw.roles = Array.isArray(raw.roles) && raw.roles.length ? raw.roles : [raw.role];
  raw.permissions = Array.isArray(raw.permissions) ? raw.permissions : [];
  raw.hasPassword = Boolean(raw.hasPassword);
  raw.photoURL = raw.photoURL || null;
  raw.phone = raw.phone || '';
  raw.studentId = raw.studentId || '';

  // parseSection() reads termId as a plain string. Keep it a string even when
  // the section document was populated.
  if (raw.sectionId && typeof raw.sectionId === 'object') {
    const termId = raw.sectionId.termId;
    raw.sectionId.termId = String(termId?._id || termId || '');
  }

  return raw;
}

export const populatedUserQuery = (query) =>
  query
    .populate('departmentId', 'name code')
    .populate('batchId', 'departmentId batchNumber label name')
    .populate('sectionId', 'termId name label')
    .populate('academicSessionId', 'name startYear endYear');
