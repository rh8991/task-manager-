import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { dateKey, formatDateTime } from "@/lib/dates";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { Badge, Flash, Options } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteTask, resendTaskEmail, updateTask } from "../../actions";

export default async function TaskDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const { id } = await params;
  const { msg, error } = await searchParams;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) notFound();

  const [task, workers, projects] = await Promise.all([
    db.task.findUnique({
      where: { id: taskId },
      include: { assignee: true, project: true, updates: { include: { worker: true }, orderBy: { createdAt: "desc" } } },
    }),
    db.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.project.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
  ]);
  if (!task) notFound();

  return (
    <>
      <p className="small"><Link href="/admin/tasks">→ חזרה למשימות</Link></p>
      <div className="spread">
        <h1>{task.title}</h1>
        <Badge value={task.status} label={TASK_STATUS[task.status]} />
      </div>
      <Flash msg={msg} error={error} />

      <div className="grid grid-2">
        <section className="card">
          <h2>עריכת משימה</h2>
          <form action={updateTask} className="stack">
            <input type="hidden" name="id" value={task.id} />
            <label>
              כותרת
              <input name="title" required defaultValue={task.title} />
            </label>
            <label>
              תיאור
              <textarea name="description" defaultValue={task.description ?? ""} />
            </label>
            <div className="fields">
              <label>
                עובד/ת אחראי/ת
                <select name="assigneeId" defaultValue={task.assigneeId ?? ""}>
                  <option value="">— ללא —</option>
                  {task.assignee && !task.assignee.active && <option value={task.assignee.id}>{task.assignee.name} (לא פעיל/ה)</option>}
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </label>
              <label>
                פרויקט
                <select name="projectId" defaultValue={task.projectId ?? ""}>
                  <option value="">— ללא —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (בארכיון)"}</option>
                  ))}
                </select>
              </label>
              <label>
                סטטוס
                <select name="status" defaultValue={task.status}>
                  <Options map={TASK_STATUS} />
                </select>
              </label>
              <label>
                עדיפות
                <select name="priority" defaultValue={task.priority}>
                  <Options map={PRIORITY} />
                </select>
              </label>
              <label>
                תאריך יעד
                <input type="date" name="dueDate" defaultValue={dateKey(task.dueDate) ?? ""} />
              </label>
            </div>
            <label>
              הערה להיסטוריה (לא חובה)
              <input name="comment" placeholder="למשל: הוחלט לדחות בשבוע" />
            </label>
            <div className="row">
              <SubmitButton>שמירה</SubmitButton>
              <span className="muted small">שינוי אחראי שולח מייל לעובד/ת החדש/ה.</span>
            </div>
          </form>
        </section>

        <section className="card">
          <h2>היסטוריה ועדכונים</h2>
          {task.updates.length === 0 ? (
            <p className="empty">אין עדכונים עדיין</p>
          ) : (
            <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
              {task.updates.map((u) => (
                <li key={u.id} style={{ marginBottom: ".5rem" }}>
                  <strong>{u.worker?.name ?? "מנהל"}</strong>{" "}
                  {u.newStatus && (
                    <>
                      {u.oldStatus && <><Badge value={u.oldStatus} label={TASK_STATUS[u.oldStatus]} /> ← </>}
                      <Badge value={u.newStatus} label={TASK_STATUS[u.newStatus]} />
                    </>
                  )}
                  {u.comment && <div className="pre">{u.comment}</div>}
                  <div className="muted small">{formatDateTime(u.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">נוצרה: {formatDateTime(task.createdAt)}{task.completedAt && ` · הושלמה: ${formatDateTime(task.completedAt)}`}</p>
          <div className="row">
            {task.assignee && (
              <form action={resendTaskEmail}>
                <input type="hidden" name="id" value={task.id} />
                <SubmitButton className="btn secondary sm">שליחת המייל שוב ל{task.assignee.name}</SubmitButton>
              </form>
            )}
            <form action={deleteTask}>
              <input type="hidden" name="id" value={task.id} />
              <SubmitButton className="btn danger sm" confirm="למחוק את המשימה?">מחיקת משימה</SubmitButton>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
