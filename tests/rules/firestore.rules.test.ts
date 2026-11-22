import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { Bytes, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";

/**
 * Runs against the Firestore emulator: `npm run test:rules`.
 * Users: manager "boss"; instructors dana (w1, works on lesson L1) and yossi (w2); a former
 * instructor (inactive); and a signed-in stranger.
 */
let env: RulesTestEnvironment;
const now = Date.now();

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-task-manager",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(port) },
  });
});
afterAll(async () => env?.cleanup());

const task = (assigneeId: string | null, over: object = {}) => ({
  title: "Task", description: null, status: "TODO", priority: "MEDIUM", dueDate: null, projectId: null, assigneeId,
  completedAt: null, lastComment: null, lastProofId: null, reminderSentAt: null, createdAt: now, updatedAt: now, ...over,
});

const lesson = (over: object = {}) => ({
  title: "המרות אנרגיה", subject: "PHYSICS", grades: [7, 8, 9], location: "PARK_LAB", durationMin: 90, kind: "NEW",
  goals: null, summary: null, ownerIds: ["w1"], status: "IDEA", startDate: null, dueDate: "2026-12-31",
  activities: [], equipment: [], safety: [], managerNotes: null, version: 0, lastSubmittedAt: null, lastProofId: null,
  reminderSentAt: null, createdAt: now, updatedAt: now, ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "admins/boss"), { email: "boss@example.com" });
    for (const [id, name] of [["w1", "Dana"], ["w2", "Yossi"], ["w3", "Gone"]]) {
      await setDoc(doc(db, `workers/${id}`), { name, teamId: null, active: id !== "w3", createdAt: now });
    }
    await setDoc(doc(db, "members/dana@example.com"), { workerId: "w1", active: true });
    await setDoc(doc(db, "members/yossi@example.com"), { workerId: "w2", active: true });
    await setDoc(doc(db, "members/gone@example.com"), { workerId: "w3", active: false });
    await setDoc(doc(db, "workerPrivate/w1"), { email: "dana@example.com" });
    await setDoc(doc(db, "teams/lab"), { name: "מעבדה", createdAt: now });
    await setDoc(doc(db, "equipment/e1"), { item: "מגנזיום", status: "APPROVED" });
    await setDoc(doc(db, "meetings/m1"), { topic: "תיאום", status: "OPEN" });
    await setDoc(doc(db, "settings/main"), { managerName: "Boss" });
    await setDoc(doc(db, "tasks/t1"), task("w1"));
    await setDoc(doc(db, "tasks/t2"), task("w2"));
    await setDoc(doc(db, "lessons/L1"), lesson());
    await setDoc(doc(db, "lessons/L2"), lesson({ status: "APPROVED" }));
    await setDoc(doc(db, "lessons/L3"), lesson({ ownerIds: ["w2"] }));
    await setDoc(doc(db, "lessonFiles/F0"), { lessonId: "L1", name: "a.pdf", size: 3, mimeType: "application/pdf", chunkCount: 1, uploadedBy: "w1", proofId: null, createdAt: now });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const admin = () => env.authenticatedContext("boss", { email: "boss@example.com" }).firestore();
const dana = () => env.authenticatedContext("dana-uid", { email: "dana@example.com", email_verified: true }).firestore();
const yossi = () => env.authenticatedContext("yossi-uid", { email: "yossi@example.com", email_verified: true }).firestore();
const gone = () => env.authenticatedContext("gone-uid", { email: "gone@example.com", email_verified: true }).firestore();
const unverified = () => env.authenticatedContext("x-uid", { email: "dana@example.com", email_verified: false }).firestore();
const stranger = () => env.authenticatedContext("s-uid", { email: "s@example.com", email_verified: true }).firestore();

describe("not signed in", () => {
  it("can read nothing", async () => {
    for (const c of ["lessons", "workers", "teams", "equipment", "meetings", "lessonSubmissions"]) {
      await assertFails(getDocs(collection(anon(), c)));
    }
    await assertFails(getDoc(doc(anon(), "tasks/t1")));
  });
  it("a signed-in stranger, an unverified email or a deactivated instructor can't read either", async () => {
    for (const db of [stranger(), unverified(), gone()]) {
      await assertFails(getDocs(collection(db, "lessons")));
      await assertFails(getDocs(collection(db, "workers")));
    }
  });
});

describe("instructor: what they see", () => {
  it("sees lessons, submissions and the instructors", async () => {
    await assertSucceeds(getDocs(collection(dana(), "lessons")));
    await assertSucceeds(getDocs(collection(dana(), "lessonSubmissions")));
    await assertSucceeds(getDocs(collection(dana(), "workers")));
    await assertSucceeds(getDoc(doc(dana(), "members/dana@example.com")));
  });
  it("does NOT see other teams, equipment orders, meetings, settings, emails or files", async () => {
    for (const c of ["teams", "equipment", "meetings", "settings", "emailLog", "outbox", "workerPrivate", "lessonFiles", "taskUpdates", "projects"]) {
      await assertFails(getDocs(collection(dana(), c)));
    }
    await assertFails(getDoc(doc(dana(), "members/yossi@example.com")));
  });
  it("sees only their own tasks", async () => {
    await assertSucceeds(getDoc(doc(dana(), "tasks/t1")));
    await assertFails(getDoc(doc(dana(), "tasks/t2")));
    await assertSucceeds(getDocs(query(collection(dana(), "tasks"), where("assigneeId", "==", "w1"))));
    await assertFails(getDocs(collection(dana(), "tasks")));
  });
});

describe("instructor: what they can change", () => {
  it("updates the status of their own lesson to in progress, and back to idea", async () => {
    await assertSucceeds(updateDoc(doc(dana(), "lessons/L1"), { status: "IN_PROGRESS", updatedAt: now + 1 }));
    await assertSucceeds(updateDoc(doc(dana(), "lessons/L1"), { status: "IDEA", updatedAt: now + 2 }));
  });
  it("edits the equipment list of their own lesson", async () => {
    await assertSucceeds(updateDoc(doc(dana(), "lessons/L1"), { equipment: [{ id: "i1", name: "מגנזיום" }], updatedAt: now + 1 }));
  });
  it("cannot approve or activate, or send for review without a new version", async () => {
    for (const status of ["APPROVED", "ACTIVE", "ARCHIVED", "CHANGES_REQUESTED"]) {
      await assertFails(updateDoc(doc(dana(), "lessons/L1"), { status, updatedAt: now + 1 }));
    }
    await assertFails(updateDoc(doc(dana(), "lessons/L1"), { status: "SUBMITTED", updatedAt: now + 1 }));
  });
  it("cannot change the deadline, the instructors or the title", async () => {
    await assertFails(updateDoc(doc(dana(), "lessons/L1"), { dueDate: "2027-06-01" }));
    await assertFails(updateDoc(doc(dana(), "lessons/L1"), { ownerIds: ["w1", "w2"] }));
    await assertFails(updateDoc(doc(dana(), "lessons/L1"), { title: "x" }));
  });
  it("cannot edit someone else's lesson, or an approved one", async () => {
    await assertFails(updateDoc(doc(dana(), "lessons/L3"), { status: "IN_PROGRESS" }));
    await assertFails(updateDoc(doc(dana(), "lessons/L2"), { equipment: [] }));
  });
  it("cannot delete anything", async () => {
    await assertFails(deleteDoc(doc(dana(), "lessons/L1")));
    await assertFails(deleteDoc(doc(dana(), "tasks/t1")));
    await assertFails(deleteDoc(doc(dana(), "workers/w2")));
  });
  it("cannot create lessons or instructors, or make themselves a manager", async () => {
    await assertFails(setDoc(doc(dana(), "lessons/new"), lesson()));
    await assertFails(setDoc(doc(dana(), "workers/w9"), { name: "x", active: true }));
    await assertFails(setDoc(doc(dana(), "members/x@example.com"), { workerId: "w9", active: true }));
    await assertFails(setDoc(doc(dana(), "admins/dana-uid"), { email: "dana@example.com" }));
  });
  it("updates only the status / comment of their own task", async () => {
    await assertSucceeds(updateDoc(doc(dana(), "tasks/t1"), { status: "DONE", completedAt: now, lastComment: "בוצע", updatedAt: now }));
    await assertFails(updateDoc(doc(dana(), "tasks/t1"), { title: "x" }));
    await assertFails(updateDoc(doc(dana(), "tasks/t2"), { status: "DONE" }));
  });
  it("can ask the manager for a meeting about their lesson, but not order equipment", async () => {
    await assertSucceeds(setDoc(doc(dana(), "meetings/m2"), {
      topic: "צריך פגישה עם המעבדה", notes: null, neededBy: null, status: "OPEN", withTeamId: null, lessonId: "L1",
      requesterId: "w1", proofId: null, createdAt: now, updatedAt: now,
    }));
    await assertFails(setDoc(doc(dana(), "meetings/m3"), {
      topic: "x", notes: null, neededBy: null, status: "OPEN", withTeamId: null, lessonId: "L3",
      requesterId: "w1", proofId: null, createdAt: now, updatedAt: now,
    }));
    await assertFails(setDoc(doc(dana(), "equipment/e2"), { item: "x", status: "PENDING" }));
  });
});

describe("instructor: sending the lesson file for review", () => {
  it("uploads in chunks, creates the submission, sets SUBMITTED + version 1 and queues the email", async () => {
    const db = dana();
    const fileRef = doc(collection(db, "lessonFiles"));
    let b = writeBatch(db);
    b.set(fileRef, { lessonId: "L1", name: "מערך.pdf", size: 1_000_000, mimeType: "application/pdf", chunkCount: 2, uploadedBy: "w1", proofId: null, createdAt: now });
    b.set(doc(db, `lessonFiles/${fileRef.id}/chunks/0`), { data: Bytes.fromUint8Array(new Uint8Array(900 * 1024)), n: 0, lessonId: "L1", proofId: null });
    await assertSucceeds(b.commit());
    b = writeBatch(db);
    b.set(doc(db, `lessonFiles/${fileRef.id}/chunks/1`), { data: Bytes.fromUint8Array(new Uint8Array(78_400)), n: 1, lessonId: "L1", proofId: null });
    await assertSucceeds(b.commit());

    b = writeBatch(db);
    const sub = doc(collection(db, "lessonSubmissions"));
    b.set(sub, {
      lessonId: "L1", version: 1, fileId: fileRef.id, fileName: "מערך.pdf", fileSize: 1_000_000, note: null,
      report: { done: "כתבתי את כל ההדגמות", next: "תחרות", blockers: null }, submittedBy: "w1", submittedAt: now,
      emailStatus: "pending", emailAt: null, emailError: null, decision: null, decisionNotes: null, decidedAt: null, proofId: null,
    });
    b.update(doc(db, "lessons/L1"), { status: "SUBMITTED", version: 1, lastSubmittedAt: now, updatedAt: now });
    b.set(doc(collection(db, "outbox")), { type: "lesson-submitted", lessonId: "L1", submissionId: sub.id, status: "pending", createdAt: now });
    await assertSucceeds(b.commit());
  });

  it("another instructor can't upload or send for this lesson, or pretend to be someone else", async () => {
    const db = yossi();
    await assertFails(setDoc(doc(db, "lessonFiles/x"), { lessonId: "L1", name: "a.pdf", size: 3, mimeType: "application/pdf", chunkCount: 1, uploadedBy: "w2", proofId: null, createdAt: now }));
    await assertFails(setDoc(doc(db, "outbox/o"), { type: "lesson-submitted", lessonId: "L1", submissionId: "s", status: "pending", createdAt: now }));
    await assertFails(setDoc(doc(dana(), "lessonFiles/y"), { lessonId: "L1", name: "a.pdf", size: 3, mimeType: "application/pdf", chunkCount: 1, uploadedBy: "w2", proofId: null, createdAt: now }));
  });

  it("can't mark its own submission as approved", async () => {
    await assertFails(setDoc(doc(dana(), "lessonSubmissions/s1"), {
      lessonId: "L1", version: 1, fileId: null, fileName: null, fileSize: null, note: null, submittedBy: "w1", submittedAt: now,
      emailStatus: "pending", emailAt: null, emailError: null, decision: "APPROVED", decisionNotes: null, decidedAt: now, proofId: null,
    }));
  });

  it("can't queue other kinds of email (e.g. a report to everyone)", async () => {
    await assertFails(setDoc(doc(dana(), "outbox/o2"), { type: "report", workerIds: null, note: "spam", status: "pending", createdAt: now }));
  });
});

describe("manager", () => {
  it("reads and writes everything", async () => {
    for (const c of ["teams", "equipment", "meetings", "settings", "lessons", "tasks", "workerPrivate", "lessonFiles"]) {
      await assertSucceeds(getDocs(collection(admin(), c)));
    }
    await assertSucceeds(updateDoc(doc(admin(), "lessons/L1"), { status: "APPROVED", dueDate: "2027-01-01" }));
    await assertSucceeds(setDoc(doc(admin(), "members/new@example.com"), { workerId: "w9", active: true }));
    await assertSucceeds(deleteDoc(doc(admin(), "lessons/L3")));
    await assertSucceeds(deleteDoc(doc(admin(), "workers/w2")));
  });
  it("nobody can make themselves an admin", async () => {
    await assertFails(setDoc(doc(admin(), "admins/x"), { email: "x@example.com" }));
  });
});

describe("sign-in link requests", () => {
  it("only for emails of active instructors, and never readable", async () => {
    await assertSucceeds(setDoc(doc(anon(), "loginRequests/dana@example.com"), { email: "dana@example.com", createdAt: now }));
    await assertFails(setDoc(doc(anon(), "loginRequests/gone@example.com"), { email: "gone@example.com", createdAt: now }));
    await assertFails(setDoc(doc(anon(), "loginRequests/nobody@example.com"), { email: "nobody@example.com", createdAt: now }));
    await assertFails(setDoc(doc(anon(), "loginRequests/dana@example.com"), { email: "yossi@example.com", createdAt: now }));
    await assertFails(getDoc(doc(admin(), "loginRequests/dana@example.com")));
  });
});
