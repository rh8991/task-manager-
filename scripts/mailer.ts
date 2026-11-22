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
import { FieldValue, getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import nodemailer, { type Transporter } from "nodemailer";
import { addDays, todayLocal } from "../src/lib/dates";
import { dueReminderEmail, managerNoticeEmail, reportEmail, taskAssignedEmail } from "../src/lib/email-templates";
import { groupTasks, type ReportTask, type WorkerReport } from "../src/lib/report";
import { areRemindersDue, isWeeklyReportDue } from "../src/lib/schedule";
import { nextReview } from "../src/lib/reviews";
import { instructorWelcomeEmail, lessonAssignedEmail, lessonDecisionEmail, lessonSubmittedEmail, loginLinkEmail } from "../src/lib/lesson-emails";
import { LESSON_STATUS, WORKING_STATUSES, isLessonLate, withLessonDefaults } from "../src/lib/lessons";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Lesson, LessonFile, LessonSubmission } from "../src/lib/types";
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

if (process.argv.includes("--emulator")) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
  process.env.GCLOUD_PROJECT ||= "demo-task-manager";
  process.env.ADMIN_EMAILS ||= "manager@example.com";
}

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
// Instructors sign in with an email link; their page is #/me (the site asks them to sign in if needed).
const personalUrl = (_token?: string) => `${APP_URL}#/me`;
const dashboardUrl = (_token?: string) => `${APP_URL}#/lessons`;
/** A one-time sign-in link (Admin SDK: not limited like Firebase's own sign-in emails). */
const signInLink = (email: string) => getAuth(app).generateSignInWithEmailLink(email, { url: APP_URL, handleCodeInApp: true });
const adminUrl = (path: string) => `${APP_URL}#${path.startsWith("/") ? path : `/${path}`}`;

// ---------------------------------------------------------------- email

type Attachment = { filename: string; content: Buffer; contentType: string };
type Email = { to: string; subject: string; html: string; text: string; kind: string; attachments?: Attachment[] };

// EMAIL_OUT_DIR (testing): write each email as an .eml file instead of sending it.
const OUT_DIR = env.EMAIL_OUT_DIR || "";
let transporter: Transporter | null = null;
if (OUT_DIR) {
  mkdirSync(OUT_DIR, { recursive: true });
  transporter = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
} else if (env.SMTP_HOST) {
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
    const info = await transporter.sendMail({ from: FROM, to: e.to, subject: e.subject, html: e.html, text: e.text, attachments: e.attachments });
    if (OUT_DIR) {
      const file = path.join(OUT_DIR, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${e.kind}.eml`);
      writeFileSync(file, (info as unknown as { message: Buffer }).message);
      console.log(`[email:file] ${file}`);
      await log("LOGGED");
      return true;
    }
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
  lessons: WithId<Lesson>[]; // not archived / not active-only: still worked on or recently approved
};

/**
 * Loads what emails need: all workers, teams and projects (small), but only OPEN tasks plus
 * tasks finished since the last report, and only active equipment and meetings. Old, closed
 * items pile up over time and are never needed here.
 */
async function loadData(settings: Settings): Promise<Data> {
  const since = settings.lastReportAt ?? Date.now() - 7 * 864e5;
  const c = (name: string) => db.collection(name);
  const [workers, priv, openTasks, doneTasks, projects, teams, equipment, meetings, lessons] = await Promise.all([
    all<Worker>(c("workers")),
    all<WorkerPrivate>(c("workerPrivate")),
    all<Task>(c("tasks").where("status", "!=", "DONE")),
    all<Task>(c("tasks").where("completedAt", ">", since)),
    all<Project>(c("projects")),
    all<Team>(c("teams")),
    all<EquipmentRequest>(c("equipment").where("status", "in", ["PENDING", "APPROVED", "ORDERED"])),
    all<MeetingRequest>(c("meetings").where("status", "in", ["OPEN", "SCHEDULED"])),
    all<Lesson>(c("lessons").where("status", "in", [...WORKING_STATUSES, "APPROVED"])),
  ]);
  const tasks = [...new Map([...openTasks, ...doneTasks.filter((t) => t.status === "DONE")].map((t) => [t.id, t])).values()];
  const map = <T extends { id: string }>(l: T[]) => new Map(l.map((x) => [x.id, x]));
  return {
    settings,
    workers: map(workers),
    priv: map(priv),
    tasks,
    projects: map(projects),
    teams: map(teams),
    equipment,
    meetings,
    lessons: lessons.map((l) => withLessonDefaults(l)),
  };
}

const toReportTask = (d: Data, t: WithId<Task>): ReportTask => ({
  id: t.id,
  title: t.title,
  projectName: t.projectId ? (d.projects.get(t.projectId)?.name ?? null) : null,
  status: t.status,
  priority: t.priority,
  dueDate: t.dueDate,
  nextReview: t.status === "DONE" ? null : nextReview(t.reviews),
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
    // Equipment orders and meetings with other teams are the manager's, not in instructors' reports.
    equipment: [],
    meetings: [],
    lessons: d.lessons
      .filter((l) => l.ownerIds.includes(workerId) && WORKING_STATUSES.includes(l.status))
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
      .map((l) => ({ title: l.title, status: LESSON_STATUS[l.status], dueDate: l.dueDate, late: isLessonLate(l, todayLocal()) })),
  };
}

// ---------------------------------------------------------------- lessons

async function getDoc<T>(p: string): Promise<WithId<T> | null> {
  const snap = await db.doc(p).get();
  reads += 1;
  return snap.exists ? ({ id: snap.id, ...(snap.data() as T) }) : null;
}

/** Rebuilds an uploaded lesson file from its chunks. */
async function loadFile(fileId: string): Promise<{ meta: LessonFile; content: Buffer } | null> {
  const meta = await getDoc<LessonFile>(`lessonFiles/${fileId}`);
  if (!meta || meta.deleted) return null;
  const chunks = await db.collection(`lessonFiles/${fileId}/chunks`).orderBy("n").get();
  reads += Math.max(1, chunks.size);
  const content = Buffer.concat(chunks.docs.map((c) => Buffer.from(c.get("data") as Uint8Array)));
  if (content.length !== meta.size) throw new Error(`file ${fileId} is incomplete (${content.length}/${meta.size} bytes)`);
  return { meta, content };
}

/** Keeps the bytes of the 3 newest files of a lesson; older ones keep only their details. */
async function pruneLessonFiles(lessonId: string, keep = 3) {
  const files = await db.collection("lessonFiles").where("lessonId", "==", lessonId).get();
  reads += Math.max(1, files.size);
  const old = files.docs
    .filter((f) => !f.get("deleted"))
    .sort((a, b) => (b.get("createdAt") ?? 0) - (a.get("createdAt") ?? 0))
    .slice(keep);
  for (const f of old) {
    const chunks = await f.ref.collection("chunks").get();
    const batch = db.batch();
    chunks.docs.forEach((c) => batch.delete(c.ref));
    batch.update(f.ref, { deleted: true });
    await batch.commit();
    console.log(`pruned old file ${f.id} of lesson ${lessonId}`);
  }
}

const ownerNames = (d: Data, l: Lesson) => l.ownerIds.map((id) => d.workers.get(id)?.name).filter((n): n is string => !!n);

async function lessonSubmitted(d: Data, lessonId: string, submissionId: string): Promise<string> {
  const subRef = db.doc(`lessonSubmissions/${submissionId}`);
  const sub = await getDoc<LessonSubmission>(subRef.path);
  const raw = await getDoc<Lesson>(`lessons/${lessonId}`);
  if (!sub || !raw) return "skipped: lesson or submission not found";
  const lesson = withLessonDefaults(raw);
  const fail = async (why: string) => {
    await subRef.update({ emailStatus: "failed", emailError: why.slice(0, 300), emailAt: Date.now() });
    return `failed: ${why}`;
  };
  if (!d.settings.managerEmail) return fail("לא הוגדרה כתובת מייל של המנהל (דוחות והגדרות)");
  const file = sub.fileId ? await loadFile(sub.fileId) : null;
  if (sub.fileId && !file) return fail("הקובץ לא נמצא במערכת");
  const e = lessonSubmittedEmail({
    lesson,
    ownerNames: ownerNames(d, lesson),
    submittedBy: sub.submittedBy ? (d.workers.get(sub.submittedBy)?.name ?? "מדריך") : "המנהל",
    version: sub.version,
    fileName: file?.meta.name ?? null,
    note: sub.note,
    report: sub.report,
    today: todayLocal(),
    url: adminUrl(`/admin/lessons/${lessonId}`),
  });
  const ok = await sendEmail({
    ...e,
    to: d.settings.managerEmail,
    kind: "lesson-submitted",
    attachments: file ? [{ filename: file.meta.name, content: file.content, contentType: file.meta.mimeType }] : undefined,
  });
  if (!ok) return fail("שליחת המייל נכשלה – ראו יומן מיילים");
  await subRef.update({ emailStatus: "sent", emailError: null, emailAt: Date.now() });
  await pruneLessonFiles(lessonId);
  return "sent";
}

async function lessonDecision(d: Data, lessonId: string, submissionId: string): Promise<string> {
  const sub = await getDoc<LessonSubmission>(`lessonSubmissions/${submissionId}`);
  const raw = await getDoc<Lesson>(`lessons/${lessonId}`);
  if (!sub?.decision || !raw) return "skipped: no decision";
  const lesson = withLessonDefaults(raw);
  const emails = lesson.ownerIds
    .map((id) => recipient(d, id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({
      ...lessonDecisionEmail({
        workerName: r.worker.name,
        lesson,
        decision: sub.decision!,
        notes: sub.decisionNotes,
        version: sub.version,
        personalUrl: personalUrl(r.token),
      }),
      to: r.email,
      kind: "lesson-decision",
    }));
  const res = await sendMany(emails);
  return `decision: ${res.sent}/${res.total} sent`;
}

async function lessonAssigned(d: Data, lessonId: string, workerIds: string[]): Promise<string> {
  const raw = await getDoc<Lesson>(`lessons/${lessonId}`);
  if (!raw) return "skipped: lesson not found";
  const lesson = withLessonDefaults(raw);
  const emails = workerIds
    .map((id) => recipient(d, id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({
      ...lessonAssignedEmail({ workerName: r.worker.name, lesson, ownerNames: ownerNames(d, lesson), personalUrl: personalUrl(r.token) }),
      to: r.email,
      kind: "lesson-assigned",
    }));
  const res = await sendMany(emails);
  return `assigned: ${res.sent}/${res.total} sent`;
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
        task: { ...toReportTask(d, t), description: t.description, reviews: t.reviews },
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
    case "lesson-submitted":
      return lessonSubmitted(d, item.lessonId, item.submissionId);
    case "lesson-decision":
      return lessonDecision(d, item.lessonId, item.submissionId);
    case "instructor-welcome":
      return instructorWelcome(d, item.workerId);
    case "lesson-assigned":
      return lessonAssigned(d, item.lessonId, item.workerIds);
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
  // Tasks due tomorrow (once per task) and review dates tomorrow (once per review).
  const due = d.tasks.filter((t) => t.dueDate === tomorrow && t.status !== "DONE" && !t.reminderSentAt && recipient(d, t.assigneeId));
  const reviews = d.tasks.flatMap((t) =>
    t.status === "DONE" || !recipient(d, t.assigneeId)
      ? []
      : (t.reviews ?? [])
          .filter((r) => r.date === tomorrow && !r.done && !(t.remindedReviewIds ?? []).includes(r.id))
          .map((r) => ({ t, r })),
  );
  const byWorker = new Map<string, { tasks: WithId<Task>[]; reviews: { taskTitle: string; date: string; note: string | null }[] }>();
  const slot = (wid: string) => byWorker.get(wid) ?? byWorker.set(wid, { tasks: [], reviews: [] }).get(wid)!;
  for (const t of due) slot(t.assigneeId!).tasks.push(t);
  for (const { t, r } of reviews) slot(t.assigneeId!).reviews.push({ taskTitle: t.title, date: r.date, note: r.note });

  // Lessons: the final deadline and review dates tomorrow, to every instructor of the lesson.
  const lessonsDue = d.lessons.filter((l) => WORKING_STATUSES.includes(l.status) && l.dueDate === tomorrow && !l.reminderSentAt);
  const lessonReviews = d.lessons.flatMap((l) =>
    WORKING_STATUSES.includes(l.status)
      ? (l.reviews ?? []).filter((r) => r.date === tomorrow && !r.done && !(l.remindedReviewIds ?? []).includes(r.id)).map((r) => ({ l, r }))
      : [],
  );
  for (const l of lessonsDue) {
    for (const wid of l.ownerIds) if (recipient(d, wid)) slot(wid).reviews.push({ taskTitle: `מערך "${l.title}"`, date: tomorrow, note: "תאריך היעד הסופי" });
  }
  for (const { l, r } of lessonReviews) {
    for (const wid of l.ownerIds) if (recipient(d, wid)) slot(wid).reviews.push({ taskTitle: `מערך "${l.title}"`, date: r.date, note: r.note });
  }

  const emails = [...byWorker.entries()].map(([wid, x]) => {
    const rc = recipient(d, wid)!;
    const e = dueReminderEmail({
      workerName: rc.worker.name,
      tasks: x.tasks.map((t) => toReportTask(d, t)),
      reviews: x.reviews,
      personalUrl: personalUrl(rc.token),
    });
    return { ...e, to: rc.email, kind: "due-reminder" };
  });
  const result = await sendMany(emails);
  const batch = db.batch();
  due.forEach((t) => batch.update(db.doc(`tasks/${t.id}`), { reminderSentAt: now.getTime() }));
  reviews.forEach(({ t, r }) => batch.update(db.doc(`tasks/${t.id}`), { remindedReviewIds: FieldValue.arrayUnion(r.id) }));
  lessonsDue.forEach((l) => batch.update(db.doc(`lessons/${l.id}`), { reminderSentAt: now.getTime() }));
  lessonReviews.forEach(({ l, r }) => batch.update(db.doc(`lessons/${l.id}`), { remindedReviewIds: FieldValue.arrayUnion(r.id) }));
  await batch.commit();
  console.log(`reminders: ${result.sent}/${result.total} sent`);
}

// ---------------------------------------------------------------- main

async function instructorWelcome(d: Data, workerId: string): Promise<string> {
  const r = recipient(d, workerId);
  if (!r) return "skipped: instructor not active";
  const e = instructorWelcomeEmail({ workerName: r.worker.name, loginUrl: await signInLink(r.email), managerName: d.settings.managerName });
  return (await sendEmail({ ...e, to: r.email, kind: "instructor-welcome" })) ? "sent" : "failed";
}

/**
 * "Send me a sign-in link" requests left by the site when Firebase's daily email quota was used up.
 * Only for active instructors and the managers (ADMIN_EMAILS); at most one email per 10 minutes each.
 */
async function processLoginRequests() {
  const snap = await db.collection("loginRequests").get();
  reads += Math.max(1, snap.size);
  if (snap.empty) return;
  const admins = (env.ADMIN_EMAILS ?? "").split(/[,;s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  for (const req of snap.docs) {
    const email = String(req.get("email") ?? req.id).toLowerCase();
    await req.ref.delete();
    const member = await db.doc(`members/${email}`).get();
    reads += 1;
    if (!admins.includes(email) && !member.get("active")) continue;
    const last = await db.collection("emailLog").where("to", "==", email).where("kind", "==", "login-link").orderBy("createdAt", "desc").limit(1).get();
    if (!last.empty && Date.now() - (last.docs[0].get("createdAt") ?? 0) < 10 * 60_000) continue;
    const e = loginLinkEmail({ loginUrl: await signInLink(email) });
    await sendEmail({ ...e, to: email, kind: "login-link" });
  }
}

async function main() {
  const now = new Date();
  await syncAdmins();
  await processLoginRequests();

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
