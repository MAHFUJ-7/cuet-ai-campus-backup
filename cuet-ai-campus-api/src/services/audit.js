import { AuditLog } from '../models/index.js';

export async function logAudit({
  action,
  user = null,
  sectionId = null,
  targetId = null,
  details = null,
  req = null,
}) {
  try {
    await AuditLog.create({
      action,
      userId: user?._id || null,
      userName: user?.name || 'System',
      sectionId: sectionId || null,
      targetId: targetId ? String(targetId) : null,
      details,
      ip: req?.ip || null,
    });
  } catch (error) {
    console.error('[audit] failed to write audit log:', error.message);
  }
}
