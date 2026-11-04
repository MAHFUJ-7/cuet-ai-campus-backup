import { AssignmentRule, Section } from '../models/index.js';

const numericId = (value) => Number.parseInt(String(value || '').replace(/\D/g, ''), 10);

export async function sectionForStudentId(studentId, batchId) {
  const numericStudentId = numericId(studentId);
  if (!Number.isFinite(numericStudentId) || !batchId) return null;

  const sections = await Section.find({ batchId }).select('_id');
  if (sections.length === 0) return null;

  const sectionIds = sections.map((section) => section._id);
  const rules = await AssignmentRule.find({
    sectionId: { $in: sectionIds },
    isActive: true,
  }).sort({ createdAt: 1 });

  return (
    rules.find((rule) => {
      const start = numericId(rule.startId);
      const end = numericId(rule.endId);
      return Number.isFinite(start) && Number.isFinite(end) && numericStudentId >= start && numericStudentId <= end;
    })?.sectionId ?? null
  );
}
