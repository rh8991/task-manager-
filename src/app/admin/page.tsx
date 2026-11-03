import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate, todayLocal } from "@/lib/dates";
import { EQUIPMENT_STATUS, MEETING_STATUS, TASK_STATUS } from "@/lib/labels";
import { Badge, Flash, Stat } from "@/components/ui";
import { setEquipmentStatus } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { msg, error } = await searchParams;
  const today = new Date(`${todayLocal()}T00:00:00Z`);

  const [byStatus, overdue, workers, pendingEquipment, toOrderCount, openMeetings, recentUpdates] = await Promise.all([
    db.task.groupBy({ by: ["status"], _count: true }),
    db.task.findMany({
      where: { status: { not: "DONE" }, dueDate: { lt: today } },
      include: { assignee: true, project: true },
      orderBy: { dueDate: "asc" },
      take: 15,
    }),
    db.worker.findMany({
      where: { active: true },
      include: { team: true, tasks: { where: { status: { not: "DONE" } }, select: { status: true, dueDate: true } } },
      orderBy: { name: "asc" },
    }),
    db.equipmentRequest.findMany({ where: { status: "PENDING" }, include: { requester: true }, orderBy: { createdAt: "asc" } }),
    db.equipmentRequest.count({ where: { status: "APPROVED" } }),
    db.meetingRequest.findMany({ where: { status: "OPEN" }, include: { withTeam: true, requester: true }, orderBy: { createdAt: "asc" }, take: 8 }),
    db.taskUpdate.findMany({ include: { task: true, worker: true }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;

  return (
    <>
      <div className="spread">
        <h1>סקירה כללית</h1>
        <Link href="/admin/tasks#new" className="btn">
          + משימה חדשה
        </Link>
      </div>
      <Flash msg={msg} error={error} />

      <div className="stats">
        <Stat num={count("TODO")} label="לביצוע" />
        <Stat num={count("IN_PROGRESS")} label="בתהליך" />
        <Stat num={count("BLOCKED")} label="תקועות" alert={count("BLOCKED") > 0} />
        <Stat num={overdue.length} label="באיחור" alert={overdue.length > 0} />
        <Stat num={pendingEquipment.length} label="ציוד ממתין לאישור" alert={pendingEquipment.length > 0} />
        <Stat num={toOrderCount} label="ציוד להזמנה" />
        <Stat num={openMeetings.length} label="פגישות נדרשות" />
      </div>

      <div className="grid grid-2">
        <section className="card">
          <h2>משימות באיחור</h2>
          {overdue.length === 0 ? (
            <p className="empty">אין משימות באיחור 🎉</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>משימה</th><th>עובד/ת</th><th>יעד</th><th>סטטוס</th></tr>
                </thead>
                <tbody>
                  {overdue.map((t) => (
                    <tr key={t.id} className="overdue">
                      <td><Link href={`/admin/tasks/${t.id}`}>{t.title}</Link></td>
                      <td>{t.assignee?.name ?? <span className="muted">לא שויך</span>}</td>
                      <td className="nowrap danger-text">{formatDate(t.dueDate)}</td>
                      <td><Badge value={t.status} label={TASK_STATUS[t.status]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2>ציוד שממתין לאישורך</h2>
          {pendingEquipment.length === 0 ? (
            <p className="empty">אין בקשות ממתינות</p>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {pendingEquipment.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.item}</strong> × {e.quantity}
                        <div className="muted small">{e.requester?.name}</div>
                      </td>
                      <td className="nowrap">
                        <form action={setEquipmentStatus} className="inline-form">
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="status" value="APPROVED" />
                          <SubmitButton className="btn sm">אישור</SubmitButton>
                        </form>{" "}
                        <form action={setEquipmentStatus} className="inline-form">
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="status" value="REJECTED" />
                          <SubmitButton className="btn danger sm">דחייה</SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small" style={{ marginBottom: 0 }}>
            <Link href="/admin/equipment">לכל הזמנות הציוד ←</Link>
          </p>
        </section>

        <section className="card">
          <h2>עומס לפי עובד</h2>
          {workers.length === 0 ? (
            <p className="empty">
              עוד אין עובדים. <Link href="/admin/workers">הוספת עובדים</Link>
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>עובד/ת</th><th>צוות</th><th>פתוחות</th><th>בתהליך</th><th>באיחור</th></tr>
                </thead>
                <tbody>
                  {workers.map((w) => {
                    const late = w.tasks.filter((t) => t.dueDate && t.dueDate < today).length;
                    return (
                      <tr key={w.id}>
                        <td><Link href={`/admin/tasks?assignee=${w.id}`}>{w.name}</Link></td>
                        <td className="muted">{w.team?.name ?? "—"}</td>
                        <td>{w.tasks.length}</td>
                        <td>{w.tasks.filter((t) => t.status === "IN_PROGRESS").length}</td>
                        <td className={late ? "danger-text" : ""}>{late}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2>פגישות נדרשות</h2>
          {openMeetings.length === 0 ? (
            <p className="empty">אין צורך פתוח בפגישות</p>
          ) : (
            <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
              {openMeetings.map((m) => (
                <li key={m.id} style={{ marginBottom: ".4rem" }}>
                  <strong>{m.topic}</strong>
                  {m.withTeam && <> – עם צוות {m.withTeam.name}</>}
                  <span className="muted small"> · {m.requester?.name ?? "מנהל"}{m.neededBy && ` · עד ${formatDate(m.neededBy)}`}</span>{" "}
                  <Badge value={m.status} label={MEETING_STATUS[m.status]} />
                </li>
              ))}
            </ul>
          )}
          <p className="small" style={{ marginBottom: 0 }}>
            <Link href="/admin/meetings">לכל הפגישות ←</Link>
          </p>
        </section>
      </div>

      <section className="card">
        <h2>עדכונים אחרונים</h2>
        {recentUpdates.length === 0 ? (
          <p className="empty">עוד אין עדכונים</p>
        ) : (
          <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
            {recentUpdates.map((u) => (
              <li key={u.id} style={{ marginBottom: ".35rem" }}>
                <strong>{u.worker?.name ?? "מנהל"}</strong>{" "}
                {u.newStatus ? <>שינה/תה את <Link href={`/admin/tasks/${u.taskId}`}>{u.task.title}</Link> ל<Badge value={u.newStatus} label={TASK_STATUS[u.newStatus]} /></> : <>הגיב/ה על <Link href={`/admin/tasks/${u.taskId}`}>{u.task.title}</Link></>}
                {u.comment && <span className="muted"> – “{u.comment}”</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted small">{EQUIPMENT_STATUS.APPROVED} = פריטים שאושרו ועדיין לא הוזמנו.</p>
    </>
  );
}
