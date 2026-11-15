import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { dateKey } from "./dates";
import type {
  EquipmentRequest,
  EquipmentStatus,
  MeetingRequest,
  MeetingStatus,
  OutboxItem,
  Project,
  Settings,
  Task,
  TaskStatus,
  WorkerPrivate,
} from "./types";

/**
 * Manager actions. Each runs in the browser; firestore.rules only lets admins do them.
 * Emails are not sent here: an outbox doc is queued and the mailer job sends it (about 10 minutes).
 */

export class UserError extends Error {}
const fail = (msg: string): never => {
  throw new UserError(msg);
};

const now = () => Date.now();
const newRef = (col: string) => doc(collection(db, col));
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function queue(batch: ReturnType<typeof writeBatch>, item: OutboxItem) {
  batch.set(newRef("outbox"), { ...item, status: "pending", createdAt: now() });
}

/** Sets a field to null on every doc in `col` where `field == value` (like ON DELETE SET NULL). */
async function clearRefs(batch: ReturnType<typeof writeBatch>, col: string, field: string, value: string) {
  const snap = await getDocs(query(collection(db, col), where(field, "==", value)));
  snap.forEach((d) => batch.update(d.ref, { [field]: null }));
}

// ---------------------------------------------------------------- teams & workers

export async function createTeam(name: string) {
  if (!name.trim()) fail("יש להזין שם צוות");
  await setDoc(newRef("teams"), { name: name.trim(), createdAt: now() });
}

export async function deleteTeam(id: string) {
  const b = writeBatch(db);
  await clearRefs(b, "workers", "teamId", id);
  await clearRefs(b, "meetings", "withTeamId", id);
  b.delete(doc(db, "teams", id));
  await b.commit();
}

export async function createWorker(input: { name: string; email: string; teamId: string | null }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !isEmail(email)) fail("יש להזין שם וכתובת מייל תקינה");
  const ref = newRef("workers");
  const token = newToken();
  const b = writeBatch(db);
  b.set(ref, { name, teamId: input.teamId, active: true, createdAt: now() });
  b.set(doc(db, "workerPrivate", ref.id), { email, token } satisfies WorkerPrivate);
  b.set(doc(db, "workerLinks", token), { workerId: ref.id });
  await b.commit();
}

export async function updateWorker(id: string, input: { name: string; email: string; teamId: string | null; active: boolean }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !isEmail(email)) fail("יש להזין שם וכתובת מייל תקינה");
  const b = writeBatch(db);
  b.update(doc(db, "workers", id), { name, teamId: input.teamId, active: input.active });
  b.update(doc(db, "workerPrivate", id), { email });
  await b.commit();
}

export async function regenerateWorkerLink(id: string) {
  const priv = await getDoc(doc(db, "workerPrivate", id));
  const old = (priv.data() as WorkerPrivate | undefined)?.token;
  const token = newToken();
  const b = writeBatch(db);
  if (old) b.delete(doc(db, "workerLinks", old));
  b.set(doc(db, "workerLinks", token), { workerId: id });
  b.update(doc(db, "workerPrivate", id), { token });
  await b.commit();
}

export async function deleteWorker(id: string) {
  const priv = await getDoc(doc(db, "workerPrivate", id));
  const token = (priv.data() as WorkerPrivate | undefined)?.token;
  const b = writeBatch(db);
  await clearRefs(b, "tasks", "assigneeId", id);
  if (token) b.delete(doc(db, "workerLinks", token));
  b.delete(doc(db, "workerPrivate", id));
  b.delete(doc(db, "workers", id));
  await b.commit();
}

// ---------------------------------------------------------------- projects

export async function saveProject(id: string | null, input: Pick<Project, "name" | "description" | "dueDate"> & { active?: boolean }) {
  if (!input.name.trim()) fail("יש להזין שם פרויקט");
  const data = { name: input.name.trim(), description: input.description, dueDate: input.dueDate };
  if (id) await updateDoc(doc(db, "projects", id), { ...data, active: input.active ?? true });
  else await setDoc(newRef("projects"), { ...data, active: true, createdAt: now() });
}

export async function deleteProject(id: string) {
  const b = writeBatch(db);
  await clearRefs(b, "tasks", "projectId", id);
  await clearRefs(b, "equipment", "projectId", id);
  b.delete(doc(db, "projects", id));
  await b.commit();
}

// ---------------------------------------------------------------- tasks

export type TaskInput = Pick<Task, "title" | "description" | "priority" | "dueDate" | "projectId" | "assigneeId">;

export async function createTask(input: TaskInput): Promise<string> {
  if (!input.title.trim()) fail("יש להזין כותרת למשימה");
  const ref = newRef("tasks");
  const t = now();
  const b = writeBatch(db);
  b.set(ref, {
    ...input,
    title: input.title.trim(),
    status: "TODO",
    completedAt: null,
    lastComment: null,
    lastProofId: null,
    reminderSentAt: null,
    createdAt: t,
    updatedAt: t,
  } satisfies Task);
  if (input.assigneeId) queue(b, { type: "task-assigned", taskId: ref.id, reassigned: false });
  await b.commit();
  return ref.id;
}

/** Returns true when an email to a (new) assignee was queued. */
export async function updateTask(id: string, input: TaskInput & { status: TaskStatus; comment: string | null }): Promise<boolean> {
  if (!input.title.trim()) fail("יש להזין כותרת למשימה");
  const snap = await getDoc(doc(db, "tasks", id));
  if (!snap.exists()) fail("המשימה לא נמצאה");
  const before = snap.data() as Task;
  const { comment, ...fields } = input;
  const b = writeBatch(db);
  b.update(doc(db, "tasks", id), {
    ...fields,
    title: input.title.trim(),
    completedAt: input.status === "DONE" ? (before.completedAt ?? now()) : null,
    // A new due date or assignee should get a fresh reminder.
    reminderSentAt:
      dateKey(input.dueDate) !== dateKey(before.dueDate) || input.assigneeId !== before.assigneeId ? null : before.reminderSentAt,
    ...(comment ? { lastComment: comment } : {}),
    updatedAt: now(),
  });
  if (input.status !== before.status || comment) {
    b.set(newRef("taskUpdates"), {
      taskId: id,
      workerId: null,
      oldStatus: before.status,
      newStatus: input.status !== before.status ? input.status : null,
      comment,
      proofId: null,
      createdAt: now(),
    });
  }
  const reassigned = !!input.assigneeId && input.assigneeId !== before.assigneeId;
  if (reassigned) queue(b, { type: "task-assigned", taskId: id, reassigned: before.assigneeId !== null });
  await b.commit();
  return reassigned;
}

export async function setTaskStatus(id: string, status: TaskStatus, current: TaskStatus) {
  if (status === current) return;
  const b = writeBatch(db);
  b.update(doc(db, "tasks", id), { status, completedAt: status === "DONE" ? now() : null, updatedAt: now() });
  b.set(newRef("taskUpdates"), { taskId: id, workerId: null, oldStatus: current, newStatus: status, comment: null, proofId: null, createdAt: now() });
  await b.commit();
}

export async function deleteTask(id: string) {
  const b = writeBatch(db);
  const updates = await getDocs(query(collection(db, "taskUpdates"), where("taskId", "==", id)));
  updates.forEach((d) => b.delete(d.ref));
  b.delete(doc(db, "tasks", id));
  await b.commit();
}

export async function resendTaskEmail(id: string) {
  const b = writeBatch(db);
  queue(b, { type: "task-assigned", taskId: id, reassigned: false });
  await b.commit();
}

// ---------------------------------------------------------------- equipment

export type EquipmentInput = Pick<
  EquipmentRequest,
  "item" | "quantity" | "link" | "estCost" | "notes" | "neededBy" | "projectId" | "requesterId"
>;

/** Added by the manager, so it goes straight to "approved – to order". */
export async function createEquipment(input: EquipmentInput) {
  if (!input.item.trim()) fail("יש להזין שם פריט");
  const t = now();
  await setDoc(newRef("equipment"), {
    ...input,
    item: input.item.trim(),
    status: "APPROVED",
    managerNote: null,
    proofId: null,
    approvedAt: t,
    orderedAt: null,
    receivedAt: null,
    createdAt: t,
    updatedAt: t,
  } satisfies EquipmentRequest);
}

export async function setEquipmentStatus(id: string, status: EquipmentStatus, managerNote?: string | null) {
  const t = now();
  await updateDoc(doc(db, "equipment", id), {
    status,
    updatedAt: t,
    ...(managerNote !== undefined ? { managerNote } : {}),
    ...(status === "APPROVED" ? { approvedAt: t } : {}),
    ...(status === "ORDERED" ? { orderedAt: t } : {}),
    ...(status === "RECEIVED" ? { receivedAt: t } : {}),
  });
}

export const deleteEquipment = (id: string) => deleteDoc(doc(db, "equipment", id));

// ---------------------------------------------------------------- meetings

export async function createMeeting(input: Pick<MeetingRequest, "topic" | "notes" | "neededBy" | "withTeamId" | "requesterId">) {
  if (!input.topic.trim()) fail("יש להזין נושא");
  const t = now();
  await setDoc(newRef("meetings"), {
    ...input,
    topic: input.topic.trim(),
    status: "OPEN",
    proofId: null,
    createdAt: t,
    updatedAt: t,
  } satisfies MeetingRequest);
}

export const setMeetingStatus = (id: string, status: MeetingStatus) =>
  updateDoc(doc(db, "meetings", id), { status, updatedAt: now() });

export const deleteMeeting = (id: string) => deleteDoc(doc(db, "meetings", id));

// ---------------------------------------------------------------- reports & settings

export async function saveSettings(current: Settings, input: Omit<Settings, "scheduleUpdatedAt" | "lastReportAt" | "lastReminderDate">) {
  if (input.managerEmail && !isEmail(input.managerEmail)) fail("כתובת המייל של המנהל לא תקינה");
  const scheduleChanged =
    input.reportEnabled !== current.reportEnabled || input.reportDay !== current.reportDay || input.reportHour !== current.reportHour;
  await setDoc(
    doc(db, "settings", "main"),
    {
      ...input,
      managerName: input.managerName.trim() || current.managerName,
      managerEmail: input.managerEmail?.trim().toLowerCase() || null,
      ...(scheduleChanged || !current.scheduleUpdatedAt ? { scheduleUpdatedAt: now() } : {}),
    },
    { merge: true },
  );
}

export async function queueReport(workerIds: string[] | null, note: string | null) {
  if (workerIds && !workerIds.length) fail("לא נבחרו עובדים");
  const b = writeBatch(db);
  queue(b, { type: "report", workerIds, note });
  await b.commit();
}

export async function queueTestEmail(settings: Settings) {
  if (!settings.managerEmail) fail("יש לשמור קודם כתובת מייל של המנהל");
  const b = writeBatch(db);
  queue(b, { type: "test" });
  await b.commit();
}

