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

if (process.argv.includes("--emulator")) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
  process.env.GCLOUD_PROJECT ||= "demo-task-manager";
  process.env.ADMIN_EMAILS ||= "manager@example.com";
}

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
  // Departments of the science program (+ operations).
  for (const name of ["מדריכים", "מעבדה", "אחזקה", "תפעול"]) {
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

  const base = { reviews: [] as object[], remindedReviewIds: [] as string[], description: null, completedAt: null, lastComment: null, lastProofId: null, reminderSentAt: null, createdAt: now, updatedAt: now };
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
  // Review dates on the way to the due date: on the first task, plus every 4th task with a due date.
  const rv = (id: string, date: string, note: string, done = false) => ({ id, date, note, done, doneAt: done ? now : null });
  const withReviews = tasks.map((t, n) => {
    if (n === 0) return { ...t, dueDate: day(10), reviews: [rv("r1", day(-1), "סקיצות ראשונות", true), rv("r2", day(1), "טיוטה לבדיקת מנהל"), rv("r3", day(6), "גרסה סופית לאישור")] };
    if (t.dueDate && n % 4 === 0 && t.status !== "DONE") return { ...t, reviews: [rv(`r${n}`, addDays(t.dueDate, -2), "בדיקת התקדמות")] };
    return t;
  });
  const batch = db.batch();
  for (const t of withReviews) batch.set(db.collection("tasks").doc(), { ...base, ...t });
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
  await db.collection("meetings").add({ ...mt, topic: "תיאום ציוד למערכים חדשים", requesterId: ids[0], withTeamId: teamIds["מעבדה"], neededBy: day(4) });
  await db.collection("meetings").add({ ...mt, topic: "תקציב ציוד מעבדה", requesterId: ids[2], withTeamId: teamIds["תפעול"], status: "SCHEDULED" });

  // ---------------------------------------------------------------- lessons (מערכים)
  let n = 0;
  const it = (name: string, quantity: string, over: Record<string, unknown> = {}) => ({
    id: `i${++n}`, name, quantity, for: "INSTRUCTOR", food: false, allergens: [] as string[], allergenOther: null,
    noKnownAllergens: false, hazards: [] as string[], toOrder: false, notes: null, ...over,
  });
  const act = (kind: string, title: string) => ({ id: `a${++n}`, kind, title });
  const lrv = (date: string, note: string, done = false) => ({ id: `r${++n}`, date, note, done, doneAt: done ? now : null });
  const lessonBase = {
    location: "PARK_LAB", durationMin: 90, goals: null, summary: null, startDate: day(-20), reviews: [] as object[], remindedReviewIds: [],
    activities: [] as object[], equipment: [] as object[], safety: [] as string[], managerNotes: null, version: 0, lastSubmittedAt: null,
    lastProofId: null, reminderSentAt: null, createdAt: now, updatedAt: now,
  };
  const lessons: Record<string, string> = {};
  const addLesson = async (key: string, l: Record<string, unknown>) => {
    lessons[key] = (await db.collection("lessons").add({ ...lessonBase, ...l })).id;
  };

  // From the example file "המרות אנרגיה – חט"ב".
  await addLesson("energy", {
    title: 'המרות אנרגיה – חט"ב', subject: "PHYSICS", kind: "RENOVATION", gradeFrom: 7, gradeTo: 9, ownerIds: [ids[0], ids[4]],
    status: "IN_PROGRESS", dueDate: day(14),
    goals: "הכרת סוגי אנרגיה שונים. הבנת חוק שימור האנרגיה. מושגים: מקורות אנרגיה, גלגולי אנרגיה, זרם חשמלי, תגובה פולטת חום.",
    reviews: [lrv(day(-6), "רשימת ציוד מעודכנת", true), lrv(day(1), "טיוטה מלאה לבדיקת מנהלת"), lrv(day(10), "הרצה ניסיונית במעבדה")],
    activities: [
      act("DEMO", "הר געש"), act("DISCUSSION", "פתיחה: מה זה אנרגיה?"), act("DEMO", "שריפת פס מגנזיום"), act("DEMO", "ממיר תרמו-אלקטרי"),
      act("DEMO", "רדיומטר קרוקס"), act("DEMO", "משחת שיניים לפילים"), act("COMPETITION", "בניית מכונת המרות אנרגיה"),
    ],
    equipment: [
      it("גליצרין", "בקבוק"), it("אשלגן פרמנגנט (KMnO4)", "2-3 כפיות", { hazards: ["OXIDIZER", "TOXIC"] }),
      it("פסי מגנזיום", "2", { hazards: ["FLAMMABLE"], toOrder: true }), it("מצית / גפרורים", "1", { hazards: ["FLAMMABLE"] }),
      it("מלקחיים", "1"), it("כוסות כימיות 500 מ\"ל", "4"), it("קומקום", "1", { hazards: ["HOT", "ELECTRIC"] }), it("קרח", "שקית"),
      it("ממירים תרמו-אלקטריים", "2"), it("רדיומטר קרוקס", "1", { hazards: ["SHARP"] }), it("פרוג'קטור", "1", { hazards: ["HOT"] }),
      it("מי חמצן 30%", "20 מ\"ל", { hazards: ["CORROSIVE", "OXIDIZER"] }), it("סבון נוזלי", "20 מ\"ל"), it("מלח KI", "חצי כפית"),
      it("גומיות רחבות", "שקית", { for: "PER_GROUP", allergens: ["LATEX"] }), it("כדורי קלקר בגדלים שונים", "שקית", { for: "PER_GROUP" }),
      it("אבני דומינו", "קופסה", { for: "PER_GROUP" }), it("צינורות PVC 10 ס\"מ", "10", { for: "PER_GROUP" }),
    ],
    safety: ["GOGGLES", "FUME_HOOD", "OUTDOORS", "EXTINGUISHER", "INSTRUCTOR_ONLY"],
  });
  // A food lesson, already sent for review.
  await addLesson("kitchen", {
    title: "כימיה במטבח – יסודי", subject: "CHEMISTRY", kind: "NEW", gradeFrom: 2, gradeTo: 4, ownerIds: [ids[2]], status: "SUBMITTED",
    dueDate: day(5), version: 1, lastSubmittedAt: now - 3600_000,
    activities: [act("HANDS_ON", "אינדיקטור כרוב סגול"), act("HANDS_ON", "הר געש מסודה וחומץ"), act("DEMO", "עוגה בכוס – מה התפיח אותה?")],
    equipment: [
      it("קמח", "1 ק\"ג", { food: true, allergens: ["GLUTEN"], for: "PER_GROUP" }), it("חלב", "1 ליטר", { food: true, allergens: ["MILK"] }),
      it("ביצים", "6", { food: true, allergens: ["EGGS"] }), it("חמאת בוטנים", "צנצנת", { food: true, allergens: ["PEANUTS"], notes: "לבדוק אלרגיות מראש!" }),
      it("סודה לשתייה", "קופסה", { food: true, noKnownAllergens: true, for: "PER_GROUP" }), it("חומץ", "בקבוק", { food: true, noKnownAllergens: true }),
      it("כרוב סגול", "1", { food: true, noKnownAllergens: true }), it("כפפות לטקס", "זוג לכל ילד", { for: "PER_STUDENT", allergens: ["LATEX"] }),
    ],
    safety: ["GLOVES"],
  });
  await addLesson("slime", {
    title: "פולימרים ורפש", subject: "CHEMISTRY", kind: "RENOVATION", gradeFrom: 4, gradeTo: 6, ownerIds: [ids[1]], status: "CHANGES_REQUESTED",
    dueDate: day(9), version: 1, lastSubmittedAt: now - 3 * 864e5, managerNotes: "להוסיף הנחיות בטיחות לבורקס ולקצר את הפתיחה ל-10 דקות.",
    equipment: [it("דבק PVA", "בקבוק", { for: "PER_GROUP" }), it("בורקס", "כפית", { hazards: ["TOXIC"] }), it("צבע מאכל", "3 צבעים", { food: true, noKnownAllergens: true })],
  });
  await addLesson("static", { title: "חשמל סטטי", subject: "PHYSICS", kind: "NEW", gradeFrom: 3, gradeTo: 5, ownerIds: [ids[6]], status: "IDEA", dueDate: day(-3) });
  await addLesson("cells", {
    title: "מיקרוסקופיה – תאים", subject: "BIOLOGY", kind: "NEW", gradeFrom: 5, gradeTo: 6, ownerIds: [ids[8]], status: "ACTIVE", location: "MUSEUM",
    equipment: [it("מיקרוסקופים", "10", { for: "PER_GROUP", hazards: ["ELECTRIC"] }), it("בצל", "2", { food: true, noKnownAllergens: true }), it("זכוכיות נושא", "30", { hazards: ["SHARP"] })],
  });
  await addLesson("dna", {
    title: "הפקת DNA מתותים", subject: "BIOLOGY", kind: "NEW", gradeFrom: 9, gradeTo: 12, ownerIds: [ids[10]], status: "APPROVED", version: 2,
    equipment: [it("תותים", "קופסה", { food: true, noKnownAllergens: true }), it("סבון כלים", "בקבוק"), it("אלכוהול 70% קר", "200 מ\"ל", { hazards: ["FLAMMABLE"] })],
    safety: ["GOGGLES", "EXTINGUISHER"],
  });
  await db.collection("lessonSubmissions").add({
    lessonId: lessons.kitchen, version: 1, fileId: null, fileName: "כימיה במטבח.pdf", fileSize: 420_000, note: "גרסה ראשונה לבדיקה",
    submittedBy: ids[2], submittedAt: now - 3600_000, emailStatus: "sent", emailAt: now - 3000_000, emailError: null,
    decision: null, decisionNotes: null, decidedAt: null, proofId: null,
  });
  await db.collection("lessonSubmissions").add({
    lessonId: lessons.slime, version: 1, fileId: null, fileName: "פולימרים.docx", fileSize: 1_200_000, note: null,
    submittedBy: ids[1], submittedAt: now - 3 * 864e5, emailStatus: "sent", emailAt: now - 3 * 864e5, emailError: null,
    decision: "CHANGES_REQUESTED", decisionNotes: "להוסיף הנחיות בטיחות לבורקס ולקצר את הפתיחה ל-10 דקות.", decidedAt: now - 2 * 864e5, proofId: null,
  });
  // Science-program tasks: by department, for a lesson, and general.
  const tb = { ...base, status: "TODO", priority: "MEDIUM" };
  await db.collection("tasks").add({ ...tb, title: "צילום סרטונים למוצגים בפארק", assigneeId: ids[3], projectId: null, dueDate: day(12) });
  await db.collection("tasks").add({ ...tb, title: "תיקון מנדף במעבדה 2", assigneeId: null, projectId: null, teamId: teamIds["אחזקה"], priority: "HIGH", dueDate: day(3) });
  await db.collection("tasks").add({ ...tb, title: "להזמין פסי מגנזיום", assigneeId: null, projectId: null, teamId: teamIds["מעבדה"], lessonId: lessons.energy, dueDate: day(6) });
  console.log(`${Object.keys(lessons).length} lessons`);

  await db.doc("settings/main").set({ managerName: "המנהל", managerEmail: "manager@example.com", notifyManager: true, remindersEnabled: true }, { merge: true });

  console.log(`\nManager login: manager@example.com / manager123 (uid ${manager.uid})`);
  console.log("Run the mailer with ADMIN_EMAILS=manager@example.com to grant manager access.");
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
