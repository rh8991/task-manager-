import { collection, doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { UserError } from "./actions";
import { submitBlocker } from "./allergens";
import { uploadLessonFile, type BatchStarter } from "./fileStore";
import type { Lesson, LessonActivity, LessonItem, LessonSubmission, WithId } from "./types";

/**
 * Instructor actions from the personal link. Every batch carries a fresh proofs/{id} with the
 * secret token; firestore.rules check that the worker is one of the lesson's instructors.
 */
type Who = { token: string; workerId: string; workerName: string };

const proofBatch =
  (who: Who): BatchStarter =>
  () => {
    const b = writeBatch(db);
    const p = doc(collection(db, "proofs"));
    b.set(p, { token: who.token, workerId: who.workerId, createdAt: Date.now() });
    return { b, proofId: p.id };
  };

/** Save the equipment list / parts of the lesson / safety (and optionally start working on it). */
export async function saveMyLesson(
  who: Who,
  lesson: WithId<Lesson>,
  edit: { equipment: LessonItem[]; activities: LessonActivity[]; safety: string[] },
) {
  if (edit.equipment.some((i) => !i.name.trim())) throw new UserError("לכל פריט ציוד צריך שם");
  // Saving moves an idea / returned lesson to "in progress". Approved lessons are read-only for
  // instructors until the manager reopens them (also enforced by firestore.rules).
  let status = lesson.status;
  if (status === "IDEA" || status === "CHANGES_REQUESTED") status = "IN_PROGRESS";
  if (status !== "IN_PROGRESS" && status !== "SUBMITTED") throw new UserError("המערך כבר אושר – כדי לערוך אותו, המנהלת צריכה להחזיר אותו לעבודה");
  const { b, proofId } = proofBatch(who)();
  b.update(doc(db, "lessons", lesson.id), {
    equipment: edit.equipment,
    activities: edit.activities,
    safety: edit.safety,
    status,
    lastProofId: proofId,
    updatedAt: Date.now(),
  });
  await b.commit();
}

/** Upload the lesson file and send it to the program manager for review (with an email + attachment). */
export async function submitMyLesson(who: Who, lesson: WithId<Lesson>, file: File, note: string | null, onProgress?: (d: number, t: number) => void) {
  const blocker = submitBlocker(lesson);
  if (blocker) throw new UserError(blocker);
  if (!["IDEA", "IN_PROGRESS", "CHANGES_REQUESTED", "SUBMITTED"].includes(lesson.status)) {
    throw new UserError("המערך כבר אושר. כדי לשלוח גרסה חדשה, המנהלת צריכה להחזיר אותו לעבודה.");
  }
  const start = proofBatch(who);
  const f = await uploadLessonFile(lesson.id, file, who.workerId, start, onProgress);

  const { b, proofId } = start();
  const t = Date.now();
  const sub = doc(collection(db, "lessonSubmissions"));
  b.set(sub, {
    lessonId: lesson.id,
    version: lesson.version + 1,
    fileId: f.fileId,
    fileName: f.name,
    fileSize: f.size,
    note: note?.slice(0, 2000) ?? null,
    submittedBy: who.workerId,
    submittedAt: t,
    emailStatus: "pending",
    emailAt: null,
    emailError: null,
    decision: null,
    decisionNotes: null,
    decidedAt: null,
    proofId,
  } satisfies LessonSubmission);
  b.update(doc(db, "lessons", lesson.id), {
    status: "SUBMITTED",
    version: lesson.version + 1,
    lastSubmittedAt: t,
    lastProofId: proofId,
    updatedAt: t,
  });
  b.set(doc(collection(db, "outbox")), {
    type: "lesson-submitted",
    lessonId: lesson.id,
    submissionId: sub.id,
    proofId,
    status: "pending",
    createdAt: t,
  });
  await b.commit();
}
