/**
 * Mailer job: run by GitHub Actions every 10 minutes (.github/workflows/mailer.yml).
 * There is no server in this setup, so this job does everything that needs a secret:
 *
 *  1. Syncs admins/{uid} from the ADMIN_EMAILS secret (who may use the manager panel).
 *  2. Sends emails queued in outbox/ by the app (new task, manager notices, reports, test).
 *  3. Sends the weekly report when it's due.
 *  4. Sends "due tomorrow" reminders once a day.
 *
 * Safe to run any number of times: each outbox item, weekly slot and reminder day is claimed in a
 * transaction first, so nothing is sent twice.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (JSON), APP_URL, ADMIN_EMAILS, SMTP_HOST/PORT/USER/PASS, EMAIL_FROM.
 * Against the emulator: FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST, GCLOUD_PROJECT.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import nodemailer, { type Transporter } from "nodemailer";
import { addDays, todayLocal } from "../src/lib/dates";
import { dueReminderEmail, managerNoticeEmail, reportEmail, taskAssignedEmail } from "../src/lib/email-templates";
import { groupTasks, type ReportTask, type WorkerReport } from "../src/lib/report";
import { areRemindersDue, isWeeklyReportDue } from "../src/lib/schedule";
import {
  DEFAULT_SETTINGS,
  type EquipmentRequest,
  type MeetingRequest,
  type OutboxDoc,
  type Project,
  type Settings,
  type Task,
  type Team,
  type WithId,
  type Worker,
  type WorkerPrivate,
} from "../src/lib/types";

// ---------------------------------------------------------------- setup

const env = process.env;
const projectId = env.GCLOUD_PROJECT || env.FIREBASE_PROJECT_ID;
const serviceAccount = env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) : null;
if (!serviceAccount && !env.FIRESTORE_EMULATOR_HOST) {
  console.log("FIREBASE_SERVICE_ACCOUNT is not set yet - nothing to do. See docs/SETUP.md.");
  process.exit(0);
}
const app = initializeApp(serviceAccount ? { credential: cert(serviceAccount) } : { projectId });
const db: Firestore = getFirestore(app);

const APP_URL = (env.APP_URL || "http://localhost:5173/").replace(/\/?$/, "/");
const personalUrl = (token: string) => `${APP_URL}#/w/${token}`;
const dashboardUrl = (token: string) => `${APP_URL}#/?w=${token}`;
const adminUrl = (path: string) => `${APP_URL}#${path.startsWith("/") ? path : `/${path}`}`;

// ---------------------------------------------------------------- email

type Email = { to: string; subject: string; html: string; text: string; kind: string };

let transporter: Transporter | null = null;
if (env.SMTP_HOST) {
  const port = Number(env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    pool: true,
    maxConnections: 3,
  });
}
const FROM = env.EMAIL_FROM || env.SMTP_USER || "tasks@example.com";

async function sendEmail(e: Email): Promise<boolean> {
  const log = (status: "SENT" | "FAILED" | "LOGGED", error: string | null = null) =>
    db.collection("emailLog").add({ to: e.to, subject: e.subject, kind: e.kind, status, error, createdAt: Date.now() });
  if (!transporter) {
    console.log(`[email:not-sent] to=${e.to} subject="${e.subject}"`);
    await log("LOGGED");
    return true;
  }
  try {
    await transporter.sendMail({ from: FROM, to: e.to, subject: e.subject, html: e.html, text: e.text });
    await log("SENT");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email:failed] ${e.kind}: ${msg}`);
    await log("FAILED", msg.slice(0, 500));
    return false;
  }
}

async function sendMany(emails: Email[]) {
  let sent = 0;
  for (let i = 0; i < emails.length; i += 3) {
    sent += (await Promise.all(emails.slice(i, i + 3).map(sendEmail))).filter(Boolean).length;
  }
  return { sent, failed: emails.length - sent, total: emails.length };
}

// ---------------------------------------------------------------- data

/** Documents read this run (Firestore's free plan allows 50,000 reads a day). */
let reads = 0;

async function all<T>(q: FirebaseFirestore.Query): Promise<WithId<T>[]> {
  const snap = await q.get();
  reads += Math.max(1, snap.size); // an empty query still counts as one read
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}

async function loadSettings(): Promise<Settings> {
  const snap = await db.doc("settings/main").get();
  reads += 1;
  return { ...DEFAULT_SETTINGS, ...((snap.data() as Partial<Settings>) ?? {}) };
}

type Data = {
  settings: Settings;
  workers: Map<string, WithId<Worker>>;
  priv: Map<string, WithId<WorkerPrivate>>;
  tasks: WithId<Task>[];
  projects: Map<string, WithId<Project>>;
  teams: Map<string, WithId<Team>>;
  equipment: WithId<EquipmentRequest>[];
  meetings: WithId<MeetingRequest>[];
};

/**
 * Loads what emails need: all workers, teams and projects (small), but only OPEN tasks plus
 * tasks finished since the last report, and only active equipment and meetings. Old, closed
 * items pile up over time and are never needed here.
 */
async function loadData(settings: Settings): Promise<Data> {
  const since = settings.lastReportAt ?? Date.now() - 7 * 864e5;
  const c = (name: string) => db.collection(name);
  const [workers, priv, openTasks, doneTasks, projects, teams, equipment, meetings] = await Promise.all([
    all<Worker>(c("workers")),
    all<WorkerPrivate>(c("workerPrivate")),
    all<Task>(c("tasks").where("status", "!=", "DONE")),
    all<Task>(c("tasks").where("completedAt", ">", since)),
    all<Project>(c("projects")),
    all<Team>(c("teams")),
    all<EquipmentRequest>(c("equipment").where("status", "in", ["PENDING", "APPROVED", "ORDERED"])),
    all<MeetingRequest>(c("meetings").where("status", "in", ["OPEN", "SCHEDULED"])),
  ]);
  const tasks = [...new Map([...openTasks, ...doneTasks.filter((t) => t.status === "DONE")].map((t) => [t.id, t])).values()];
  const map = <T extends { id: string }>(l: T[]) => new Map(l.map((x) => [x.id, x]));
  return { settings, workers: map(workers), priv: map(priv), tasks, projects: map(projects), teams: map(teams), equipment, meetings };
}

const toReportTask = (d: Data, t: WithId<Task>): ReportTask => ({
  id: t.id,
  title: t.title,
  projectName: t.projectId ? (d.projects.get(t.projectId)?.name ?? null) : null,
  status: t.status,
  priority: t.priority,
  dueDate: t.dueDate,
});

/** Active worker with an email address, or null. */
function recipient(d: Data, workerId: string | null) {
  if (!workerId) return null;
  const w = d.workers.get(workerId);
  const p = d.priv.get(workerId);
  return w?.active && p?.email ? { worker: w, email: p.email, token: p.token } : null;
}

// ---------------------------------------------------------------- jobs

async function syncAdmins() {
  const emails = (env.ADMIN_EMAILS ?? "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return console.log("ADMIN_EMAILS is empty - admins left unchanged.");
  const auth = getAuth(app);
  const wanted = new Map<string, string>();
  for (const email of emails) {
    try {
      wanted.set((await auth.getUserByEmail(email)).uid, email);
    } catch {
      console.log(`No Firebase Auth user for ${email} yet - create it in Authentication > Users.`);
    }
  }
  const current = await db.collection("admins").get();
  reads += Math.max(1, current.size);
  const batch = db.batch();
  current.docs.forEach((doc) => !wanted.has(doc.id) && batch.delete(doc.ref));
  wanted.forEach((email, uid) => batch.set(db.doc(`admins/${uid}`), { email }));
  await batch.commit();
  console.log(`Admins: ${wanted.size}`);
}

function buildReport(d: Data, workerId: string, since: number): WorkerReport {
  const mine = d.tasks.filter((t) => t.assigneeId === workerId);
  return {
    workerName: d.workers.get(workerId)!.name,
    tasks: groupTasks(mine.filter((t) => t.status !== "DONE").map((t) => toReportTask(d, t)), todayLocal()),
    doneSinceLastReport: mine.filter((t) => t.status === "DONE" && (t.completedAt ?? 0) > since).length,
    equipment: d.equipment
      .filter((e) => e.requesterId === workerId && ["PENDING", "APPROVED", "ORDERED"].includes(e.status))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((e) => ({ item: e.item, quantity: e.quantity, status: e.status })),
    meetings: d.meetings
      .filter((m) => m.requesterId === workerId && ["OPEN", "SCHEDULED"].includes(m.status))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((m) => ({ topic: m.topic, withTeam: m.withTeamId ? (d.teams.get(m.withTeamId)?.name ?? null) : null, status: m.status })),
  };
}

async function sendReports(d: Data, workerIds: string[] | null, note: string | null, since: number | null) {
  const from = since ?? Date.now() - 7 * 864e5;
  const ids = (workerIds ?? [...d.workers.keys()]).filter((id) => recipient(d, id));
  ids.sort((a, b) => d.workers.get(a)!.name.localeCompare(d.workers.get(b)!.name, "he"));
  const emails = ids.map((id) => {
    const r = recipient(d, id)!;
    const e = reportEmail({
      report: buildReport(d, id, from),
      personalUrl: personalUrl(r.token),
      dashboardUrl: dashboardUrl(r.token),
      managerNote: note,
      managerName: d.settings.managerName,
    });
    return { ...e, to: r.email, kind: "report" };
  });
  const result = await sendMany(emails);
  await db.doc("settings/main").set({ lastReportAt: Date.now() }, { merge: true });
  return result;
}

async function handle(d: Data, item: OutboxDoc): Promise<string> {
  switch (item.type) {
    case "task-assigned": {
      const t = d.tasks.find((x) => x.id === item.taskId);
      const r = recipient(d, t?.assigneeId ?? null);
      if (!t || !r) return "skipped: task or active assignee not found";
      const e = taskAssignedEmail({
        workerName: r.worker.name,
        task: { ...toReportTask(d, t), description: t.description },
        personalUrl: personalUrl(r.token),
        reassigned: item.reassigned,
      });
      return (await sendEmail({ ...e, to: r.email, kind: "task-assigned" })) ? "sent" : "failed";
    }
    case "manager-notice": {
      if (!d.settings.notifyManager || !d.settings.managerEmail) return "skipped: manager notices are off";
      const e = managerNoticeEmail({ subject: item.subject, lines: item.lines, url: adminUrl(item.path) });
      return (await sendEmail({ ...e, to: d.settings.managerEmail, kind: "manager-notice" })) ? "sent" : "failed";
    }
    case "report": {
      const r = await sendReports(d, item.workerIds, item.note, d.settings.lastReportAt);
      return `report: ${r.sent}/${r.total} sent`;
    }
    case "test": {
      if (!d.settings.managerEmail) return "skipped: no manager email";
      const e = managerNoticeEmail({
        subject: "מייל בדיקה ממערכת המשימות",
        lines: ["אם קיבלת את המייל הזה, שליחת המיילים עובדת."],
        url: adminUrl("/admin"),
      });
      return (await sendEmail({ ...e, to: d.settings.managerEmail, kind: "test" })) ? "sent" : "failed";
    }
  }
}

/** Moves an outbox doc from pending to sending; false if another run already took it. */
async function claim(ref: DocumentReference): Promise<OutboxDoc | null> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const item = snap.data() as OutboxDoc | undefined;
    if (!item || item.status !== "pending") return null;
    tx.update(ref, { status: "sending", processedAt: Date.now() });
    return item;
  });
}

async function processOutbox(d: Data, pending: FirebaseFirestore.QuerySnapshot) {
  const docs = [...pending.docs].sort((a, b) => (a.get("createdAt") ?? 0) - (b.get("createdAt") ?? 0));
  for (const doc of docs) {
    const item = await claim(doc.ref);
    if (!item) continue;
    let result: string;
    try {
      result = await handle(d, item);
    } catch (err) {
      result = `failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    await doc.ref.update({ status: result.startsWith("failed") ? "failed" : "sent", result: result.slice(0, 500), processedAt: Date.now() });
    console.log(`outbox ${item.type}: ${result}`);
    if (item.type === "report") d.settings = await loadSettings();
  }
}

/** Items stuck in "sending" (a run that crashed) are marked failed rather than risk a double send. */
async function failStuck() {
  const stuck = await db.collection("outbox").where("status", "==", "sending").get();
  reads += Math.max(1, stuck.size);
  for (const s of stuck.docs) {
    if (Date.now() - (s.get("processedAt") ?? 0) > 30 * 60_000) await s.ref.update({ status: "failed", result: "interrupted" });
  }
}

async function weeklyReport(d: Data, now: Date) {
  const s = d.settings;
  const due = isWeeklyReportDue(
    {
      reportEnabled: s.reportEnabled,
      reportDay: s.reportDay,
      reportHour: s.reportHour,
      scheduleUpdatedAt: new Date(s.scheduleUpdatedAt),
      lastReportAt: s.lastReportAt ? new Date(s.lastReportAt) : null,
    },
    now,
  );
  if (!due) return;
  const ref = db.doc("settings/main");
  const claimed = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as Partial<Settings> | undefined;
    if ((cur?.lastReportAt ?? null) !== s.lastReportAt) return false;
    tx.set(ref, { lastReportAt: now.getTime() }, { merge: true });
    return true;
  });
  if (!claimed) return;
  const r = await sendReports(d, null, null, s.lastReportAt);
  console.log(`weekly report: ${r.sent}/${r.total} sent`);
}

async function dueReminders(d: Data, now: Date) {
  const s = d.settings;
  if (!areRemindersDue(s, now)) return;
  const ref = db.doc("settings/main");
  const today = todayLocal(now);
  const claimed = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as Partial<Settings> | undefined;
    if ((cur?.lastReminderDate ?? null) !== s.lastReminderDate) return false;
    tx.set(ref, { lastReminderDate: today }, { merge: true });
    return true;
  });
  if (!claimed) return;

  const tomorrow = addDays(today, 1);
  const due = d.tasks.filter((t) => t.dueDate === tomorrow && t.status !== "DONE" && !t.reminderSentAt && recipient(d, t.assigneeId));
  const byWorker = new Map<string, WithId<Task>[]>();
  for (const t of due) byWorker.set(t.assigneeId!, [...(byWorker.get(t.assigneeId!) ?? []), t]);
  const emails = [...byWorker.entries()].map(([wid, list]) => {
    const r = recipient(d, wid)!;
    const e = dueReminderEmail({ workerName: r.worker.name, tasks: list.map((t) => toReportTask(d, t)), personalUrl: personalUrl(r.token) });
    return { ...e, to: r.email, kind: "due-reminder" };
  });
  const result = await sendMany(emails);
  const batch = db.batch();
  due.forEach((t) => batch.update(db.doc(`tasks/${t.id}`), { reminderSentAt: now.getTime() }));
  await batch.commit();
  console.log(`reminders: ${result.sent}/${result.total} sent`);
}

// ---------------------------------------------------------------- main

async function main() {
  const now = new Date();
  await syncAdmins();

  // Cheap checks first: most runs have nothing to do and should cost only a few reads.
  const settings = await loadSettings();
  const pending = await db.collection("outbox").where("status", "==", "pending").get();
  reads += Math.max(1, pending.size);
  const weeklyDue = isWeeklyReportDue(
    {
      reportEnabled: settings.reportEnabled,
      reportDay: settings.reportDay,
      reportHour: settings.reportHour,
      scheduleUpdatedAt: new Date(settings.scheduleUpdatedAt),
      lastReportAt: settings.lastReportAt ? new Date(settings.lastReportAt) : null,
    },
    now,
  );
  const remindersDue = areRemindersDue(settings, now);
  await failStuck();

  if (pending.empty && !weeklyDue && !remindersDue) {
    console.log(`nothing to do (${reads} reads)`);
    return;
  }

  const d = await loadData(settings);
  if (!pending.empty) await processOutbox(d, pending);
  if (weeklyDue) await weeklyReport(d, now);
  if (remindersDue) await dueReminders(d, now);
  console.log(`done (${reads} reads)`);
}

main()
  .then(() => transporter?.close())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
