import { collection, doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { TASK_STATUS } from "./labels";
import type { Task, TaskStatus, WithId } from "./types";

/**
 * The signed-in instructor updates one of their own tasks (rules allow only status + comment).
 * A notice for the manager is queued too (the mailer skips it if the manager turned it off).
 */
type Who = { workerId: string; workerName: string };

export async function updateMyTask(who: Who, task: WithId<Task>, status: TaskStatus, comment: string | null) {
  const changed = status !== task.status;
  if (!changed && !comment) return false;
  const t = Date.now();
  const b = writeBatch(db);
  b.update(doc(db, "tasks", task.id), {
    status,
    completedAt: status === "DONE" ? (changed ? t : task.completedAt) : null,
    lastComment: comment ?? task.lastComment ?? null,
    updatedAt: t,
  });
  b.set(doc(collection(db, "taskUpdates")), {
    taskId: task.id,
    workerId: who.workerId,
    oldStatus: task.status,
    newStatus: changed ? status : null,
    comment,
    proofId: null,
    createdAt: t,
  });
  b.set(doc(collection(db, "outbox")), {
    type: "manager-notice",
    subject: (changed ? `${who.workerName}: "${task.title}" ← ${TASK_STATUS[status]}` : `${who.workerName} הגיב/ה על "${task.title}"`).slice(0, 300),
    lines: [
      `משימה: ${task.title}`,
      ...(changed ? [`סטטוס: ${TASK_STATUS[task.status]} ← ${TASK_STATUS[status]}`] : []),
      ...(comment ? [`הערה: ${comment}`] : []),
    ].map((l) => l.slice(0, 2000)),
    path: `/admin/tasks/${task.id}`,
    status: "pending",
    createdAt: t,
  });
  await b.commit();
  return true;
}
