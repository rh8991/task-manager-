"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";
import { back, oneOf, optInt, optStr, str } from "@/lib/form";
import { TASK_STATUS } from "@/lib/labels";
import { notifyManager } from "@/lib/notify";

/** Every worker action is authorized by the secret token in their personal link. */
async function workerFromForm(fd: FormData) {
  const token = str(fd, "token");
  const worker = token ? await db.worker.findUnique({ where: { token } }) : null;
  if (!worker || !worker.active) back("/", "הקישור האישי לא תקף. פנו למנהל לקבלת קישור חדש.", true);
  return worker;
}

function done(token: string, msg: string): never {
  revalidatePath("/", "layout");
  back(`/w/${token}`, msg);
}

export async function updateMyTask(fd: FormData) {
  const w = await workerFromForm(fd);
  const id = optInt(fd, "taskId");
  const status = oneOf(fd, "status", TaskStatus);
  const comment = optStr(fd, "comment");
  const task = id ? await db.task.findUnique({ where: { id } }) : null;
  if (!task || task.assigneeId !== w.id) back(`/w/${w.token}`, "המשימה לא נמצאה", true);
  if (!status) back(`/w/${w.token}`, "יש לבחור סטטוס", true);

  const changed = status !== task.status;
  if (!changed && !comment) back(`/w/${w.token}`, "לא בוצע שינוי");
  if (changed) {
    await db.task.update({ where: { id: task.id }, data: { status, completedAt: status === "DONE" ? new Date() : null } });
  }
  await db.taskUpdate.create({
    data: { taskId: task.id, workerId: w.id, oldStatus: task.status, newStatus: changed ? status : null, comment },
  });

  after(() =>
    notifyManager(
      changed ? `${w.name}: "${task.title}" ← ${TASK_STATUS[status]}` : `${w.name} הגיב/ה על "${task.title}"`,
      [
        `משימה: ${task.title}`,
        ...(changed ? [`סטטוס: ${TASK_STATUS[task.status]} ← ${TASK_STATUS[status]}`] : []),
        ...(comment ? [`הערה: ${comment}`] : []),
      ],
      `/admin/tasks/${task.id}`,
    ),
  );
  done(w.token, status === "DONE" && changed ? "כל הכבוד! המשימה סומנה כהושלמה" : "העדכון נשמר");
}

export async function requestEquipment(fd: FormData) {
  const w = await workerFromForm(fd);
  const item = str(fd, "item");
  if (!item) back(`/w/${w.token}`, "יש להזין שם פריט", true);
  const quantity = Math.max(1, optInt(fd, "quantity") ?? 1);
  const cost = Number.parseFloat(str(fd, "estCost"));
  const link = optStr(fd, "link");
  await db.equipmentRequest.create({
    data: {
      item,
      quantity,
      link: link && /^https?:\/\//i.test(link) ? link : null,
      estCost: Number.isFinite(cost) ? cost : null,
      notes: optStr(fd, "notes"),
      neededBy: parseDateInput(fd.get("neededBy")),
      projectId: optInt(fd, "projectId"),
      requesterId: w.id,
    },
  });
  after(() =>
    notifyManager(`בקשת ציוד חדשה מ${w.name}: ${item}`, [`פריט: ${item} × ${quantity}`, ...(optStr(fd, "notes") ? [`הערות: ${str(fd, "notes")}`] : []), "הבקשה ממתינה לאישורך."], "/admin/equipment?f=PENDING"),
  );
  done(w.token, "הבקשה נשלחה למנהל לאישור");
}

export async function requestMeeting(fd: FormData) {
  const w = await workerFromForm(fd);
  const topic = str(fd, "topic");
  if (!topic) back(`/w/${w.token}`, "יש להזין נושא לפגישה", true);
  const withTeamId = optInt(fd, "withTeamId");
  const team = withTeamId ? await db.team.findUnique({ where: { id: withTeamId } }) : null;
  await db.meetingRequest.create({
    data: { topic, notes: optStr(fd, "notes"), neededBy: parseDateInput(fd.get("neededBy")), withTeamId: team?.id ?? null, requesterId: w.id },
  });
  after(() =>
    notifyManager(`${w.name} צריך/ה פגישה${team ? ` עם צוות ${team.name}` : ""}`, [`נושא: ${topic}`, ...(optStr(fd, "notes") ? [`פרטים: ${str(fd, "notes")}`] : [])], "/admin/meetings"),
  );
  done(w.token, "הצורך בפגישה נרשם");
}
