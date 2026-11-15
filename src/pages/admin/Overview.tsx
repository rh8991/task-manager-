import { Link } from "react-router";
import { byId, useCollection } from "@/lib/data";
import { OPEN_TASKS } from "@/lib/queries";
import { formatDate, todayLocal } from "@/lib/dates";
import { EQUIPMENT_STATUS, MEETING_STATUS, TASK_STATUS } from "@/lib/labels";
import { setEquipmentStatus } from "@/lib/actions";
import type { EquipmentRequest, MeetingRequest, Task, TaskUpdate, Team, Worker } from "@/lib/types";
import { Badge, Stat } from "@/components/ui";
import { useAct } from "@/components/Flash";

export function Overview() {
  const act = useAct();
  const today = todayLocal();
  const tasks = useCollection<Task>("tasks", OPEN_TASKS);
  const workers = useCollection<Worker>("workers");
  const teams = useCollection<Team>("teams");
  const equipment = useCollection<EquipmentRequest>("equipment", { where: ["status", "in", ["PENDING", "APPROVED"]] });
  const meetings = useCollection<MeetingRequest>("meetings", { where: ["status", "==", "OPEN"] });
  const updates = useCollection<TaskUpdate>("taskUpdates", { orderBy: ["createdAt", "desc"], limit: 10 });
  const workerMap = byId(workers.data);
  const teamMap = byId(teams.data);
  const taskMap = byId(tasks.data);

  const count = (s: Task["status"]) => tasks.data.filter((t) => t.status === s).length;
  const open = tasks.data.filter((t) => t.status !== "DONE");
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const pending = equipment.data.filter((e) => e.status === "PENDING").sort((a, b) => a.createdAt - b.createdAt);
  const toOrder = equipment.data.filter((e) => e.status === "APPROVED").length;
  const openMeetings = meetings.data.filter((m) => m.status === "OPEN").sort((a, b) => a.createdAt - b.createdAt).slice(0, 8);
  const activeWorkers = workers.data.filter((w) => w.active).sort((a, b) => a.name.localeCompare(b.name, "he"));
  const approve = act((id: string, status: "APPROVED" | "REJECTED") => setEquipmentStatus(id, status), "הסטטוס עודכן");

  return (
    <>
      <div className="spread">
        <h1>סקירה כללית</h1>
        <Link to="/admin/tasks?new=1" className="btn">+ משימה חדשה</Link>
      </div>

      <div className="stats">
        <Stat num={count("TODO")} label="לביצוע" />
        <Stat num={count("IN_PROGRESS")} label="בתהליך" />
        <Stat num={count("BLOCKED")} label="תקועות" alert={count("BLOCKED") > 0} />
        <Stat num={overdue.length} label="באיחור" alert={overdue.length > 0} />
        <Stat num={pending.length} label="ציוד ממתין לאישור" alert={pending.length > 0} />
        <Stat num={toOrder} label="ציוד להזמנה" />
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
                <thead><tr><th>משימה</th><th>עובד/ת</th><th>יעד</th><th>סטטוס</th></tr></thead>
                <tbody>
                  {overdue.slice(0, 15).map((t) => (
                    <tr key={t.id} className="overdue">
                      <td><Link to={`/admin/tasks/${t.id}`}>{t.title}</Link></td>
                      <td>{(t.assigneeId && workerMap.get(t.assigneeId)?.name) ?? <span className="muted">לא שויך</span>}</td>
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
          {pending.length === 0 ? (
            <p className="empty">אין בקשות ממתינות</p>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {pending.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.item}</strong> × {e.quantity}
                        <div className="muted small">{e.requesterId && workerMap.get(e.requesterId)?.name}</div>
                      </td>
                      <td className="nowrap">
                        <button className="btn sm" onClick={() => approve(e.id, "APPROVED")}>אישור</button>{" "}
                        <button className="btn danger sm" onClick={() => approve(e.id, "REJECTED")}>דחייה</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small" style={{ marginBottom: 0 }}><Link to="/admin/equipment">לכל הזמנות הציוד ←</Link></p>
        </section>

        <section className="card">
          <h2>עומס לפי עובד</h2>
          {activeWorkers.length === 0 ? (
            <p className="empty">עוד אין עובדים. <Link to="/admin/workers">הוספת עובדים</Link></p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>עובד/ת</th><th>צוות</th><th>פתוחות</th><th>בתהליך</th><th>באיחור</th></tr></thead>
                <tbody>
                  {activeWorkers.map((w) => {
                    const mine = open.filter((t) => t.assigneeId === w.id);
                    const late = mine.filter((t) => t.dueDate && t.dueDate < today).length;
                    return (
                      <tr key={w.id}>
                        <td><Link to={`/admin/tasks?assignee=${w.id}`}>{w.name}</Link></td>
                        <td className="muted">{(w.teamId && teamMap.get(w.teamId)?.name) ?? "—"}</td>
                        <td>{mine.length}</td>
                        <td>{mine.filter((t) => t.status === "IN_PROGRESS").length}</td>
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
                  {m.withTeamId && <> – עם צוות {teamMap.get(m.withTeamId)?.name}</>}
                  <span className="muted small">
                    {" "}· {(m.requesterId && workerMap.get(m.requesterId)?.name) ?? "מנהל"}
                    {m.neededBy && ` · עד ${formatDate(m.neededBy)}`}
                  </span>{" "}
                  <Badge value={m.status} label={MEETING_STATUS[m.status]} />
                </li>
              ))}
            </ul>
          )}
          <p className="small" style={{ marginBottom: 0 }}><Link to="/admin/meetings">לכל הפגישות ←</Link></p>
        </section>
      </div>

      <section className="card">
        <h2>עדכונים אחרונים</h2>
        {updates.data.length === 0 ? (
          <p className="empty">עוד אין עדכונים</p>
        ) : (
          <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
            {updates.data.map((u) => {
              const title = taskMap.get(u.taskId)?.title ?? "משימה שנמחקה";
              return (
                <li key={u.id} style={{ marginBottom: ".35rem" }}>
                  <strong>{(u.workerId && workerMap.get(u.workerId)?.name) ?? "מנהל"}</strong>{" "}
                  {u.newStatus ? (
                    <>שינה/תה את <Link to={`/admin/tasks/${u.taskId}`}>{title}</Link> ל<Badge value={u.newStatus} label={TASK_STATUS[u.newStatus]} /></>
                  ) : (
                    <>הגיב/ה על <Link to={`/admin/tasks/${u.taskId}`}>{title}</Link></>
                  )}
                  {u.comment && <span className="muted"> – “{u.comment}”</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="muted small">{EQUIPMENT_STATUS.APPROVED} = פריטים שאושרו ועדיין לא הוזמנו.</p>
    </>
  );
}
