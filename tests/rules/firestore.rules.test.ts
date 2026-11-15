import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from "firebase/firestore";

/**
 * Runs against the Firestore emulator: `npm run test:rules`.
 * Data: admin "boss"; workers w1 (token TOK1, assigned task t1) and w2 (token TOK2, task t2).
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

const task = (assigneeId: string) => ({
  title: "Task",
  description: null,
  status: "TODO",
  priority: "MEDIUM",
  dueDate: null,
  projectId: null,
  assigneeId,
  completedAt: null,
  lastComment: null,
  lastProofId: null,
  reminderSentAt: null,
  createdAt: now,
  updatedAt: now,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "admins/boss"), { email: "boss@example.com" });
    await setDoc(doc(db, "workers/w1"), { name: "One", teamId: null, active: true, createdAt: now });
    await setDoc(doc(db, "workers/w2"), { name: "Two", teamId: null, active: true, createdAt: now });
    await setDoc(doc(db, "workers/gone"), { name: "Gone", teamId: null, active: false, createdAt: now });
    await setDoc(doc(db, "workerPrivate/w1"), { email: "one@example.com", token: "TOK1" });
    await setDoc(doc(db, "workerLinks/TOK1"), { workerId: "w1" });
    await setDoc(doc(db, "workerLinks/TOK2"), { workerId: "w2" });
    await setDoc(doc(db, "workerLinks/TOKGONE"), { workerId: "gone" });
    await setDoc(doc(db, "tasks/t1"), task("w1"));
    await setDoc(doc(db, "tasks/t2"), task("w2"));
    await setDoc(doc(db, "settings/main"), { managerName: "Boss" });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const admin = () => env.authenticatedContext("boss").firestore();
const stranger = () => env.authenticatedContext("random-user").firestore();

/** What the worker page does: one batch = new proof + the change pointing at it. */
function workerStatusBatch(db: ReturnType<typeof anon>, token: string, workerId: string, taskId: string, extra: object = {}) {
  const proofRef = doc(collection(db, "proofs"));
  const b = writeBatch(db);
  b.set(proofRef, { token, workerId, createdAt: now });
  b.update(doc(db, "tasks", taskId), { status: "DONE", completedAt: now, lastComment: "done!", lastProofId: proofRef.id, updatedAt: now, ...extra });
  b.set(doc(collection(db, "taskUpdates")), {
    taskId, workerId, oldStatus: "TODO", newStatus: "DONE", comment: "done!", proofId: proofRef.id, createdAt: now,
  });
  return b;
}

function equipment(requesterId: string, proofId: string, over: object = {}) {
  return {
    item: "Laptop", quantity: 1, link: null, estCost: null, notes: null, neededBy: null, status: "PENDING",
    managerNote: null, requesterId, projectId: null, proofId, approvedAt: null, orderedAt: null, receivedAt: null,
    createdAt: now, updatedAt: now, ...over,
  };
}

describe("public board", () => {
  it("anyone can read tasks, workers and teams", async () => {
    await assertSucceeds(getDocs(collection(anon(), "tasks")));
    await assertSucceeds(getDocs(collection(anon(), "workers")));
    await assertSucceeds(getDocs(collection(anon(), "teams")));
  });

  it("private data is not readable by the public or a non-admin user", async () => {
    await assertFails(getDoc(doc(anon(), "workerPrivate/w1")));
    await assertFails(getDocs(collection(anon(), "workerPrivate")));
    await assertFails(getDoc(doc(stranger(), "workerPrivate/w1")));
    await assertFails(getDoc(doc(anon(), "settings/main")));
    await assertFails(getDocs(collection(anon(), "emailLog")));
    await assertFails(getDocs(collection(anon(), "outbox")));
  });

  it("a link can be looked up by its exact token, but tokens can't be listed", async () => {
    await assertSucceeds(getDoc(doc(anon(), "workerLinks/TOK1")));
    await assertFails(getDocs(collection(anon(), "workerLinks")));
  });

  it("proofs are never readable", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "proofs/p1"), { token: "TOK1", workerId: "w1", createdAt: now }));
    await assertFails(getDoc(doc(anon(), "proofs/p1")));
    await assertFails(getDoc(doc(admin(), "proofs/p1")));
  });
});

describe("manager", () => {
  it("admin can write anything it manages", async () => {
    await assertSucceeds(setDoc(doc(admin(), "tasks/t3"), task("w1")));
    await assertSucceeds(updateDoc(doc(admin(), "tasks/t1"), { title: "Renamed", assigneeId: "w2" }));
    await assertSucceeds(setDoc(doc(admin(), "workerPrivate/w2"), { email: "two@example.com", token: "TOK2" }));
    await assertSucceeds(getDoc(doc(admin(), "settings/main")));
    await assertSucceeds(setDoc(doc(admin(), "outbox/o1"), { type: "test", status: "pending", createdAt: now }));
    await assertSucceeds(deleteDoc(doc(admin(), "tasks/t2")));
  });

  it("a signed-in non-admin cannot write", async () => {
    await assertFails(setDoc(doc(stranger(), "tasks/t3"), task("w1")));
    await assertFails(updateDoc(doc(stranger(), "tasks/t1"), { title: "x" }));
  });

  it("nobody can make themselves an admin", async () => {
    await assertFails(setDoc(doc(stranger(), "admins/random-user"), { email: "x@example.com" }));
    await assertFails(setDoc(doc(admin(), "admins/random-user"), { email: "x@example.com" }));
  });

  it("a user can check only their own admin doc", async () => {
    await assertSucceeds(getDoc(doc(admin(), "admins/boss")));
    await assertFails(getDoc(doc(stranger(), "admins/boss")));
  });
});

describe("worker with personal link", () => {
  it("can update the status of their own task, with history", async () => {
    await assertSucceeds(workerStatusBatch(anon(), "TOK1", "w1", "t1").commit());
  });

  it("cannot update someone else's task", async () => {
    await assertFails(workerStatusBatch(anon(), "TOK1", "w1", "t2").commit());
    // ...even claiming to be the other worker with their own token
    await assertFails(workerStatusBatch(anon(), "TOK1", "w2", "t2").commit());
  });

  it("cannot use a fake token", async () => {
    await assertFails(workerStatusBatch(anon(), "NOT-A-TOKEN", "w1", "t1").commit());
  });

  it("cannot change the title, assignee or due date", async () => {
    await assertFails(workerStatusBatch(anon(), "TOK1", "w1", "t1", { title: "hacked" }).commit());
    await assertFails(workerStatusBatch(anon(), "TOK1", "w1", "t1", { assigneeId: "w2" }).commit());
    await assertFails(workerStatusBatch(anon(), "TOK1", "w1", "t1", { dueDate: "2030-01-01" }).commit());
  });

  it("cannot set an invalid status", async () => {
    await assertFails(workerStatusBatch(anon(), "TOK1", "w1", "t1", { status: "WHATEVER" }).commit());
  });

  it("cannot replay an existing proof without the token", async () => {
    await assertSucceeds(workerStatusBatch(anon(), "TOK1", "w1", "t1").commit());
    const used = (await getDoc(doc(anon(), "tasks/t1"))).data()!;
    if (!used.lastProofId) throw new Error("expected a proof id on the task");
    // Attacker reads the public lastProofId and tries to reuse it.
    await assertFails(updateDoc(doc(anon(), "tasks/t1"), { status: "BLOCKED", lastProofId: used.lastProofId, updatedAt: now + 1 }));
  });

  it("an inactive worker's link stops working", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "tasks/tg"), task("gone")));
    await assertFails(workerStatusBatch(anon(), "TOKGONE", "gone", "tg").commit());
  });

  it("cannot write a proof for a token that isn't theirs", async () => {
    await assertFails(setDoc(doc(anon(), "proofs/x"), { token: "TOK1", workerId: "w2", createdAt: now }));
  });

  it("can request equipment (PENDING only)", async () => {
    const db = anon();
    const p = doc(collection(db, "proofs"));
    const b = writeBatch(db);
    b.set(p, { token: "TOK1", workerId: "w1", createdAt: now });
    b.set(doc(collection(db, "equipment")), equipment("w1", p.id));
    await assertSucceeds(b.commit());
  });

  it("cannot create already-approved equipment, or request for someone else", async () => {
    for (const [requester, over] of [["w1", { status: "APPROVED" }], ["w2", {}]] as const) {
      const db = anon();
      const p = doc(collection(db, "proofs"));
      const b = writeBatch(db);
      b.set(p, { token: "TOK1", workerId: "w1", createdAt: now });
      b.set(doc(collection(db, "equipment")), equipment(requester, p.id, over));
      await assertFails(b.commit());
    }
  });

  it("can request a meeting and notify the manager", async () => {
    const db = anon();
    const p = doc(collection(db, "proofs"));
    const b = writeBatch(db);
    b.set(p, { token: "TOK1", workerId: "w1", createdAt: now });
    b.set(doc(collection(db, "meetings")), {
      topic: "Sync", notes: null, neededBy: "2026-12-01", status: "OPEN", withTeamId: null, requesterId: "w1", proofId: p.id,
      createdAt: now, updatedAt: now,
    });
    b.set(doc(collection(db, "outbox")), {
      type: "manager-notice", subject: "One needs a meeting", lines: ["Sync"], path: "/admin/meetings", proofId: p.id, status: "pending", createdAt: now,
    });
    await assertSucceeds(b.commit());
  });

  it("cannot queue other kinds of email (e.g. a report to everyone)", async () => {
    const db = anon();
    const p = doc(collection(db, "proofs"));
    const b = writeBatch(db);
    b.set(p, { token: "TOK1", workerId: "w1", createdAt: now });
    b.set(doc(collection(db, "outbox")), { type: "report", workerIds: null, note: "spam", proofId: p.id, status: "pending", createdAt: now });
    await assertFails(b.commit());
  });

  it("cannot approve or edit equipment", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "equipment/e1"), equipment("w1", "old")));
    await assertFails(updateDoc(doc(anon(), "equipment/e1"), { status: "APPROVED" }));
  });
});
