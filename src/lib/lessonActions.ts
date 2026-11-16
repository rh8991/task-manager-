import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { fail, newRef, queue } from "./actions";
import { mergeReviews, validateReviews, type ReviewRow } from "./reviews";
import { submitBlocker } from "./allergens";
import { adminBatch, uploadLessonFile } from "./fileStore";
import type { EquipmentRequest, Lesson, LessonActivity, LessonItem, LessonStatus, LessonSubmission } from "./types";

/** Manager actions for lessons (מערכים). firestore.rules allow them only for admins. */

export type LessonInput = Pick<
  Lesson,
  "title" | "subject" | "gradeFrom" | "gradeTo" | "location" | "durationMin" | "kind" | "goals" | "summary" | "ownerIds" | "startDate" | "dueDate"
> & {
  status: LessonStatus;
  reviews: ReviewRow[];
  activities: LessonActivity[];
  equipment: LessonItem[];
  safety: string[];
};

function check(input: LessonInput) {
  if (!input.title.trim()) fail("יש להזין שם למערך");
  if (input.gradeFrom > input.gradeTo) fail("השכבה הראשונה צריכה להיות לפני האחרונה");
  if (input.startDate && input.dueDate && input.startDate > input.dueDate) fail("תאריך ההתחלה אחרי תאריך היעד");
  const err = validateReviews(input.reviews, input.dueDate);
  if (err) fail(err);
  if (input.equipment.some((i) => !i.name.trim())) fail("לכל פריט ציוד צריך שם");
}

export async function createLesson(input: LessonInput): Promise<string> {
  check(input);
  const ref = newRef("lessons");
  const t = Date.now();
  const b = writeBatch(db);
  b.set(ref, {
    ...input,
    title: input.title.trim(),
    reviews: mergeReviews(input.reviews, []),
    remindedReviewIds: [],
    managerNotes: null,
    version: 0,
    lastSubmittedAt: null,
    lastProofId: null,
    reminderSentAt: null,
    createdAt: t,
    updatedAt: t,
  } satisfies Lesson);
  if (input.ownerIds.length) queue(b, { type: "lesson-assigned", lessonId: ref.id, workerIds: input.ownerIds });
  await b.commit();
  return ref.id;
}

/** Returns how many newly assigned instructors will get an email. */
export async function updateLesson(id: string, input: LessonInput): Promise<number> {
  check(input);
  const snap = await getDoc(doc(db, "lessons", id));
  if (!snap.exists()) fail("המערך לא נמצא");
  const before = snap.data() as Lesson;
  const added = input.ownerIds.filter((w) => !before.ownerIds.includes(w));
  const b = writeBatch(db);
  b.update(doc(db, "lessons", id), {
    ...input,
    title: input.title.trim(),
    reviews: mergeReviews(input.reviews, before.reviews),
    reminderSentAt: input.dueDate !== before.dueDate ? null : before.reminderSentAt,
    updatedAt: Date.now(),
  });
  if (added.length) queue(b, { type: "lesson-assigned", lessonId: id, workerIds: added });
  await b.commit();
  return added.length;
}

export const setLessonStatus = (id: string, status: LessonStatus) =>
  updateDoc(doc(db, "lessons", id), { status, updatedAt: Date.now() });

export async function setLessonReviewDone(id: string, reviewId: string, done: boolean) {
  const snap = await getDoc(doc(db, "lessons", id));
  if (!snap.exists()) fail("המערך לא נמצא");
  const reviews = ((snap.data() as Lesson).reviews ?? []).map((r) => (r.id === reviewId ? { ...r, done, doneAt: done ? Date.now() : null } : r));
  await updateDoc(doc(db, "lessons", id), { reviews, updatedAt: Date.now() });
}

export const deleteLesson = (id: string) => deleteDoc(doc(db, "lessons", id));

/** Approve or return with notes. The instructors get an email. */
export async function decideSubmission(lessonId: string, submissionId: string, decision: "APPROVED" | "CHANGES_REQUESTED", notes: string | null) {
  if (decision === "CHANGES_REQUESTED" && !notes?.trim()) fail("כדי להחזיר את המערך, יש לכתוב הערות למדריכים");
  const t = Date.now();
  const b = writeBatch(db);
  b.update(doc(db, "lessonSubmissions", submissionId), { decision, decisionNotes: notes?.trim() || null, decidedAt: t });
  b.update(doc(db, "lessons", lessonId), {
    status: decision,
    managerNotes: decision === "CHANGES_REQUESTED" ? notes!.trim() : null,
    updatedAt: t,
  });
  queue(b, { type: "lesson-decision", lessonId, submissionId });
  await b.commit();
}

/** The manager uploads a file herself (e.g. got it by email) and records it as a submission. */
export async function managerSubmit(lesson: Lesson & { id: string }, file: File, note: string | null, onProgress?: (d: number, t: number) => void) {
  const blocker = submitBlocker(lesson);
  if (blocker) fail(blocker);
  const f = await uploadLessonFile(lesson.id, file, null, adminBatch, onProgress);
  const t = Date.now();
  const b = writeBatch(db);
  const sub = newRef("lessonSubmissions");
  b.set(sub, {
    lessonId: lesson.id,
    version: lesson.version + 1,
    fileId: f.fileId,
    fileName: f.name,
    fileSize: f.size,
    note,
    submittedBy: null,
    submittedAt: t,
    emailStatus: "pending",
    emailAt: null,
    emailError: null,
    decision: null,
    decisionNotes: null,
    decidedAt: null,
    proofId: null,
  } satisfies LessonSubmission);
  b.update(doc(db, "lessons", lesson.id), { status: "SUBMITTED", version: lesson.version + 1, lastSubmittedAt: t, updatedAt: t });
  queue(b, { type: "lesson-submitted", lessonId: lesson.id, submissionId: sub.id });
  await b.commit();
}

/** "Order" button next to an equipment item: creates an approved equipment request for the lab. */
export async function orderLessonItem(lesson: Lesson & { id: string }, item: LessonItem, requesterId: string | null) {
  const t = Date.now();
  const qty = Number.parseInt(item.quantity, 10);
  await setDoc(newRef("equipment"), {
    item: item.name,
    quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    link: null,
    estCost: null,
    notes: `עבור המערך "${lesson.title}"${item.quantity && !/^\d+$/.test(item.quantity) ? ` · כמות: ${item.quantity}` : ""}${item.notes ? ` · ${item.notes}` : ""}`,
    neededBy: lesson.dueDate,
    status: "APPROVED",
    managerNote: null,
    requesterId,
    projectId: null,
    lessonId: lesson.id,
    proofId: null,
    approvedAt: t,
    orderedAt: null,
    receivedAt: null,
    createdAt: t,
    updatedAt: t,
  } satisfies EquipmentRequest);
}
