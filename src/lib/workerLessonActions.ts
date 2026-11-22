import { collection, doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { UserError } from "./actions";
import { submitBlocker } from "./allergens";
import { uploadLessonFile, type BatchStarter } from "./fileStore";
import type { Lesson, LessonActivity, LessonItem, LessonStatus, LessonSubmission, MeetingRequest, WithId } from "./types";

/**
 * Instructor actions. The instructor is signed in (email link); firestore.rules check that they
 * work on the lesson (members/{email}.workerId is in lesson.ownerIds).
 */
export type Who = { workerId: string; workerName: string };

const plainBatch: BatchStarter = () => ({ b: writeBatch(db), proofId: null });

const editable = (s: LessonStatus) => ["IDEA", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED"].includes(s);

/** Save the equipment list / parts of the lesson / safety, and optionally the status. */
export async function saveMyLesson(
  _who: Who,
  lesson: WithId<Lesson>,
  edit: { equipment: LessonItem[]; activities: LessonActivity[]; safety: string[]; status?: LessonStatus },
) {
  if (!editable(lesson.status)) throw new UserError("המערך כבר אושר – כדי לערוך אותו, המנהל צריך להחזיר אותו לעבודה");
  if (edit.equipment.some((i) => !i.name.trim())) throw new UserError("לכל פריט ציוד צריך שם");
  let status = edit.status ?? lesson.status;
  // Saving work on an idea / returned lesson means it's being worked on.
  if (!edit.status && lesson.status === "CHANGES_REQUESTED") status = "IN_PROGRESS";
  if (status !== lesson.status && !["IDEA", "IN_PROGRESS"].includes(status)) {
    throw new UserError('אפשר לסמן "רעיון" או "בכתיבה". לבדיקה שולחים את קובץ המערך.');
  }
  const b = writeBatch(db);
  b.update(doc(db, "lessons", lesson.id), {
    equipment: edit.equipment,
    activities: edit.activities,
    safety: edit.safety,
    status,
    updatedAt: Date.now(),
  });
  await b.commit();
}

/** Just the status: "idea" or "in progress". */
export async function setMyLessonStatus(lesson: WithId<Lesson>, status: LessonStatus) {
  if (!editable(lesson.status)) throw new UserError("המערך כבר אושר – רק המנהל יכול לשנות את הסטטוס שלו");
  if (!["IDEA", "IN_PROGRESS"].includes(status)) throw new UserError('לבדיקה שולחים את קובץ המערך ("שליחה לבדיקה")');
  const b = writeBatch(db);
  b.update(doc(db, "lessons", lesson.id), { status, updatedAt: Date.now() });
  await b.commit();
}

export type StatusReport = { done: string | null; next: string | null; blockers: string | null };

/**
 * Upload the lesson file and send it to the manager for review: the mailer emails the file as an
 * attachment together with a status report.
 */
export async function submitMyLesson(
  who: Who,
  lesson: WithId<Lesson>,
  file: File,
  report: StatusReport,
  onProgress?: (d: number, t: number) => void,
) {
  const blocker = submitBlocker(lesson);
  if (blocker) throw new UserError(blocker);
  if (!editable(lesson.status)) throw new UserError("המערך כבר אושר. כדי לשלוח גרסה חדשה, המנהל צריך להחזיר אותו לעבודה.");
  const f = await uploadLessonFile(lesson.id, file, who.workerId, plainBatch, onProgress);

  const b = writeBatch(db);
  const t = Date.now();
  const sub = doc(collection(db, "lessonSubmissions"));
  const clip = (s: string | null) => (s?.trim() ? s.trim().slice(0, 2000) : null);
  const r = { done: clip(report.done), next: clip(report.next), blockers: clip(report.blockers) };
  b.set(sub, {
    lessonId: lesson.id,
    version: lesson.version + 1,
    fileId: f.fileId,
    fileName: f.name,
    fileSize: f.size,
    note: null,
    report: r.done || r.next || r.blockers ? r : null,
    submittedBy: who.workerId,
    submittedAt: t,
    emailStatus: "pending",
    emailAt: null,
    emailError: null,
    decision: null,
    decisionNotes: null,
    decidedAt: null,
    proofId: null,
  } satisfies LessonSubmission);
  b.update(doc(db, "lessons", lesson.id), {
    status: "SUBMITTED",
    version: lesson.version + 1,
    lastSubmittedAt: t,
    updatedAt: t,
  });
  b.set(doc(collection(db, "outbox")), { type: "lesson-submitted", lessonId: lesson.id, submissionId: sub.id, status: "pending", createdAt: t });
  await b.commit();
}

/**
 * "Request to the manager" about a lesson (e.g. a meeting with the lab is needed). Recorded as a
 * meeting need for the manager, and the manager gets an email.
 */
export async function askManager(who: Who, lesson: WithId<Lesson>, topic: string, notes: string | null) {
  if (!topic.trim()) throw new UserError("יש לכתוב במה צריך עזרה");
  const t = Date.now();
  const b = writeBatch(db);
  b.set(doc(collection(db, "meetings")), {
    topic: topic.trim().slice(0, 200),
    notes: notes?.trim().slice(0, 2000) || null,
    neededBy: null,
    status: "OPEN",
    withTeamId: null,
    lessonId: lesson.id,
    requesterId: who.workerId,
    proofId: null,
    createdAt: t,
    updatedAt: t,
  } satisfies MeetingRequest);
  b.set(doc(collection(db, "outbox")), {
    type: "manager-notice",
    subject: `בקשה מ${who.workerName} – מערך "${lesson.title}"`.slice(0, 300),
    lines: [`נושא: ${topic.trim()}`, ...(notes?.trim() ? [`פרטים: ${notes.trim()}`] : []), "נרשם בפגישות הנדרשות של המערך."],
    path: `/admin/lessons/${lesson.id}`,
    status: "pending",
    createdAt: t,
  });
  await b.commit();
}
