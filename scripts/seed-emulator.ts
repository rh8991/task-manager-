/**
 * Demo data for LOCAL development against the Firebase emulators only:
 *   npm run emulators            (in one terminal)
 *   npm run seed                 (in another)
 * Refuses to run against a real project.
 */
import { randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { addDays, todayLocal } from "../src/lib/dates";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST - this script only seeds the emulators.");
  process.exit(1);
}

const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-task-manager" });
const db = getFirestore(app);
const auth = getAuth(app);
const token = () => randomBytes(18).toString("base64url");
const day = (n: number) => addDays(todayLocal(), n);
const now = Date.now();

async function main() {
  const manager = await auth.getUserByEmail("manager@example.com").catch(() =>
    auth.createUser({ email: "manager@example.com", password: "manager123", displayName: "המנהל" }),
  );

  const teamIds: Record<string, string> = {};
  for (const name of ["פיתוח", "תפעול", "רכש", "שיווק"]) {
    teamIds[name] = (await db.collection("teams").add({ name, createdAt: now })).id;
  }

  // 30 workers across 4 teams (the size of the real team).
  const first = ["דנה", "יוסי", "מיכל", "אבי", "נועה", "עומר", "שירה", "איתי", "טל", "רוני", "ליאור", "גל", "מאיה", "עידו", "הילה",
    "אורי", "יעל", "נדב", "תמר", "אלון", "רותם", "שי", "ענבל", "דור", "נוי", "אסף", "קרן", "בן", "ליה", "עמית"];
  const last = ["כהן", "לוי", "אברהם", "מזרחי", "פרץ", "ביטון", "דהן", "אזולאי", "פרידמן", "שפירא"];
  const teamNames = Object.keys(teamIds);
  const people: [string, string, string][] = first.map((f, i) => [`${f} ${last[i % last.length]}`, `worker${i + 1}@example.com`, teamNames[i % teamNames.length]]);
  people[0][1] = "dana@example.com"; // used by the browser test
  const w: Record<string, string> = {};
  const ids: string[] = [];
  for (const [name, email, team] of people) {
    const ref = db.collection("workers").doc();
    const t = token();
    await ref.set({ name, teamId: teamIds[team], active: true, createdAt: now });
    await db.doc(`workerPrivate/${ref.id}`).set({ email, token: t });
    await db.doc(`workerLinks/${t}`).set({ workerId: ref.id });
    w[name] = ref.id;
    ids.push(ref.id);
  }
  console.log(`${ids.length} workers. First worker (${people[0][0]}): #/w/${(await db.doc(`workerPrivate/${ids[0]}`).get()).get("token")}`);

  const site = (await db.collection("projects").add({ name: "אתר חדש", description: "השקת אתר החברה החדש", dueDate: day(30), active: true, createdAt: now })).id;
  const office = (await db.collection("projects").add({ name: "מעבר משרד", description: "מעבר לקומה 3", dueDate: day(45), active: true, createdAt: now })).id;

  const base = { description: null, completedAt: null, lastComment: null, lastProofId: null, reminderSentAt: null, createdAt: now, updatedAt: now };
  const tasks = [
    { title: "עיצוב דף הבית", assigneeId: ids[0], projectId: site, status: "IN_PROGRESS", priority: "HIGH", dueDate: day(2) },
    { title: "חיבור טופס צור קשר", assigneeId: ids[1], projectId: site, status: "TODO", priority: "MEDIUM", dueDate: day(1) },
    { title: "בדיקות נגישות", assigneeId: ids[1], projectId: site, status: "TODO", priority: "LOW", dueDate: day(12) },
    { title: "תיקון באג בהתחברות", assigneeId: ids[0], projectId: null, status: "BLOCKED", priority: "URGENT", dueDate: day(-2) },
    { title: "תכנון חלוקת עמדות", assigneeId: ids[2], projectId: office, status: "IN_PROGRESS", priority: "MEDIUM", dueDate: day(5) },
    { title: "תיאום חברת הובלה", assigneeId: ids[3], projectId: office, status: "TODO", priority: "HIGH", dueDate: day(-1) },
    { title: "קמפיין השקה", assigneeId: ids[4], projectId: site, status: "TODO", priority: "MEDIUM", dueDate: day(20) },
    { title: "הצעות מחיר לריהוט", assigneeId: ids[5], projectId: office, status: "IN_PROGRESS", priority: "MEDIUM", dueDate: null },
    { title: "עדכון נהלי עבודה", assigneeId: null, projectId: null, status: "TODO", priority: "MEDIUM", dueDate: null },
    { title: "הגדרת דומיין", assigneeId: ids[1], projectId: site, status: "DONE", priority: "MEDIUM", dueDate: null, completedAt: now },
  ];
  // ~3 more tasks per worker: a mix of statuses and due dates (some overdue, some done).
  const kinds = ["הכנת דוח חודשי", "בדיקת ציוד", "עדכון מסמכים", "פגישת לקוח", "סידור מחסן", "הדרכת עובד חדש"];
  const statuses = ["TODO", "IN_PROGRESS", "TODO", "BLOCKED", "DONE", "IN_PROGRESS"] as const;
  ids.forEach((id, i) => {
    for (let k = 0; k < 3; k++) {
      const n = i * 3 + k;
      const status = statuses[n % statuses.length];
      tasks.push({
        title: `${kinds[n % kinds.length]} #${n + 1}`,
        assigneeId: id,
        projectId: n % 3 === 0 ? site : n % 3 === 1 ? office : null,
        status,
        priority: (["LOW", "MEDIUM", "HIGH", "URGENT"] as const)[n % 4],
        dueDate: n % 5 === 4 ? null : day((n % 9) - 3),
        ...(status === "DONE" ? { completedAt: now - (n % 10) * 864e5 } : {}),
      } as (typeof tasks)[number]);
    }
  });
  const batch = db.batch();
  for (const t of tasks) batch.set(db.collection("tasks").doc(), { ...base, ...t });
  await batch.commit();
  console.log(`${tasks.length} tasks`);

  const eq = { link: null, notes: null, neededBy: null, managerNote: null, projectId: null, proofId: null, approvedAt: null, orderedAt: null, receivedAt: null, createdAt: now, updatedAt: now, estCost: null };
  const items = [
    { item: "מסך 27 אינץ'", quantity: 2, estCost: 1400, requesterId: ids[0], projectId: site, status: "PENDING", notes: "לעמדת העיצוב" },
    { item: "מקלדת ועכבר אלחוטיים", quantity: 1, estCost: 250, requesterId: ids[1], status: "APPROVED", approvedAt: now, neededBy: day(7) },
    { item: "ארגזי מעבר", quantity: 40, estCost: 600, requesterId: ids[3], projectId: office, status: "APPROVED", approvedAt: now, neededBy: day(10) },
    { item: "מדפסת לייזר", quantity: 1, estCost: 1200, requesterId: ids[2], projectId: office, status: "ORDERED", orderedAt: now },
  ];
  for (const e of items) await db.collection("equipment").add({ ...eq, ...e });

  const mt = { notes: null, neededBy: null, proofId: null, createdAt: now, updatedAt: now, status: "OPEN" };
  await db.collection("meetings").add({ ...mt, topic: "תיאום תוכן לאתר", requesterId: ids[0], withTeamId: teamIds["שיווק"], neededBy: day(4) });
  await db.collection("meetings").add({ ...mt, topic: "תקציב ריהוט", requesterId: ids[2], withTeamId: teamIds["רכש"], status: "SCHEDULED" });

  await db.doc("settings/main").set({ managerName: "המנהל", managerEmail: "manager@example.com", notifyManager: true, remindersEnabled: true }, { merge: true });

  console.log(`\nManager login: manager@example.com / manager123 (uid ${manager.uid})`);
  console.log("Run the mailer with ADMIN_EMAILS=manager@example.com to grant manager access.");
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
