import { Link, useNavigate, useParams } from "react-router";
import { ActForm } from "@/components/ActForm";
import { useCollection, useDocument } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { deleteTask, resendTaskEmail, setReviewDone, updateTask } from "@/lib/actions";
import { parseReviewField } from "@/lib/reviews";
import { ReviewList, ReviewsEditor } from "@/components/Reviews";
import { PRIORITIES, TASK_STATUSES, type Project, type Task, type TaskUpdate, type Worker } from "@/lib/types";
import { oneOf, optDate, optStr, str } from "@/lib/formdata";
import { Badge, Options } from "@/components/ui";
import { useAct } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export function TaskDetail() {
  const { id = "" } = useParams();
  const act = useAct();
  const navigate = useNavigate();
  const task = useDocument<Task>(`tasks/${id}`);
  const workers = useCollection<Worker>("workers");
  const projects = useCollection<Project>("projects");
  const updates = useCollection<TaskUpdate>("taskUpdates", { where: ["taskId", "==", id] });

  if (task.loading) return <p className="muted">טוען…</p>;
  const t = task.data;
  if (!t) return <><h1>המשימה לא נמצאה</h1><Link to="/admin/tasks">→ חזרה למשימות</Link></>;

  const workerName = (wid: string | null) => (wid && workers.data.find((w) => w.id === wid)?.name) || null;
  const assignee = t.assigneeId ? workers.data.find((w) => w.id === t.assigneeId) : undefined;
  const history = [...updates.data].sort((a, b) => b.createdAt - a.createdAt);

  const onSave = act(async (fd: FormData) => {
    const reassigned = await updateTask(t.id, {
      title: str(fd, "title"),
      description: optStr(fd, "description"),
      priority: oneOf(fd, "priority", PRIORITIES) ?? t.priority,
      status: oneOf(fd, "status", TASK_STATUSES) ?? t.status,
      dueDate: optDate(fd, "dueDate"),
      projectId: optStr(fd, "projectId"),
      assigneeId: optStr(fd, "assigneeId"),
      comment: optStr(fd, "comment"),
      reviews: parseReviewField(fd.get("reviews")),
    });
    return reassigned ? "המשימה עודכנה. העובד/ת החדש/ה יקבל/תקבל מייל בדקות הקרובות." : "המשימה עודכנה";
  });
  const onToggleReview = act(
    (r: { id: string; done: boolean }) => setReviewDone(t.id, r.id, !r.done),
    "הביקורת עודכנה",
  );
  const onResend = act(() => resendTaskEmail(t.id), "המייל ייצא שוב בדקות הקרובות");
  const onDelete = act(async () => {
    if (!window.confirm("למחוק את המשימה?")) return;
    await deleteTask(t.id);
    navigate("/admin/tasks");
  });

  return (
    <>
      <p className="small"><Link to="/admin/tasks">→ חזרה למשימות</Link></p>
      <div className="spread">
        <h1>{t.title}</h1>
        <div className="row">
          <Link to={`/task/${t.id}`} className="btn ghost sm">תצוגה</Link>
          <Badge value={t.status} label={TASK_STATUS[t.status]} />
        </div>
      </div>

      <section className="card">
        <h2>ביקורות בדרך לתאריך היעד</h2>
        <ReviewList reviews={t.reviews} dueDate={t.dueDate} onToggle={(r) => onToggleReview(r)} />
        <p className="muted small" style={{ marginBottom: 0 }}>מוסיפים, משנים או מוחקים תאריכי ביקורת בטופס העריכה למטה.</p>
      </section>

      <div className="grid grid-2">
        <section className="card">
          <h2>עריכת משימה</h2>
          {/* key: re-mount the form with fresh default values when the task changes */}
          <ActForm action={onSave} className="stack" key={t.updatedAt} keepValues>
            <label>כותרת<input name="title" required defaultValue={t.title} /></label>
            <label>תיאור<textarea name="description" defaultValue={t.description ?? ""} /></label>
            <div className="fields">
              <label>
                עובד/ת אחראי/ת
                <select name="assigneeId" defaultValue={t.assigneeId ?? ""}>
                  <option value="">— ללא —</option>
                  {assignee && !assignee.active && <option value={assignee.id}>{assignee.name} (לא פעיל/ה)</option>}
                  {workers.data.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label>
                פרויקט
                <select name="projectId" defaultValue={t.projectId ?? ""}>
                  <option value="">— ללא —</option>
                  {projects.data.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (בארכיון)"}</option>)}
                </select>
              </label>
              <label>סטטוס<select name="status" defaultValue={t.status}><Options map={TASK_STATUS} /></select></label>
              <label>עדיפות<select name="priority" defaultValue={t.priority}><Options map={PRIORITY} /></select></label>
              <label>תאריך יעד<input type="date" name="dueDate" defaultValue={t.dueDate ?? ""} /></label>
            </div>
            <ReviewsEditor initial={t.reviews} />
            <label>הערה להיסטוריה (לא חובה)<input name="comment" placeholder="למשל: הוחלט לדחות בשבוע" /></label>
            <div className="row">
              <SubmitButton>שמירה</SubmitButton>
              <span className="muted small">שינוי אחראי שולח מייל לעובד/ת החדש/ה.</span>
            </div>
          </ActForm>
        </section>

        <section className="card">
          <h2>היסטוריה ועדכונים</h2>
          {history.length === 0 ? (
            <p className="empty">אין עדכונים עדיין</p>
          ) : (
            <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
              {history.map((u) => (
                <li key={u.id} style={{ marginBottom: ".5rem" }}>
                  <strong>{workerName(u.workerId) ?? "מנהל"}</strong>{" "}
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
          <p className="muted small">
            נוצרה: {formatDateTime(t.createdAt)}
            {t.completedAt && ` · הושלמה: ${formatDateTime(t.completedAt)}`}
          </p>
          <div className="row">
            {assignee && <button className="btn secondary sm" onClick={() => onResend()}>שליחת המייל שוב ל{assignee.name}</button>}
            <button className="btn danger sm" onClick={() => onDelete()}>מחיקת משימה</button>
          </div>
        </section>
      </div>
    </>
  );
}
