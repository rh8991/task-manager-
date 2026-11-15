import { useState } from "react";
import { ActForm } from "@/components/ActForm";
import { Link, useSearchParams } from "react-router";
import { byId, useCollection } from "@/lib/data";
import { OPEN_TASKS } from "@/lib/queries";
import { formatDate, todayLocal } from "@/lib/dates";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { createTask, setTaskStatus } from "@/lib/actions";
import { PRIORITIES, TASK_STATUSES, type Project, type Task, type Worker } from "@/lib/types";
import { oneOf, optDate, optStr, str } from "@/lib/formdata";
import { Badge, Options } from "@/components/ui";
import { useAct } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { ReviewsEditor } from "@/components/Reviews";
import { parseReviewField } from "@/lib/reviews";

export function TasksPage() {
  const act = useAct();
  const [sp, setSp] = useSearchParams();
  const [editorKey, setEditorKey] = useState(0); // re-mount the reviews editor after a save
  const today = todayLocal();
  const workers = useCollection<Worker>("workers");
  const projects = useCollection<Project>("projects");
  const workerMap = byId(workers.data);
  const projectMap = byId(projects.data);
  const activeWorkers = workers.data.filter((w) => w.active).sort((a, b) => a.name.localeCompare(b.name, "he"));
  const activeProjects = projects.data.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, "he"));

  const status = sp.get("status") ?? "open";
  // Finished tasks pile up over time: load them only when the filter asks for them.
  const needsDone = status === "all" || status === "DONE";
  const tasks = useCollection<Task>("tasks", needsDone ? (status === "DONE" ? { where: ["status", "==", "DONE"] } : {}) : OPEN_TASKS);
  const assignee = sp.get("assignee") ?? "";
  const project = sp.get("project") ?? "";
  const q = (sp.get("q") ?? "").toLowerCase();

  const list = tasks.data
    .filter((t) => (status === "open" ? t.status !== "DONE" : status === "all" ? true : t.status === status))
    .filter((t) => (assignee === "none" ? !t.assigneeId : assignee ? t.assigneeId === assignee : true))
    .filter((t) => (project ? t.projectId === project : true))
    .filter((t) => (q ? t.title.toLowerCase().includes(q) : true))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || b.createdAt - a.createdAt);

  const onCreate = act(async (fd: FormData) => {
    const assigneeId = optStr(fd, "assigneeId");
    await createTask({
      title: str(fd, "title"),
      description: optStr(fd, "description"),
      priority: oneOf(fd, "priority", PRIORITIES) ?? "MEDIUM",
      dueDate: optDate(fd, "dueDate"),
      projectId: optStr(fd, "projectId"),
      assigneeId,
      reviews: parseReviewField(fd.get("reviews")),
    });
    setEditorKey((k) => k + 1);
    return assigneeId ? "המשימה נוצרה. העובד/ת יקבל/תקבל מייל בדקות הקרובות." : "המשימה נוצרה";
  });
  const onStatus = act(async (fd: FormData) => {
    const t = tasks.data.find((x) => x.id === str(fd, "id"));
    const s = oneOf(fd, "status", TASK_STATUSES);
    if (t && s) await setTaskStatus(t.id, s, t.status);
  }, "הסטטוס עודכן");

  const filtered = !!(sp.get("q") || sp.get("assignee") || sp.get("project") || sp.get("status"));

  return (
    <>
      <h1>משימות</h1>

      <details className="card" id="new" open={sp.get("new") === "1" || (!tasks.loading && tasks.data.length === 0) || undefined}>
        <summary>+ משימה חדשה</summary>
        <ActForm action={onCreate} className="stack">
          <label>כותרת<input name="title" required placeholder="מה צריך לעשות?" /></label>
          <label>תיאור<textarea name="description" placeholder="פרטים נוספים (לא חובה)" /></label>
          <div className="fields">
            <label>
              עובד/ת אחראי/ת
              <select name="assigneeId" defaultValue="">
                <option value="">— ללא —</option>
                {activeWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label>
              פרויקט
              <select name="projectId" defaultValue="">
                <option value="">— ללא —</option>
                {activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>תאריך יעד<input type="date" name="dueDate" min={today} /></label>
            <label>
              עדיפות
              <select name="priority" defaultValue="MEDIUM"><Options map={PRIORITY} /></select>
            </label>
          </div>
          <ReviewsEditor key={editorKey} />
          <div className="row">
            <SubmitButton>יצירת משימה</SubmitButton>
            <span className="muted small">העובד/ת יקבל/תקבל מייל על המשימה החדשה (תוך כ-10 דקות).</span>
          </div>
        </ActForm>
      </details>

      <form
        className="card row"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const next = new URLSearchParams();
          for (const k of ["q", "status", "assignee", "project"]) {
            const v = str(fd, k);
            if (v) next.set(k, v);
          }
          setSp(next);
        }}
      >
        <input name="q" defaultValue={sp.get("q") ?? ""} placeholder="חיפוש…" style={{ maxWidth: 200 }} />
        <select name="status" defaultValue={status} style={{ maxWidth: 160 }}>
          <option value="open">כל הפתוחות</option>
          <option value="all">הכול (כולל הושלמו)</option>
          <Options map={TASK_STATUS} />
        </select>
        <select name="assignee" defaultValue={assignee} style={{ maxWidth: 180 }}>
          <option value="">כל העובדים</option>
          <option value="none">ללא אחראי</option>
          {activeWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select name="project" defaultValue={project} style={{ maxWidth: 180 }}>
          <option value="">כל הפרויקטים</option>
          {activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn secondary">סינון</button>
        {filtered && <Link to="/admin/tasks" className="small">ניקוי</Link>}
      </form>

      <section className="card">
        <p className="muted small" style={{ marginTop: 0 }}>{list.length} משימות</p>
        {tasks.loading ? (
          <p className="muted">טוען…</p>
        ) : list.length === 0 ? (
          <p className="empty">אין משימות להצגה</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>משימה</th><th>עובד/ת</th><th>פרויקט</th><th>עדיפות</th><th>יעד</th><th>סטטוס</th></tr></thead>
              <tbody>
                {list.map((t) => {
                  const late = t.status !== "DONE" && !!t.dueDate && t.dueDate < today;
                  return (
                    <tr key={t.id} className={late ? "overdue" : ""}>
                      <td><Link to={`/admin/tasks/${t.id}`}>{t.title}</Link></td>
                      <td>{(t.assigneeId && workerMap.get(t.assigneeId)?.name) ?? <span className="muted">—</span>}</td>
                      <td className="muted">{(t.projectId && projectMap.get(t.projectId)?.name) ?? "—"}</td>
                      <td><Badge value={t.priority} label={PRIORITY[t.priority]} /></td>
                      <td className={`nowrap ${late ? "danger-text" : ""}`}>{formatDate(t.dueDate) || "—"}</td>
                      <td>
                        <ActForm action={onStatus} className="inline-form">
                          <input type="hidden" name="id" value={t.id} />
                          <select name="status" defaultValue={t.status} key={t.status} aria-label="סטטוס">
                            <Options map={TASK_STATUS} />
                          </select>
                          <SubmitButton className="btn ghost sm">עדכון</SubmitButton>
                        </ActForm>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

