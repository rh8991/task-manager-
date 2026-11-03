/**
 * Demo data for local development: `npm run db:seed`.
 * Wipes existing data first, so do NOT run it against production.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();
const token = () => randomBytes(18).toString("base64url");
const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
  await db.$transaction([
    db.taskUpdate.deleteMany(),
    db.task.deleteMany(),
    db.equipmentRequest.deleteMany(),
    db.meetingRequest.deleteMany(),
    db.worker.deleteMany(),
    db.project.deleteMany(),
    db.team.deleteMany(),
    db.emailLog.deleteMany(),
    db.settings.deleteMany(),
  ]);

  const [dev, ops, purchasing, marketing] = await Promise.all(
    ["פיתוח", "תפעול", "רכש", "שיווק"].map((name) => db.team.create({ data: { name } })),
  );

  const people: [string, string, number][] = [
    ["דנה כהן", "dana@example.com", dev.id],
    ["יוסי לוי", "yossi@example.com", dev.id],
    ["מיכל אברהם", "michal@example.com", ops.id],
    ["אבי מזרחי", "avi@example.com", ops.id],
    ["נועה פרץ", "noa@example.com", marketing.id],
    ["עומר ביטון", "omer@example.com", purchasing.id],
  ];
  const workers = [];
  for (const [name, email, teamId] of people) workers.push(await db.worker.create({ data: { name, email, teamId, token: token() } }));
  const [dana, yossi, michal, avi, noa, omer] = workers;

  const site = await db.project.create({ data: { name: "אתר חדש", description: "השקת אתר החברה החדש", dueDate: day(30) } });
  const office = await db.project.create({ data: { name: "מעבר משרד", description: "מעבר לקומה 3", dueDate: day(45) } });

  const tasks: Parameters<typeof db.task.create>[0]["data"][] = [
    { title: "עיצוב דף הבית", assigneeId: dana.id, projectId: site.id, status: "IN_PROGRESS", priority: "HIGH", dueDate: day(2) },
    { title: "חיבור טופס צור קשר", assigneeId: yossi.id, projectId: site.id, status: "TODO", dueDate: day(1) },
    { title: "בדיקות נגישות", assigneeId: yossi.id, projectId: site.id, status: "TODO", priority: "LOW", dueDate: day(12) },
    { title: "תיקון באג בהתחברות", assigneeId: dana.id, status: "BLOCKED", priority: "URGENT", dueDate: day(-2) },
    { title: "תכנון חלוקת עמדות", assigneeId: michal.id, projectId: office.id, status: "IN_PROGRESS", dueDate: day(5) },
    { title: "תיאום חברת הובלה", assigneeId: avi.id, projectId: office.id, status: "TODO", priority: "HIGH", dueDate: day(-1) },
    { title: "קמפיין השקה", assigneeId: noa.id, projectId: site.id, status: "TODO", dueDate: day(20) },
    { title: "הצעות מחיר לריהוט", assigneeId: omer.id, projectId: office.id, status: "IN_PROGRESS" },
    { title: "עדכון נהלי עבודה", status: "TODO" },
    { title: "הגדרת דומיין", assigneeId: yossi.id, projectId: site.id, status: "DONE", completedAt: new Date() },
  ];
  for (const data of tasks) await db.task.create({ data });

  await db.equipmentRequest.createMany({
    data: [
      { item: "מסך 27 אינץ'", quantity: 2, estCost: 1400, requesterId: dana.id, projectId: site.id, status: "PENDING", notes: "לעמדת העיצוב" },
      { item: "מקלדת ועכבר אלחוטיים", quantity: 1, estCost: 250, requesterId: yossi.id, status: "APPROVED", approvedAt: new Date(), neededBy: day(7) },
      { item: "ארגזי מעבר", quantity: 40, estCost: 600, requesterId: avi.id, projectId: office.id, status: "APPROVED", approvedAt: new Date(), neededBy: day(10) },
      { item: "מדפסת לייזר", quantity: 1, estCost: 1200, requesterId: michal.id, projectId: office.id, status: "ORDERED", orderedAt: new Date() },
      { item: "אוזניות", quantity: 1, requesterId: noa.id, status: "RECEIVED", receivedAt: new Date() },
    ],
  });

  await db.meetingRequest.createMany({
    data: [
      { topic: "תיאום תוכן לאתר", requesterId: dana.id, withTeamId: marketing.id, neededBy: day(4) },
      { topic: "תקציב ריהוט", requesterId: michal.id, withTeamId: purchasing.id, status: "SCHEDULED" },
      { topic: "דרישות IT למשרד החדש", requesterId: avi.id, withTeamId: dev.id, neededBy: day(9) },
    ],
  });

  await db.settings.create({ data: { id: 1, managerName: "המנהל", managerEmail: "manager@example.com" } });

  console.log("Seeded. Worker links:");
  for (const w of workers) console.log(`  ${w.name}: /w/${w.token}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
