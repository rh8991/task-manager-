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

  // Other teams the manager works with (manager only).
  const teamIds: Record<string, string> = {};
  const teamInfo: [string, string, string, string][] = [
    ["מעבדה", "רונית (רכזת מעבדה)", "lab@example.com", "מרכזים, מסדרים ומזמינים ציוד. הזמנות עד יום ג׳ לשבוע הבא."],
    ["אחזקה", "משה", "maintenance@example.com", "טיפול טכני ולוגיסטי שלא קשור למעבדה."],
    ["תפעול", "שרית", "ops@example.com", "תיאום קבוצות ולוחות זמנים."],
  ];
  for (const [name, contactName, contactEmail, notes] of teamInfo) {
    teamIds[name] = (await db.collection("teams").add({ name, contactName, contactEmail, notes, createdAt: now })).id;
  }

  // The manager's team of instructors. Each one can sign in with an email link (members/{email}).
  const names = ["דנה כהן", "יוסי לוי", "מיכל אברהם", "אבי מזרחי", "נועה פרץ", "עומר ביטון", "שירה דהן", "איתי אזולאי", "טל פרידמן", "רוני שפירא", "ליאור כהן", "גל לוי"];
  const ids: string[] = [];
  for (const [i, name] of names.entries()) {
    const email = i === 0 ? "dana@example.com" : i === 1 ? "yossi@example.com" : `instructor${i + 1}@example.com`;
    const ref = db.collection("workers").doc();
    await ref.set({ name, teamId: null, active: true, createdAt: now });
    await db.doc(`workerPrivate/${ref.id}`).set({ email });
    await db.doc(`members/${email}`).set({ workerId: ref.id, active: true });
    ids.push(ref.id);
  }
  console.log(`${ids.length} instructors (sign in as dana@example.com or yossi@example.com)`);

  const base = { reviews: [] as object[], remindedReviewIds: [] as string[], description: null, completedAt: null, lastComment: null, lastProofId: null, reminderSentAt: null, createdAt: now, updatedAt: now, projectId: null };
  void token;

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
    title: 'המרות אנרגיה – חט"ב', subject: "PHYSICS", kind: "RENOVATION", grades: [7, 8, 9], ownerIds: [ids[0], ids[4]],
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
    title: "כימיה במטבח – יסודי", subject: "CHEMISTRY", kind: "NEW", grades: [2, 3, 4], location: "MUSEUM", ownerIds: [ids[2]], status: "SUBMITTED",
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
    title: "פולימרים ורפש", subject: "CHEMISTRY", kind: "RENOVATION", grades: [4, 5, 6], ownerIds: [ids[1]], status: "CHANGES_REQUESTED",
    dueDate: day(9), version: 1, lastSubmittedAt: now - 3 * 864e5, managerNotes: "להוסיף הנחיות בטיחות לבורקס ולקצר את הפתיחה ל-10 דקות.",
    equipment: [it("דבק PVA", "בקבוק", { for: "PER_GROUP" }), it("בורקס", "כפית", { hazards: ["TOXIC"] }), it("צבע מאכל", "3 צבעים", { food: true, noKnownAllergens: true })],
  });
  await addLesson("static", { title: "חשמל סטטי", subject: "PHYSICS", kind: "NEW", grades: [3, 4, 5], location: "MUSEUM", ownerIds: [ids[6]], status: "IDEA", dueDate: day(-3) });
  await addLesson("cells", {
    title: "מיקרוסקופיה – תאים", subject: "BIOLOGY", kind: "NEW", grades: [5, 6], ownerIds: [ids[8]], status: "ACTIVE", location: "MUSEUM",
    equipment: [it("מיקרוסקופים", "10", { for: "PER_GROUP", hazards: ["ELECTRIC"] }), it("בצל", "2", { food: true, noKnownAllergens: true }), it("זכוכיות נושא", "30", { hazards: ["SHARP"] })],
  });
  await addLesson("dna", {
    title: "הפקת DNA מתותים", subject: "BIOLOGY", kind: "NEW", grades: [10, 11, 12], ownerIds: [ids[10]], status: "APPROVED", version: 2,
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
  await db.collection("tasks").add({ ...tb, title: "הרצה ניסיונית של התחרות", assigneeId: ids[0], lessonId: lessons.energy, status: "IN_PROGRESS", dueDate: day(2) });
  await db.collection("tasks").add({ ...tb, title: "מצגת פתיחה למערך", assigneeId: ids[0], lessonId: lessons.energy, dueDate: day(-1), priority: "HIGH" });
  await db.collection("tasks").add({ ...tb, title: "עדכון דף המדריך במוזיאון", assigneeId: ids[2], dueDate: day(8) });

  // Equipment orders and meetings with other teams – the manager's, linked to lessons.
  const eq = { link: null, notes: null, managerNote: null, projectId: null, proofId: null, approvedAt: now, orderedAt: null, receivedAt: null, createdAt: now, updatedAt: now, estCost: null };
  await db.collection("equipment").add({ ...eq, item: "פסי מגנזיום", quantity: 2, requesterId: ids[0], lessonId: lessons.energy, status: "APPROVED", neededBy: day(10), notes: 'עבור המערך "המרות אנרגיה – חט"ב"' });
  await db.collection("equipment").add({ ...eq, item: "כפפות ניטריל (בלי לטקס)", quantity: 100, requesterId: null, lessonId: lessons.kitchen, status: "ORDERED", orderedAt: now });
  const mt = { notes: null, neededBy: null, proofId: null, createdAt: now, updatedAt: now, status: "OPEN" };
  await db.collection("meetings").add({ ...mt, topic: "תיאום חומרים מסוכנים (מי חמצן, מגנזיום)", requesterId: null, withTeamId: teamIds["מעבדה"], lessonId: lessons.energy, neededBy: day(4) });
  await db.collection("meetings").add({ ...mt, topic: "צריך עזרה עם המנדף לפני ההרצה", requesterId: ids[4], withTeamId: null, lessonId: lessons.energy });
  await db.collection("meetings").add({ ...mt, topic: "לוח זמנים לקבוצות במוזיאון", requesterId: null, withTeamId: teamIds["תפעול"], lessonId: null, status: "SCHEDULED" });
  console.log(`${Object.keys(lessons).length} lessons`);

  await db.doc("settings/main").set({ managerName: "המנהל", managerEmail: "manager@example.com", notifyManager: true, remindersEnabled: true }, { merge: true });

  console.log(`\nManager login: manager@example.com / manager123 (uid ${manager.uid})`);
  console.log("Run the mailer with ADMIN_EMAILS=manager@example.com to grant manager access.");
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
