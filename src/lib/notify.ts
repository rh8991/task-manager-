import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { addDays, todayLocal } from "./dates";
import { appUrl, sendEmail, sendMany, type Email } from "./email";
import { dueReminderEmail, managerNoticeEmail, reportEmail, taskAssignedEmail } from "./email-templates";
import { groupTasks, type ReportTask, type WorkerReport } from "./report";

export async function getSettings() {
  return db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export const personalUrl = (token: string) => appUrl(`/w/${token}`);
export const dashboardUrl = (token?: string) => appUrl(token ? `/?w=${token}` : "/");

const taskInclude = { project: { select: { name: true } } } satisfies Prisma.TaskInclude;
type TaskWithProject = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

function toReportTask(t: TaskWithProject): ReportTask {
  return { id: t.id, title: t.title, projectName: t.project?.name ?? null, status: t.status, priority: t.priority, dueDate: t.dueDate };
}

/** Email the assignee that they got a task. */
export async function notifyTaskAssigned(taskId: number, reassigned = false): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId }, include: { ...taskInclude, assignee: true } });
  if (!task?.assignee || !task.assignee.active) return;
  const e = taskAssignedEmail({
    workerName: task.assignee.name,
    task: { ...toReportTask(task), description: task.description },
    personalUrl: personalUrl(task.assignee.token),
    reassigned,
  });
  await sendEmail({ ...e, to: task.assignee.email, kind: "task-assigned" });
}

/** Email the manager about something a worker did (if enabled in settings). */
export async function notifyManager(subject: string, lines: string[], path = "/admin"): Promise<void> {
  const s = await getSettings();
  if (!s.notifyManager || !s.managerEmail) return;
  const e = managerNoticeEmail({ subject, lines, url: appUrl(path) });
  await sendEmail({ ...e, to: s.managerEmail, kind: "manager-notice" });
}

async function buildWorkerReport(workerId: number, since: Date): Promise<WorkerReport | null> {
  const w = await db.worker.findUnique({
    where: { id: workerId },
    include: {
      tasks: { where: { status: { not: "DONE" } }, include: taskInclude },
      equipment: { where: { status: { in: ["PENDING", "APPROVED", "ORDERED"] } }, orderBy: { createdAt: "desc" } },
      meetings: { where: { status: { in: ["OPEN", "SCHEDULED"] } }, include: { withTeam: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!w) return null;
  const doneSinceLastReport = await db.task.count({ where: { assigneeId: w.id, status: "DONE", completedAt: { gt: since } } });
  return {
    workerName: w.name,
    tasks: groupTasks(w.tasks.map(toReportTask), todayLocal()),
    doneSinceLastReport,
    equipment: w.equipment.map((e) => ({ item: e.item, quantity: e.quantity, status: e.status })),
    meetings: w.meetings.map((m) => ({ topic: m.topic, withTeam: m.withTeam?.name ?? null, status: m.status })),
  };
}

/**
 * Sends each (selected) active worker their personal report and records the send time.
 * Used by the manager's "send now" button and by the weekly schedule.
 */
export async function sendReports(opts: { workerIds?: number[]; note?: string | null; since?: Date | null } = {}) {
  const s = await getSettings();
  const lastReport = opts.since !== undefined ? opts.since : s.lastReportAt;
  const since = lastReport ?? new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const workers = await db.worker.findMany({
    where: { active: true, ...(opts.workerIds?.length ? { id: { in: opts.workerIds } } : {}) },
    orderBy: { name: "asc" },
  });

  const emails: Email[] = [];
  for (const w of workers) {
    const report = await buildWorkerReport(w.id, since);
    if (!report) continue;
    const e = reportEmail({
      report,
      personalUrl: personalUrl(w.token),
      dashboardUrl: dashboardUrl(w.token),
      managerNote: opts.note,
      managerName: s.managerName,
    });
    emails.push({ ...e, to: w.email, kind: "report" });
  }

  const result = await sendMany(emails);
  await db.settings.update({ where: { id: 1 }, data: { lastReportAt: new Date() } });
  return { ...result, total: emails.length };
}

/** Emails each worker about their open tasks that are due tomorrow (once per task). */
export async function sendDueReminders(now = new Date()) {
  const tomorrow = new Date(`${addDays(todayLocal(now), 1)}T00:00:00Z`);
  const tasks = await db.task.findMany({
    where: { dueDate: tomorrow, status: { not: "DONE" }, reminderSentAt: null, assignee: { active: true } },
    include: { ...taskInclude, assignee: true },
  });

  const byWorker = new Map<number, TaskWithProject[]>();
  for (const t of tasks) {
    if (!t.assigneeId) continue;
    byWorker.set(t.assigneeId, [...(byWorker.get(t.assigneeId) ?? []), t]);
  }

  const emails: Email[] = [];
  for (const list of byWorker.values()) {
    const w = (list[0] as (typeof tasks)[number]).assignee!;
    const e = dueReminderEmail({ workerName: w.name, tasks: list.map(toReportTask), personalUrl: personalUrl(w.token) });
    emails.push({ ...e, to: w.email, kind: "due-reminder" });
  }

  const result = await sendMany(emails);
  if (tasks.length) {
    await db.task.updateMany({ where: { id: { in: tasks.map((t) => t.id) } }, data: { reminderSentAt: now } });
  }
  await db.settings.update({ where: { id: 1 }, data: { lastReminderDate: todayLocal(now) } });
  return result;
}
