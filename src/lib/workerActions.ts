import { collection, doc, writeBatch, type WriteBatch } from "firebase/firestore";
import { db } from "./firebase";
import { TASK_STATUS } from "./labels";
import type { EquipmentRequest, MeetingRequest, Task, TaskStatus, WithId } from "./types";

/**
 * Worker actions from the personal link. Each is ONE batch: a new proofs/{id} doc holding the
 * secret token, plus the change that points to it. firestore.rules check the token there.
 * A notice for the manager is queued too (the mailer skips it if the manager turned it off).
 */
type Who = { token: string; workerId: string; workerName: string };

function start(who: Who): { b: WriteBatch; proofId: string; t: number } {
  const b = writeBatch(db);
  const proof = doc(collection(db, "proofs"));
  const t = Date.now();
  b.set(proof, { token: who.token, workerId: who.workerId, createdAt: t });
  return { b, proofId: proof.id, t };
}

function notifyManager(b: WriteBatch, proofId: string, t: number, subject: string, lines: string[], path: string) {
  b.set(doc(collection(db, "outbox")), {
    type: "manager-notice",
    subject: subject.slice(0, 300),
    lines: lines.slice(0, 10).map((l) => l.slice(0, 2000)),
    path,
    proofId,
    status: "pending",
    createdAt: t,
  });
}

export async function updateMyTask(who: Who, task: WithId<Task>, status: TaskStatus, comment: string | null) {
  const changed = status !== task.status;
  if (!changed && !comment) return false;
  const { b, proofId, t } = start(who);
  b.update(doc(db, "tasks", task.id), {
    status,
    completedAt: status === "DONE" ? (changed ? t : task.completedAt) : null,
    lastComment: comment ?? task.lastComment ?? null,
    lastProofId: proofId,
    updatedAt: t,
  });
  b.set(doc(collection(db, "taskUpdates")), {
    taskId: task.id,
    workerId: who.workerId,
    oldStatus: task.status,
    newStatus: changed ? status : null,
    comment,
    proofId,
    createdAt: t,
  });
  notifyManager(
    b,
    proofId,
    t,
    changed ? `${who.workerName}: "${task.title}" ← ${TASK_STATUS[status]}` : `${who.workerName} הגיב/ה על "${task.title}"`,
    [
      `משימה: ${task.title}`,
      ...(changed ? [`סטטוס: ${TASK_STATUS[task.status]} ← ${TASK_STATUS[status]}`] : []),
      ...(comment ? [`הערה: ${comment}`] : []),
    ],
    `/admin/tasks/${task.id}`,
  );
  await b.commit();
  return true;
}

export async function requestEquipment(
  who: Who,
  input: Pick<EquipmentRequest, "item" | "quantity" | "link" | "estCost" | "notes" | "neededBy" | "projectId">,
) {
  const { b, proofId, t } = start(who);
  b.set(doc(collection(db, "equipment")), {
    ...input,
    status: "PENDING",
    managerNote: null,
    requesterId: who.workerId,
    proofId,
    approvedAt: null,
    orderedAt: null,
    receivedAt: null,
    createdAt: t,
    updatedAt: t,
  } satisfies EquipmentRequest);
  notifyManager(
    b,
    proofId,
    t,
    `בקשת ציוד חדשה מ${who.workerName}: ${input.item}`,
    [`פריט: ${input.item} × ${input.quantity}`, ...(input.notes ? [`הערות: ${input.notes}`] : []), "הבקשה ממתינה לאישורך."],
    "/admin/equipment",
  );
  await b.commit();
}

export async function requestMeeting(
  who: Who,
  input: Pick<MeetingRequest, "topic" | "notes" | "neededBy" | "withTeamId">,
  teamName: string | null,
) {
  const { b, proofId, t } = start(who);
  b.set(doc(collection(db, "meetings")), {
    ...input,
    status: "OPEN",
    requesterId: who.workerId,
    proofId,
    createdAt: t,
    updatedAt: t,
  } satisfies MeetingRequest);
  notifyManager(
    b,
    proofId,
    t,
    `${who.workerName} צריך/ה פגישה${teamName ? ` עם צוות ${teamName}` : ""}`,
    [`נושא: ${input.topic}`, ...(input.notes ? [`פרטים: ${input.notes}`] : [])],
    "/admin/meetings",
  );
  await b.commit();
}
