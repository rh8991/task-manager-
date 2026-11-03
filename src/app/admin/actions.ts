"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { EquipmentStatus, MeetingStatus, Priority, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { destroyAdminSession, newWorkerToken, requireAdmin } from "@/lib/auth";
import { dateKey, parseDateInput } from "@/lib/dates";
import { back, isEmail, oneOf, optInt, optStr, safePath, str } from "@/lib/form";
import { getSettings, notifyTaskAssigned, sendReports } from "@/lib/notify";
import { sendEmail } from "@/lib/email";
import { managerNoticeEmail } from "@/lib/email-templates";
import { appUrl } from "@/lib/email";

function done(path: string, msg: string): never {
  revalidatePath("/", "layout");
  back(path, msg);
}

export async function logout() {
  await destroyAdminSession();
  redirect("/login");
}

// ---------------------------------------------------------------- Teams & workers

export async function createTeam(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) back("/admin/workers", "יש להזין שם צוות", true);
  const exists = await db.team.findUnique({ where: { name } });
  if (exists) back("/admin/workers", "צוות בשם הזה כבר קיים", true);
  await db.team.create({ data: { name } });
  done("/admin/workers", `הצוות "${name}" נוסף`);
}

export async function deleteTeam(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  if (id) await db.team.delete({ where: { id } });
  done("/admin/workers", "הצוות נמחק");
}

export async function createWorker(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  if (!name || !isEmail(email)) back("/admin/workers", "יש להזין שם וכתובת מייל תקינה", true);
  await db.worker.create({ data: { name, email, teamId: optInt(fd, "teamId"), token: newWorkerToken() } });
  done("/admin/workers", `${name} נוסף/ה`);
}

export async function updateWorker(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  if (!id || !name || !isEmail(email)) back("/admin/workers", "יש להזין שם וכתובת מייל תקינה", true);
  await db.worker.update({
    where: { id },
    data: { name, email, teamId: optInt(fd, "teamId"), active: fd.get("active") === "on" },
  });
  done("/admin/workers", "הפרטים עודכנו");
}

export async function regenerateWorkerLink(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  if (id) await db.worker.update({ where: { id }, data: { token: newWorkerToken() } });
  done("/admin/workers", "נוצר קישור אישי חדש. הקישור הקודם כבר לא עובד.");
}

export async function deleteWorker(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  if (id) await db.worker.delete({ where: { id } });
  done("/admin/workers", "העובד/ת נמחק/ה. המשימות שלו/ה נשארו ללא אחראי.");
}

// ---------------------------------------------------------------- Projects

export async function createProject(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) back("/admin/projects", "יש להזין שם פרויקט", true);
  await db.project.create({ data: { name, description: optStr(fd, "description"), dueDate: parseDateInput(fd.get("dueDate")) } });
  done("/admin/projects", `הפרויקט "${name}" נוצר`);
}

export async function updateProject(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  const name = str(fd, "name");
  if (!id || !name) back("/admin/projects", "יש להזין שם פרויקט", true);
  await db.project.update({
    where: { id },
    data: {
      name,
      description: optStr(fd, "description"),
      dueDate: parseDateInput(fd.get("dueDate")),
      active: fd.get("active") === "on",
    },
  });
  done("/admin/projects", "הפרויקט עודכן");
}

export async function deleteProject(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  if (id) await db.project.delete({ where: { id } });
  done("/admin/projects", "הפרויקט נמחק. המשימות שלו נשארו ללא פרויקט.");
}

// ---------------------------------------------------------------- Tasks

export async function createTask(fd: FormData) {
  await requireAdmin();
  const title = str(fd, "title");
  const backTo = safePath(str(fd, "back"), "/admin/tasks");
  if (!title) back(backTo, "יש להזין כותרת למשימה", true);
  const task = await db.task.create({
    data: {
      title,
      description: optStr(fd, "description"),
      priority: oneOf(fd, "priority", Priority) ?? "MEDIUM",
      dueDate: parseDateInput(fd.get("dueDate")),
      projectId: optInt(fd, "projectId"),
      assigneeId: optInt(fd, "assigneeId"),
    },
  });
  if (task.assigneeId) after(() => notifyTaskAssigned(task.id));
  done(backTo, task.assigneeId ? "המשימה נוצרה ונשלח מייל לעובד/ת" : "המשימה נוצרה");
}

export async function updateTask(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  const title = str(fd, "title");
  if (!id) back("/admin/tasks", "משימה לא נמצאה", true);
  if (!title) back(`/admin/tasks/${id}`, "יש להזין כותרת למשימה", true);
  const before = await db.task.findUnique({ where: { id } });
  if (!before) back("/admin/tasks", "משימה לא נמצאה", true);

  const status = oneOf(fd, "status", TaskStatus) ?? before.status;
  const assigneeId = optInt(fd, "assigneeId");
  const dueDate = parseDateInput(fd.get("dueDate"));
  const comment = optStr(fd, "comment");

  await db.task.update({
    where: { id },
    data: {
      title,
      description: optStr(fd, "description"),
      priority: oneOf(fd, "priority", Priority) ?? before.priority,
      projectId: optInt(fd, "projectId"),
      status,
      assigneeId,
      dueDate,
      completedAt: status === "DONE" ? (before.completedAt ?? new Date()) : null,
      // A new due date or assignee should get a fresh reminder.
      reminderSentAt: dateKey(dueDate) !== dateKey(before.dueDate) || assigneeId !== before.assigneeId ? null : before.reminderSentAt,
    },
  });

  if (status !== before.status || comment) {
    await db.taskUpdate.create({
      data: { taskId: id, oldStatus: before.status, newStatus: status !== before.status ? status : null, comment },
    });
  }
  const reassigned = !!assigneeId && assigneeId !== before.assigneeId;
  if (reassigned) after(() => notifyTaskAssigned(id, before.assigneeId !== null));
  done(`/admin/tasks/${id}`, reassigned ? "המשימה עודכנה ונשלח מייל לעובד/ת החדש/ה" : "המשימה עודכנה");
}

export async function setTaskStatus(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  const status = oneOf(fd, "status", TaskStatus);
  const backTo = safePath(str(fd, "back"), "/admin/tasks");
  if (!id || !status) back(backTo, "נתונים חסרים", true);
  const before = await db.task.findUnique({ where: { id } });
  if (!before) back(backTo, "משימה לא נמצאה", true);
  if (before.status !== status) {
    await db.task.update({ where: { id }, data: { status, completedAt: status === "DONE" ? new Date() : null } });
    await db.taskUpdate.create({ data: { taskId: id, oldStatus: before.status, newStatus: status } });
  }
  done(backTo, "הסטטוס עודכן");
}

export async function deleteTask(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  if (id) await db.task.delete({ where: { id } });
  done("/admin/tasks", "המשימה נמחקה");
}

export async function resendTaskEmail(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  if (id) await notifyTaskAssigned(id);
  done(`/admin/tasks/${id}`, "המייל נשלח שוב");
}

// ---------------------------------------------------------------- Equipment

export async function createEquipment(fd: FormData) {
  await requireAdmin();
  const item = str(fd, "item");
  if (!item) back("/admin/equipment", "יש להזין שם פריט", true);
  const cost = Number.parseFloat(str(fd, "estCost"));
  await db.equipmentRequest.create({
    data: {
      item,
      quantity: Math.max(1, optInt(fd, "quantity") ?? 1),
      link: optStr(fd, "link"),
      estCost: Number.isFinite(cost) ? cost : null,
      notes: optStr(fd, "notes"),
      neededBy: parseDateInput(fd.get("neededBy")),
      projectId: optInt(fd, "projectId"),
      requesterId: optInt(fd, "requesterId"),
      // Added by the manager, so it is approved already.
      status: "APPROVED",
      approvedAt: new Date(),
    },
  });
  done("/admin/equipment", "הפריט נוסף לרשימת ההזמנות");
}

export async function setEquipmentStatus(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  const status = oneOf(fd, "status", EquipmentStatus);
  if (!id || !status) back("/admin/equipment", "נתונים חסרים", true);
  const now = new Date();
  await db.equipmentRequest.update({
    where: { id },
    data: {
      status,
      ...(fd.has("managerNote") ? { managerNote: optStr(fd, "managerNote") } : {}),
      ...(status === "APPROVED" ? { approvedAt: now } : {}),
      ...(status === "ORDERED" ? { orderedAt: now } : {}),
      ...(status === "RECEIVED" ? { receivedAt: now } : {}),
    },
  });
  done("/admin/equipment", "הסטטוס עודכן");
}

export async function deleteEquipment(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  if (id) await db.equipmentRequest.delete({ where: { id } });
  done("/admin/equipment", "הבקשה נמחקה");
}

// ---------------------------------------------------------------- Meetings

export async function createMeeting(fd: FormData) {
  await requireAdmin();
  const topic = str(fd, "topic");
  if (!topic) back("/admin/meetings", "יש להזין נושא", true);
  await db.meetingRequest.create({
    data: {
      topic,
      notes: optStr(fd, "notes"),
      neededBy: parseDateInput(fd.get("neededBy")),
      withTeamId: optInt(fd, "withTeamId"),
      requesterId: optInt(fd, "requesterId"),
    },
  });
  done("/admin/meetings", "הצורך בפגישה נרשם");
}

export async function setMeetingStatus(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  const status = oneOf(fd, "status", MeetingStatus);
  if (!id || !status) back("/admin/meetings", "נתונים חסרים", true);
  await db.meetingRequest.update({ where: { id }, data: { status } });
  done("/admin/meetings", "הסטטוס עודכן");
}

export async function deleteMeeting(fd: FormData) {
  await requireAdmin();
  const id = optInt(fd, "id");
  if (id) await db.meetingRequest.delete({ where: { id } });
  done("/admin/meetings", "נמחק");
}

// ---------------------------------------------------------------- Reports & settings

export async function saveSettings(fd: FormData) {
  await requireAdmin();
  const s = await getSettings();
  const managerEmail = str(fd, "managerEmail").toLowerCase();
  if (managerEmail && !isEmail(managerEmail)) back("/admin/reports", "כתובת המייל של המנהל לא תקינה", true);
  const reportEnabled = fd.get("reportEnabled") === "on";
  const reportDay = Math.min(6, Math.max(0, optInt(fd, "reportDay") ?? s.reportDay));
  const reportHour = Math.min(23, Math.max(0, optInt(fd, "reportHour") ?? s.reportHour));
  const scheduleChanged = reportEnabled !== s.reportEnabled || reportDay !== s.reportDay || reportHour !== s.reportHour;
  await db.settings.update({
    where: { id: 1 },
    data: {
      managerName: str(fd, "managerName") || s.managerName,
      managerEmail: managerEmail || null,
      notifyManager: fd.get("notifyManager") === "on",
      remindersEnabled: fd.get("remindersEnabled") === "on",
      reportEnabled,
      reportDay,
      reportHour,
      ...(scheduleChanged ? { scheduleUpdatedAt: new Date() } : {}),
    },
  });
  done("/admin/reports", "ההגדרות נשמרו");
}

export async function sendReportNow(fd: FormData) {
  await requireAdmin();
  const ids = fd.getAll("workerIds").map((v) => Number(v)).filter(Number.isFinite);
  if (str(fd, "scope") === "some" && !ids.length) back("/admin/reports", "לא נבחרו עובדים", true);
  const r = await sendReports({ workerIds: str(fd, "scope") === "some" ? ids : undefined, note: optStr(fd, "note") });
  if (r.failed) back("/admin/reports", `נשלחו ${r.sent} מתוך ${r.total} דוחות. ${r.failed} נכשלו – ראו יומן מיילים למטה.`, true);
  done("/admin/reports", `הדוח נשלח ל-${r.sent} עובדים`);
}

export async function sendTestEmail() {
  await requireAdmin();
  const s = await getSettings();
  if (!s.managerEmail) back("/admin/reports", "יש לשמור קודם כתובת מייל של המנהל", true);
  const e = managerNoticeEmail({
    subject: "מייל בדיקה ממערכת המשימות",
    lines: ["אם קיבלת את המייל הזה, שליחת המיילים עובדת."],
    url: appUrl("/admin"),
  });
  const ok = await sendEmail({ ...e, to: s.managerEmail, kind: "test" });
  if (!ok) back("/admin/reports", "שליחת מייל הבדיקה נכשלה – ראו את השגיאה ביומן המיילים", true);
  done("/admin/reports", `מייל בדיקה נשלח אל ${s.managerEmail}`);
}
