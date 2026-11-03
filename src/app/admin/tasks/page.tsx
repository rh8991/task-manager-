import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { dateKey, formatDate, todayLocal } from "@/lib/dates";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { Badge, Flash, Options } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createTask, setTaskStatus } from "../actions";

type SP = { msg?: string; error?: string; status?: string; assignee?: string; project?: string; q?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = todayLocal();

  const where: Prisma.TaskWhereInput = {};
  if (sp.status === "open" || !sp.status) where.status = { not: "DONE" };
  else if (sp.status in TASK_STATUS) where.status = sp.status as keyof typeof TASK_STATUS;
  if (sp.assignee === "none") where.assigneeId = null;
  else if (sp.assignee) where.assigneeId = Number(sp.assignee);
  if (sp.project) where.projectId = Number(sp.project);
  if (sp.q) where.title = { contains: sp.q, mode: "insensitive" };

  const [tasks, workers, projects] = await Promise.all([
    db.task.findMany({
      where,
      include: { assignee: true, project: true },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 300,
    }),
    db.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.project.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !["msg", "error"].includes(k)) as [string, string][]).toString();
  const backPath = `/admin/tasks${qs ? `?${qs}` : ""}`;

  return (
    <>
      <h1>משימות</h1>
      <Flash msg={sp.msg} error={sp.error} />

      <details className="card" id="new" open={tasks.length === 0 || undefined}>
        <summary>+ משימה חדשה</summary>
        <form action={createTask} className="stack">
          <input type="hidden" name="back" value="/admin/tasks" />
          <label>
            כותרת
            <input name="title" required placeholder="מה צריך לעשות?" />
          </label>
          <label>
            תיאור
            <textarea name="description" placeholder="פרטים נוספים (לא חובה)" />
          </label>
          <div className="fields">
            <label>
              עובד/ת אחראי/ת
              <select name="assigneeId" defaultValue="">
                <option value="">— ללא —</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <label>
              פרויקט
              <select name="projectId" defaultValue="">
                <option value="">— ללא —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label>
              תאריך יעד
              <input type="date" name="dueDate" min={today} />
            </label>
            <label>
              עדיפות
              <select name="priority" defaultValue="MEDIUM">
                <Options map={PRIORITY} />
              </select>
            </label>
          </div>
          <div className="row">
            <SubmitButton>יצירת משימה</SubmitButton>
            <span className="muted small">העובד/ת יקבל/תקבל מייל על המשימה החדשה.</span>
          </div>
        </form>
      </details>

      <form className="card row" method="get">
        <input name="q" defaultValue={sp.q} placeholder="חיפוש…" style={{ maxWidth: 200 }} />
        <select name="status" defaultValue={sp.status ?? "open"} style={{ maxWidth: 160 }}>
          <option value="open">כל הפתוחות</option>
          <option value="all">הכול (כולל הושלמו)</option>
          <Options map={TASK_STATUS} />
        </select>
        <select name="assignee" defaultValue={sp.assignee ?? ""} style={{ maxWidth: 180 }}>
          <option value="">כל העובדים</option>
          <option value="none">ללא אחראי</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <select name="project" defaultValue={sp.project ?? ""} style={{ maxWidth: 180 }}>
          <option value="">כל הפרויקטים</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="btn secondary">סינון</button>
        {qs && <Link href="/admin/tasks" className="small">ניקוי</Link>}
      </form>

      <section className="card">
        <p className="muted small" style={{ marginTop: 0 }}>{tasks.length} משימות</p>
        {tasks.length === 0 ? (
          <p className="empty">אין משימות להצגה</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>משימה</th><th>עובד/ת</th><th>פרויקט</th><th>עדיפות</th><th>יעד</th><th>סטטוס</th></tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const late = t.status !== "DONE" && t.dueDate && dateKey(t.dueDate)! < today;
                  return (
                    <tr key={t.id} className={late ? "overdue" : ""}>
                      <td><Link href={`/admin/tasks/${t.id}`}>{t.title}</Link></td>
                      <td>{t.assignee?.name ?? <span className="muted">—</span>}</td>
                      <td className="muted">{t.project?.name ?? "—"}</td>
                      <td><Badge value={t.priority} label={PRIORITY[t.priority]} /></td>
                      <td className={`nowrap ${late ? "danger-text" : ""}`}>{formatDate(t.dueDate) || "—"}</td>
                      <td>
                        <form action={setTaskStatus} className="inline-form">
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="back" value={backPath} />
                          <select name="status" defaultValue={t.status} aria-label="סטטוס">
                            <Options map={TASK_STATUS} />
                          </select>
                          <SubmitButton className="btn ghost sm">עדכון</SubmitButton>
                        </form>
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
