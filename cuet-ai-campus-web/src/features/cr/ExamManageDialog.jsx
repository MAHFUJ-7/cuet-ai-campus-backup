// Manage declared assessments — reschedule or cancel CTs and exam documents.
//
// Two kinds of declarations live in the CR Center:
//  1. CT / quiz / viva  → batch-wide ScheduleOverride groups (instant).
//     Reschedule = declare the replacement first, then withdraw the old one,
//     so the calendar never loses the assessment mid-flight.
//  2. Exam documents    → created by the full exam routine builder and kept
//     "pending" until the coordinator approves. Editing one sends it back to
//     pending; cancelling deletes it outright.
import { useEffect, useState } from 'react';
import { Button, ConfirmDialog, Icon, Spinner } from '../../components/ui/index.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { deleteExam, getExams, getOverrides, updateExam } from '../../api/endpoints.js';
import { extractPayload } from '../../api/client.js';
import { isoDate } from '../../lib/datetime.js';
import { parseScheduleOverride } from '../../lib/models.js';
import { CrDialog } from './CrShared.jsx';

const INPUT_CLASS =
  'w-full rounded-xl border border-outline bg-surface px-3.5 py-2.5 text-body-md text-ink focus:border-primary focus:outline-none';

const dmyFromIso = (iso) => {
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return String(iso);
  return `${Number(d)}/${Number(m)}/${y}`;
};

const tomorrowIso = () => isoDate(new Date(Date.now() + 86_400_000));

const EXAM_STATUS_STYLE = {
  pending: { bg: 'bg-warning/15', text: 'text-warning', label: 'Pending approval' },
  approved: { bg: 'bg-success/15', text: 'text-success', label: 'Approved' },
  rejected: { bg: 'bg-critical/15', text: 'text-critical', label: 'Rejected' },
};

function StatusBadge({ status }) {
  const style = EXAM_STATUS_STYLE[status] ?? EXAM_STATUS_STYLE.pending;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${style.bg} ${style.text}`}>
      {style.label.toUpperCase()}
    </span>
  );
}

function SlotFields({ date, startTime, endTime, room, onChange }) {
  return (
    <div className="space-y-2 rounded-xl border border-outline p-3">
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="mb-1 block text-label-md font-medium text-ink-muted">Date</span>
          <input
            type="date"
            value={date}
            min={isoDate(new Date())}
            onChange={(e) => onChange({ date: e.target.value || tomorrowIso() })}
            className={INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-label-md font-medium text-ink-muted">Start</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => onChange({ startTime: e.target.value })}
            className={INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-label-md font-medium text-ink-muted">End</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => onChange({ endTime: e.target.value })}
            className={INPUT_CLASS}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-label-md font-medium text-ink-muted">Room (optional)</span>
        <input
          type="text"
          value={room}
          onChange={(e) => onChange({ room: e.target.value })}
          placeholder="e.g. R-402"
          className={INPUT_CLASS}
        />
      </label>
    </div>
  );
}

export default function ExamManageDialog({ open, onClose, controller, profile }) {
  const toast = useToast();
  const [exams, setExams] = useState(null);
  const [cts, setCts] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Inline edit state — one slot per dialog: { kind: 'exam'|'ct', id, date, startTime, endTime, room }
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind, id, label }

  const reload = async () => {
    try {
      const [examsRes, overridesRes] = await Promise.all([getExams({ limit: 100 }), getOverrides()]);
      const examsPayload = extractPayload(examsRes);
      const items = Array.isArray(examsPayload) ? examsPayload : examsPayload?.items ?? [];
      setExams(items);

      const overridesPayload = extractPayload(overridesRes);
      const list = Array.isArray(overridesPayload) ? overridesPayload : overridesPayload?.items ?? [];
      setCts(
        list
          .map(parseScheduleOverride)
          .filter((o) => o.type === 'extra_class' && o.classType === 'ct' && o.status !== 'rejected')
      );
    } catch (error) {
      setExams([]);
      setCts([]);
      toast.error(`Could not load assessments: ${error?.userMessage ?? error?.message ?? error}`);
    }
  };

  useEffect(() => {
    if (!open) return;
    setEdit(null);
    setConfirm(null);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const timeValid = Boolean(edit && edit.startTime && edit.endTime && edit.startTime < edit.endTime);

  // --- Exam documents -------------------------------------------------------

  const saveExam = async () => {
    setBusyId(edit.id);
    try {
      await updateExam(edit.id, {
        examDate: edit.date,
        startTime: edit.startTime,
        endTime: edit.endTime,
        ...(edit.room.trim() ? { room: edit.room.trim() } : {}),
      });
      toast.success('Reschedule submitted — waiting for coordinator approval');
      setEdit(null);
      await reload();
    } catch (error) {
      toast.error(`Failed to reschedule: ${error?.userMessage ?? error?.message ?? error}`);
    } finally {
      setBusyId(null);
    }
  };

  const cancelExam = async (exam) => {
    setBusyId(exam.id);
    try {
      await deleteExam(exam.id);
      toast.success(`${exam.course?.code ?? 'Exam'} cancelled`);
      setConfirm(null);
      await reload();
    } catch (error) {
      toast.error(`Failed to cancel: ${error?.userMessage ?? error?.message ?? error}`);
    } finally {
      setBusyId(null);
    }
  };

  // --- Declared CTs (override groups) --------------------------------------

  const saveCt = async () => {
    const ct = cts.find((item) => item.id === edit.id);
    if (!ct) return;
    setBusyId(edit.id);
    try {
      // 1) Declare the replacement CT at the new slot (batch-wide again).
      await controller.submitOverride(
        {
          type: 'extra_class',
          classType: 'ct',
          date: edit.date,
          courseId: ct.course?.id ?? ct.courseId,
          courseCode: ct.course?.code ?? '',
          courseTitle: ct.course?.title ?? '',
          startTime: edit.startTime,
          endTime: edit.endTime,
          ...(edit.room.trim() ? { room: edit.room.trim() } : {}),
          reason: `Rescheduled — was ${ct.startTime ?? '—'}–${ct.endTime ?? '—'}${
            ct.specificDate ? ` on ${dmyFromIso(ct.specificDate)}` : ''
          }`,
        },
        `${ct.course?.code ?? 'CT'} CT rescheduled to ${dmyFromIso(edit.date)} ${edit.startTime}–${edit.endTime}`
      );
      // 2) Withdraw the original declaration (removes the whole batch-wide
      //    group and its feed posts).
      try {
        await controller.withdraw(ct);
      } catch {
        /* the new slot is live; the old one can still be withdrawn manually */
      }
      toast.success('CT rescheduled');
      setEdit(null);
      await reload();
    } catch (error) {
      toast.error(`Failed to reschedule: ${error?.userMessage ?? error?.message ?? error}`);
    } finally {
      setBusyId(null);
    }
  };

  const cancelCt = async (ct) => {
    setBusyId(ct.id);
    try {
      await controller.withdraw(ct);
      toast.success(`${ct.course?.code ?? 'CT'} withdrawn for the whole batch`);
      setConfirm(null);
      await reload();
    } catch (error) {
      toast.error(`Failed to withdraw: ${error?.userMessage ?? error?.message ?? error}`);
    } finally {
      setBusyId(null);
    }
  };

  const busy = busyId != null;

  return (
    <CrDialog open={open} onClose={busy ? () => {} : onClose}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-info/15 text-info">
          <Icon name="edit_calendar" size={22} />
        </span>
        <div>
          <p className="text-title-lg font-extrabold text-ink">Manage CTs &amp; exams</p>
          <p className="text-label-md text-ink-muted">Reschedule or cancel your declarations</p>
        </div>
      </div>

      <div className="mt-4 max-h-[55vh] space-y-4 overflow-y-auto pr-1">
        {/* Exam documents */}
        <div>
          <p className="mb-2 text-label-md font-extrabold tracking-widest text-ink-muted">
            EXAM ROUTINE (COORDINATOR APPROVAL)
          </p>
          {exams == null ? (
            <div className="flex justify-center py-4">
              <Spinner size={22} />
            </div>
          ) : exams.length === 0 ? (
            <p className="text-body-sm text-ink-muted">
              No exams declared yet — use "Full Exam Routine" to declare them.
            </p>
          ) : (
            exams.map((exam) => {
              const editing = edit?.kind === 'exam' && edit.id === exam.id;
              return (
                <div key={exam.id ?? exam._id} className="mb-2 rounded-xl border border-outline p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-body-md font-semibold text-ink">
                          {exam.course?.code ?? 'Course'} · {exam.examType}
                        </p>
                        <StatusBadge status={exam.status} />
                      </div>
                      <p className="text-label-md text-ink-muted">
                        {dmyFromIso(exam.examDate)} · {exam.startTime}–{exam.endTime}
                        {exam.room ? ` · Room ${exam.room}` : ''}
                      </p>
                    </div>
                  </div>

                  {editing ? (
                    <div className="mt-2 space-y-2">
                      <SlotFields
                        date={edit.date}
                        startTime={edit.startTime}
                        endTime={edit.endTime}
                        room={edit.room}
                        onChange={(patch) => setEdit((f) => ({ ...f, ...patch }))}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outlined"
                          className="flex-1"
                          onClick={() => setEdit(null)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="filled"
                          className="flex-1"
                          onClick={saveExam}
                          disabled={busy || !timeValid}
                        >
                          Save reschedule
                        </Button>
                      </div>
                      <p className="text-label-sm text-warning">
                        Rescheduling sends the exam back to the coordinator for approval.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="outlined"
                        className="flex-1"
                        onClick={() =>
                          setEdit({
                            kind: 'exam',
                            id: exam.id ?? exam._id,
                            date: exam.examDate || tomorrowIso(),
                            startTime: exam.startTime || '08:10',
                            endTime: exam.endTime || '09:00',
                            room: exam.room ?? '',
                          })
                        }
                        disabled={busy}
                      >
                        <Icon name="schedule" size={16} /> Change time
                      </Button>
                      <Button
                        variant="outlined"
                        className="flex-1 border-critical/60 text-critical"
                        onClick={() =>
                          setConfirm({
                            kind: 'exam',
                            id: exam.id ?? exam._id,
                            label: `${exam.course?.code ?? 'Course'} ${exam.examType} exam on ${dmyFromIso(
                              exam.examDate
                            )}`,
                          })
                        }
                        disabled={busy}
                      >
                        <Icon name="cancel" size={16} /> Cancel exam
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Declared CTs */}
        <div>
          <p className="mb-2 text-label-md font-extrabold tracking-widest text-ink-muted">
            DECLARED CTs (LIVE, BATCH-WIDE)
          </p>
          {cts == null ? (
            <div className="flex justify-center py-4">
              <Spinner size={22} />
            </div>
          ) : cts.length === 0 ? (
            <p className="text-body-sm text-ink-muted">
              No CTs declared yet — use "Class Test (CT)" to declare one.
            </p>
          ) : (
            cts.map((ct) => {
              const editing = edit?.kind === 'ct' && edit.id === ct.id;
              return (
                <div key={ct.id} className="mb-2 rounded-xl border border-outline p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-md font-semibold text-ink">
                        {ct.course?.code ?? 'CT'} · Class Test
                      </p>
                      <p className="text-label-md text-ink-muted">
                        {ct.specificDate ? dmyFromIso(ct.specificDate) : '—'} · {ct.startTime ?? '—'}–
                        {ct.endTime ?? '—'}
                        {ct.room ? ` · Room ${ct.room}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={ct.status} />
                  </div>

                  {editing ? (
                    <div className="mt-2 space-y-2">
                      <SlotFields
                        date={edit.date}
                        startTime={edit.startTime}
                        endTime={edit.endTime}
                        room={edit.room}
                        onChange={(patch) => setEdit((f) => ({ ...f, ...patch }))}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outlined"
                          className="flex-1"
                          onClick={() => setEdit(null)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="filled"
                          className="flex-1"
                          onClick={saveCt}
                          disabled={busy || !timeValid}
                        >
                          Save reschedule
                        </Button>
                      </div>
                      <p className="text-label-sm text-ink-muted">
                        The new slot is declared first, then the old one is withdrawn — the batch
                        never loses the CT mid-flight.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="outlined"
                        className="flex-1"
                        onClick={() =>
                          setEdit({
                            kind: 'ct',
                            id: ct.id,
                            date: ct.specificDate || tomorrowIso(),
                            startTime: ct.startTime || '08:10',
                            endTime: ct.endTime || '09:00',
                            room: ct.room ?? '',
                          })
                        }
                        disabled={busy}
                      >
                        <Icon name="schedule" size={16} /> Change time
                      </Button>
                      <Button
                        variant="outlined"
                        className="flex-1 border-critical/60 text-critical"
                        onClick={() =>
                          setConfirm({
                            kind: 'ct',
                            id: ct.id,
                            label: `${ct.course?.code ?? 'CT'} Class Test on ${
                              ct.specificDate ? dmyFromIso(ct.specificDate) : '—'
                            }`,
                          })
                        }
                        disabled={busy}
                      >
                        <Icon name="cancel" size={16} /> Withdraw CT
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-4">
        <Button variant="outlined" className="w-full" onClick={onClose} disabled={busy}>
          Close
        </Button>
      </div>

      <ConfirmDialog
        open={confirm != null}
        title={confirm?.kind === 'exam' ? 'Cancel exam?' : 'Withdraw CT?'}
        message={`${confirm?.label ?? ''} will be removed for the whole batch and its feed post deleted.`}
        confirmLabel={confirm?.kind === 'exam' ? 'Cancel exam' : 'Withdraw'}
        danger
        onConfirm={() => (confirm?.kind === 'exam' ? cancelExam({ id: confirm.id }) : cancelCt({ id: confirm.id }))}
        onCancel={() => setConfirm(null)}
      />
    </CrDialog>
  );
}
