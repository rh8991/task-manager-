import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { Bytes, collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from "firebase/firestore";

/**
 * Lessons (מערכים) security rules. w1 is the lesson's instructor (owner); w2 is not.
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

const lesson = (over: object = {}) => ({
  title: "המרות אנרגיה",
  subject: "PHYSICS",
  gradeFrom: 7,
  gradeTo: 9,
  location: "PARK_LAB",
  durationMin: 90,
  kind: "NEW",
  goals: null,
  summary: null,
  ownerIds: ["w1"],
  status: "IDEA",
  startDate: null,
  dueDate: "2026-12-31",
  activities: [],
  equipment: [],
  safety: [],
  managerNotes: null,
  version: 0,
  lastSubmittedAt: null,
  lastProofId: null,
  reminderSentAt: null,
  createdAt: now,
  updatedAt: now,
  ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "admins/boss"), { email: "boss@example.com" });
    await setDoc(doc(db, "workers/w1"), { name: "One", teamId: null, active: true, createdAt: now });
    await setDoc(doc(db, "workers/w2"), { name: "Two", teamId: null, active: true, createdAt: now });
    await setDoc(doc(db, "workerLinks/TOK1"), { workerId: "w1" });
    await setDoc(doc(db, "workerLinks/TOK2"), { workerId: "w2" });
    await setDoc(doc(db, "lessons/L1"), lesson());
    await setDoc(doc(db, "lessons/L2"), lesson({ status: "APPROVED" }));
    await setDoc(doc(db, "lessonFiles/F0"), { lessonId: "L1", name: "old.pdf", size: 3, mimeType: "application/pdf", chunkCount: 1, uploadedBy: "w1", proofId: null, createdAt: now });
    await setDoc(doc(db, "lessonFiles/F0/chunks/0"), { data: Bytes.fromUint8Array(new Uint8Array([1, 2, 3])), n: 0, lessonId: "L1", proofId: null });
  });
});

let anonDb: ReturnType<RulesTestEnvironment["unauthenticatedContext"]>["firestore"] extends () => infer R ? R : never;
beforeEach(() => {
  anonDb = env.unauthenticatedContext().firestore();
});
/** One unauthenticated connection per test (a batch can't mix connections). */
const anon = () => anonDb;
const admin = () => env.authenticatedContext("boss").firestore();
const stranger = () => env.authenticatedContext("random").firestore();
type Db = ReturnType<typeof anon>;

function withProof(db: Db, token: string, workerId: string) {
  const b = writeBatch(db);
  const p = doc(collection(db, "proofs"));
  b.set(p, { token, workerId, createdAt: now });
  return { b, proofId: p.id };
}

const bytes = (n: number) => Bytes.fromUint8Array(new Uint8Array(n).fill(7));

describe("lessons: reading", () => {
  it("anyone can read lessons and submissions", async () => {
    await assertSucceeds(getDocs(collection(anon(), "lessons")));
    await assertSucceeds(getDocs(collection(anon(), "lessonSubmissions")));
  });

  it("only the manager can read lesson files", async () => {
    await assertFails(getDoc(doc(anon(), "lessonFiles/F0")));
    await assertFails(getDoc(doc(anon(), "lessonFiles/F0/chunks/0")));
    await assertFails(getDoc(doc(stranger(), "lessonFiles/F0/chunks/0")));
    await assertSucceeds(getDoc(doc(admin(), "lessonFiles/F0")));
    await assertSucceeds(getDoc(doc(admin(), "lessonFiles/F0/chunks/0")));
  });
});

describe("lessons: instructor edits", () => {
  const edit = { equipment: [{ id: "i1", name: "מגנזיום", quantity: "2", for: "INSTRUCTOR", food: false, allergens: [], allergenOther: null, noKnownAllergens: false, hazards: ["FLAMMABLE"], toOrder: false, notes: null }], activities: [], status: "IN_PROGRESS", updatedAt: now };

  it("the lesson's instructor can edit the equipment and start working", async () => {
    const { b, proofId } = withProof(anon(), "TOK1", "w1");
    b.update(doc(anon(), "lessons/L1"), { ...edit, lastProofId: proofId });
    await assertSucceeds(b.commit());
  });

  it("another worker cannot", async () => {
    const db = anon();
    const { b, proofId } = withProof(db, "TOK2", "w2");
    b.update(doc(db, "lessons/L1"), { ...edit, lastProofId: proofId });
    await assertFails(b.commit());
  });

  it("the instructor cannot change the deadline, the instructors or the title", async () => {
    for (const extra of [{ dueDate: "2027-06-01" }, { ownerIds: ["w1", "w2"] }, { title: "x" }]) {
      const db = anon();
      const { b, proofId } = withProof(db, "TOK1", "w1");
      b.update(doc(db, "lessons/L1"), { ...edit, ...extra, lastProofId: proofId });
      await assertFails(b.commit());
    }
  });

  it("the instructor cannot approve, or edit an approved lesson", async () => {
    let db = anon();
    let x = withProof(db, "TOK1", "w1");
    x.b.update(doc(db, "lessons/L1"), { status: "APPROVED", lastProofId: x.proofId, updatedAt: now });
    await assertFails(x.b.commit());
    db = anon();
    x = withProof(db, "TOK1", "w1");
    x.b.update(doc(db, "lessons/L2"), { ...edit, status: "APPROVED", lastProofId: x.proofId });
    await assertFails(x.b.commit());
  });

  it("an old proof can't be reused", async () => {
    const { b, proofId } = withProof(anon(), "TOK1", "w1");
    b.update(doc(anon(), "lessons/L1"), { ...edit, lastProofId: proofId });
    await assertSucceeds(b.commit());
    await assertFails(updateDoc(doc(anon(), "lessons/L1"), { equipment: [], lastProofId: proofId, updatedAt: now + 1 }));
  });
});

describe("lessons: uploading and submitting a file", () => {
  it("the instructor can upload in chunks and submit for review", async () => {
    const db = anon();
    // batch 1: file info + first chunks
    const fileRef = doc(collection(db, "lessonFiles"));
    let x = withProof(db, "TOK1", "w1");
    x.b.set(fileRef, { lessonId: "L1", name: "מערך.pdf", size: 1_900_000, mimeType: "application/pdf", chunkCount: 3, uploadedBy: "w1", proofId: x.proofId, createdAt: now });
    x.b.set(doc(db, `lessonFiles/${fileRef.id}/chunks/0`), { data: bytes(900 * 1024), n: 0, lessonId: "L1", proofId: x.proofId });
    x.b.set(doc(db, `lessonFiles/${fileRef.id}/chunks/1`), { data: bytes(900 * 1024), n: 1, lessonId: "L1", proofId: x.proofId });
    await assertSucceeds(x.b.commit());
    // batch 2: the rest
    x = withProof(db, "TOK1", "w1");
    x.b.set(doc(db, `lessonFiles/${fileRef.id}/chunks/2`), { data: bytes(100_000), n: 2, lessonId: "L1", proofId: x.proofId });
    await assertSucceeds(x.b.commit());
    // final batch: submission + lesson status + email
    x = withProof(db, "TOK1", "w1");
    const sub = doc(collection(db, "lessonSubmissions"));
    x.b.set(sub, {
      lessonId: "L1", version: 1, fileId: fileRef.id, fileName: "מערך.pdf", fileSize: 1_900_000, note: "גרסה ראשונה",
      submittedBy: "w1", submittedAt: now, emailStatus: "pending", emailAt: null, emailError: null,
      decision: null, decisionNotes: null, decidedAt: null, proofId: x.proofId,
    });
    x.b.update(doc(db, "lessons/L1"), { status: "SUBMITTED", version: 1, lastSubmittedAt: now, lastProofId: x.proofId, updatedAt: now });
    x.b.set(doc(collection(db, "outbox")), { type: "lesson-submitted", lessonId: "L1", submissionId: sub.id, proofId: x.proofId, status: "pending", createdAt: now });
    await assertSucceeds(x.b.commit());
  });

  it("another worker cannot upload or submit", async () => {
    const db = anon();
    const fileRef = doc(collection(db, "lessonFiles"));
    const x = withProof(db, "TOK2", "w2");
    x.b.set(fileRef, { lessonId: "L1", name: "x.pdf", size: 10, mimeType: "application/pdf", chunkCount: 1, uploadedBy: "w2", proofId: x.proofId, createdAt: now });
    await assertFails(x.b.commit());
    const y = withProof(anon(), "TOK2", "w2");
    y.b.set(doc(collection(anon(), "outbox")), { type: "lesson-submitted", lessonId: "L1", submissionId: "s", proofId: y.proofId, status: "pending", createdAt: now });
    await assertFails(y.b.commit());
  });

  it("a chunk can't be added to someone else's file, or be too big", async () => {
    let x = withProof(anon(), "TOK1", "w1");
    x.b.set(doc(anon(), "lessonFiles/F0/chunks/9"), { data: bytes(1_000_000), n: 9, lessonId: "L1", proofId: x.proofId });
    await assertFails(x.b.commit());
    x = withProof(anon(), "TOK1", "w1");
    x.b.set(doc(anon(), "lessonFiles/F0/chunks/9"), { data: bytes(10), n: 9, lessonId: "L2", proofId: x.proofId });
    await assertFails(x.b.commit());
  });

  it("the instructor cannot submit an already-approved decision", async () => {
    const x = withProof(anon(), "TOK1", "w1");
    x.b.set(doc(collection(anon(), "lessonSubmissions")), {
      lessonId: "L1", version: 1, fileId: null, fileName: null, fileSize: null, note: null, submittedBy: "w1", submittedAt: now,
      emailStatus: "pending", emailAt: null, emailError: null, decision: "APPROVED", decisionNotes: null, decidedAt: now, proofId: x.proofId,
    });
    await assertFails(x.b.commit());
  });

  it("the manager can decide", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "lessonSubmissions/S1"), { lessonId: "L1", decision: null }));
    await assertSucceeds(updateDoc(doc(admin(), "lessonSubmissions/S1"), { decision: "APPROVED", decidedAt: now }));
    await assertFails(updateDoc(doc(anon(), "lessonSubmissions/S1"), { decision: "APPROVED" }));
  });
});
