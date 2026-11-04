import express from 'express';
import { protect } from '../middleware/auth.js';
import { AppError, asyncHandler, sendData } from '../utils/http.js';
import { env } from '../config/env.js';
import { Exam, RoutineEntry, Section } from '../models/index.js';
import { routinePopulate, serializeRoutineEntry } from '../services/routineSerializer.js';
import { serializeExam } from '../services/routineSerializer.js';
import { listUpdates } from '../services/updates.js';
import { idOf } from '../services/access.js';

const router = express.Router();
router.use(protect);

router.get(
  '/context',
  asyncHandler(async (req, res) => {
    const sectionId = idOf(req.user.sectionId);
    const batchId = idOf(req.user.batchId);
    if (!sectionId || !batchId) {
      throw new AppError(400, 'Complete your academic profile to use the campus assistant');
    }

    const sections = await Section.find({ batchId }).select('_id name label').sort({ name: 1 });
    const sectionIds = sections.map((section) => section._id);
    const [routineRows, exams, updates] = await Promise.all([
      RoutineEntry.find({ sectionId: { $in: sectionIds } })
        .populate(routinePopulate)
        .sort({ sectionId: 1, day: 1, period: 1 }),
      Exam.find({ sectionId }).populate('courseId', 'code title').sort({ examDate: 1, startTime: 1 }),
      listUpdates({ page: 1, limit: 100 }, req.user),
    ]);

    const sectionNameById = new Map(
      sections.map((section) => [String(section._id), section.name])
    );
    const routine = routineRows.map((entry) => ({
      ...serializeRoutineEntry(entry),
      sectionName: sectionNameById.get(String(entry.sectionId)) || '',
    }));
    const serializedExams = exams.map(serializeExam);
    const ownRoutine = routine.filter((entry) => String(entry.sectionId) === sectionId);
    const conflicts = detectConflicts(ownRoutine, serializedExams);
    const text = buildContextText({ routine, updates: updates.items, exams: serializedExams, conflicts });

    sendData(res, {
      batchNumber: req.user.batchId?.batchNumber ?? null,
      section: sectionNameById.get(sectionId) || null,
      routine,
      updates: updates.items,
      exams: serializedExams,
      conflicts,
      text,
    });
  })
);

router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { message, history } = req.body || {};
    if (!message || !String(message).trim()) {
      throw new AppError(400, 'message is required');
    }

    let context = null;
    try {
      const sectionId = idOf(req.user.sectionId);
      if (sectionId) {
        const sections = await Section.find({ batchId: req.user.batchId }).select('_id name label');
        const sectionIds = sections.map((section) => section._id);
        const [routineRows, exams, updates] = await Promise.all([
          RoutineEntry.find({ sectionId: { $in: sectionIds } })
            .populate(routinePopulate)
            .sort({ sectionId: 1, day: 1, period: 1 }),
          Exam.find({ sectionId }).populate('courseId', 'code title').sort({ examDate: 1, startTime: 1 }),
          listUpdates({ page: 1, limit: 100 }, req.user),
        ]);
        const sectionNameById = new Map(
          sections.map((section) => [String(section._id), section.name])
        );
        const routine = routineRows.map((entry) => ({
          ...serializeRoutineEntry(entry),
          sectionName: sectionNameById.get(String(entry.sectionId)) || '',
        }));
        const serializedExams = exams.map(serializeExam);
        const ownRoutine = routine.filter((entry) => String(entry.sectionId) === sectionId);
        const conflicts = detectConflicts(ownRoutine, serializedExams);
        context = {
          text: buildContextText({
            routine,
            updates: updates.items,
            exams: serializedExams,
            conflicts,
          }),
          routine,
          updates: updates.items,
          exams: serializedExams,
          conflicts,
        };
      }
    } catch {
      context = null;
    }

    const reply =
      (await generateChatReply({ message, history, user: req.user, headers: req.headers, context })) ||
      deterministicReply(message, req.user, context);
    sendData(res, { reply });
  })
);

router.get(
  '/suggestions',
  asyncHandler(async (_req, res) => {
    sendData(res, {
      suggestions: [
        {
          id: 'attend-next-class',
          title: 'Attend your next class',
          body: 'Check today’s routine and head to the assigned room on time.',
        },
        {
          id: 'review-attendance',
          title: 'Review your attendance',
          body: "Keep your attendance above 85% to stay eligible for exams.",
        },
        {
          id: 'check-assignments',
          title: 'Check upcoming assignments',
          body: 'Finish assignments before their deadlines to avoid last-minute stress.',
        },
      ],
    });
  })
);

router.post(
  '/study-plan',
  asyncHandler(async (_req, res) => {
    sendData(res, {
      plan: [
        { day: 'Today', focus: 'Review today’s class topics and complete pending assignments' },
        { day: 'Tomorrow', focus: 'Prepare for tomorrow’s routine and any scheduled exam' },
        { day: 'This week', focus: 'Catch up on overdue readings and lab work' },
      ],
    });
  })
);

router.post(
  '/workload',
  asyncHandler(async (_req, res) => {
    sendData(res, {
      totalAssignments: 0,
      overdueAssignments: 0,
      upcomingExams: 0,
      estimatedHoursPerWeek: 15,
      note: 'Connect real schedule data for personalized workload estimates.',
    });
  })
);

function deterministicReply(message, user, context = null) {
  const text = String(message || '').toLowerCase();
  const name = user?.name || 'there';

  if (context?.conflicts?.length && /(conflict|clash|overlap)/.test(text)) {
    return `I found ${context.conflicts.length} conflict(s): ${context.conflicts
      .map((conflict) => conflict.description)
      .join('; ')}`;
  }
  if (context?.exams?.length && /exam|test|ct|midterm|final/.test(text)) {
    return `Your exams: ${context.exams
      .map((exam) => `${exam.course?.code || exam.courseId} on ${exam.examDate} at ${exam.startTime}-${exam.endTime}`)
      .join('; ')}.`;
  }
  if (context?.updates?.length && /notice|announcement|update/.test(text)) {
    if (/last|latest|most recent/.test(text)) {
      const latest = context.updates[0];
      return `The latest notice is "${latest.title}": ${latest.description}`;
    }
    return `Latest notices: ${context.updates
      .slice(0, 10)
      .map((update) => `${update.title}: ${update.description}`)
      .join(' | ')}`;
  }
  const requestedDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'].find((day) =>
    text.includes(day)
  );
  if (requestedDay && /routine|schedule|class|timetable/.test(text)) {
    const sectionName = String(user.sectionId?.name || user.sectionId?.label || '');
    const entries = context?.routine?.filter(
      (entry) =>
        entry.sectionName === sectionName &&
        String(entry.day || '').toLowerCase() === requestedDay
    );
    if (entries?.length) {
      return `${requestedDay[0].toUpperCase()}${requestedDay.slice(1)} routine for Section ${sectionName}: ${entries
        .map(
          (entry) =>
            `${entry.startTime}-${entry.endTime} ${entry.course?.code || entry.courseId}${entry.room ? ` in ${entry.room}` : ''}`
        )
        .join('; ')}.`;
    }
    return `No routine entries were found for ${requestedDay[0].toUpperCase()}${requestedDay.slice(1)} for your section.`;
  }
  if (/next class/.test(text)) {
    const sectionName = String(user.sectionId?.name || user.sectionId?.label || '');
    const next = context?.routine?.find((entry) => entry.sectionName === sectionName);
    return next
      ? `Hi ${name}, your routine includes ${next.course?.code || next.courseId} at ${next.startTime} in ${next.room || 'the assigned room'}.`
      : `Hi ${name}, I could not find a class in your current routine.`;
  }
  if (/attendance/.test(text)) {
    return `Hi ${name}, visit the Attendance page to see your current percentage and recent absences.`;
  }
  if (/exam/.test(text)) {
    return `Hi ${name}, your upcoming exams appear on the Calendar and Exams pages for your section.`;
  }
  if (/assign/.test(text)) {
    return `Hi ${name}, open the Assignments page to see deadlines and mark work as complete.`;
  }
  if (/hello|hi|hey/.test(text)) {
    return `Hi ${name}! I'm your campus assistant. Ask me about your next class, attendance, exams, or assignments.`;
  }

  return `Hi ${name}, I received your message: "${message}". I can help with class schedules, attendance, exams, and assignments.`;
}

function buildContextText({ routine, updates, exams, conflicts }) {
  const routineText = routine
    .map(
      (entry) =>
        `Section ${entry.sectionName}: ${entry.day} P${entry.period} ${entry.course?.code || entry.courseId} ${entry.startTime}-${entry.endTime}${entry.room ? ` @${entry.room}` : ''}`
    )
    .join('\n');
  const noticesText = updates
    .map((update) => `${update.title}: ${update.description}`)
    .join('\n');
  const examsText = exams
    .map(
      (exam) =>
        `${exam.course?.code || exam.courseId} ${exam.examType} on ${exam.examDate} ${exam.startTime}-${exam.endTime}${exam.room ? ` @${exam.room}` : ''}`
    )
    .join('\n');
  const conflictsText = conflicts.map((conflict) => conflict.description).join('\n');
  return [
    'ROUTINE:',
    routineText || 'No routine entries found.',
    'NOTICES:',
    noticesText || 'No notices found.',
    'EXAMS:',
    examsText || 'No exams found.',
    'CONFLICTS:',
    conflictsText || 'No conflicts found.',
  ].join('\n');
}

function detectConflicts(routine, exams) {
  const conflicts = [];
  const byDay = new Map();
  for (const entry of routine) {
    if (!entry.day || entry.isBreak) continue;
    const entries = byDay.get(entry.day) || [];
    for (const other of entries) {
      if (overlaps(entry.startTime, entry.endTime, other.startTime, other.endTime)) {
        conflicts.push({
          type: 'time_overlap',
          description: `${entry.course?.code || entry.courseId} and ${other.course?.code || other.courseId} overlap on ${entry.day}`,
        });
      }
    }
    entries.push(entry);
    byDay.set(entry.day, entries);
  }
  for (const exam of exams) {
    const day = new Date(`${exam.examDate}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: env.timeZone,
    });
    for (const entry of routine) {
      if (entry.day === day && overlaps(exam.startTime, exam.endTime, entry.startTime, entry.endTime)) {
        conflicts.push({
          type: 'exam_conflict',
          description: `${exam.course?.code || exam.courseId} exam overlaps ${entry.course?.code || entry.courseId} on ${exam.examDate}`,
        });
      }
    }
  }
  return conflicts;
}

function overlaps(startA, endA, startB, endB) {
  const toMinutes = (value) => {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const a = [toMinutes(startA), toMinutes(endA)];
  const b = [toMinutes(startB), toMinutes(endB)];
  return (
    a[0] != null &&
    a[1] != null &&
    b[0] != null &&
    b[1] != null &&
    a[0] < b[1] &&
    b[0] < a[1]
  );
}

/**
 * Optional LLM-backed reply. The frontend forwards a per-user Gemini key via
 * the `x-gemini-api-key` header (fallback: server env). Uses the OpenAI chat
 * completions wire format, which Gemini also exposes
 * (https://generativelanguage.googleapis.com/v1beta/openai/). Falls back to the
 * deterministic campus assistant reply when no key is configured or the call
 * fails.
 */
async function generateChatReply({ message, history, user, headers, context }) {
  const headerKey = String(headers?.['x-gemini-api-key'] ?? '');
  const openAiKey = String(headers?.['x-openai-api-key'] ?? '');
  const key = (headerKey || openAiKey || String(env.geminiApiKey || '')).trim();
  if (!key) return null;

  const baseUrl = String(env.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = String(env.openaiModel || 'gpt-4o-mini');
  const systemPrompt = [
    'You are the CUET AI Campus assistant. Answer student questions about their class',
    'schedule, attendance, exams, assignments, and notices using only the context they',
    'provide. Keep replies short and helpful. Batch numbers are numeric cohort codes such as 22, not years.',
    context?.text || '',
  ].join('\n');

  const messages = [{ role: 'system', content: systemPrompt }];
  if (Array.isArray(history)) {
    for (const turn of history) {
      if (!turn) continue;
      if (typeof turn === 'string') {
        messages.push({ role: 'user', content: turn });
      } else if (turn.role && turn.content) {
        messages.push({ role: turn.role, content: turn.content });
      }
    }
  }
  messages.push({ role: 'user', content: String(message) });

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.3 }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
  } catch {
    // Network/API failures fall through to the deterministic assistant.
  }
  return null;
}

export default router;
