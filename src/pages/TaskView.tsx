import { Link, useParams, useSearchParams } from "react-router";
import { useAdmin, useCollection, useDocument } from "@/lib/data";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { nextReview } from "@/lib/reviews";
import type { Project, Task, TaskUpdate, Team, Worker } from "@/lib/types";
import { Badge } from "@/components/ui";
import { ReviewList } from "@/components/Reviews";

/** Read-only view of one task, opened from the shared board. */
export function TaskView() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const w = sp.get("w");
  const back = w ? `/?w=${w}` : "/";
  const { isAdmin } = useAdmin();

  const task = useDocument<Task>(`tasks/${id}`);
  const t = task.data;
  const assignee = useDocument<Worker>(t?.assigneeId ? `workers/${t.assigneeId}` : null);
  const team = useDocument<Team>(assignee.data?.teamId ? `teams/${assignee.data.teamId}` : null);
  const project = useDocument<Project>(t?.projectId ? `projects/${t.projectId}` : null);
  const updates = useCollection<TaskUpdate>("taskUpdates", { where: ["taskId", "==", id] });
  const workers = useCollection<Worker>("workers");

  const header = (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to={back} className="brand">→ לוח משימות משותף</Link>
        <span style={{ flex: 1 }} />
        {isAdmin && t && <Link to={`/admin/tasks/${id}`} className="btn ghost sm">עריכה</Link>}
      </div>
    </header>
  );

  if (task.loading) return <>{header}<main className="container"><p className="muted">טוען…</p></main></>;
  if (!t) {
    return (
      <>
        {header}
        <main className="container"><div className="card"><h1>המשימה לא נמצאה</h1><p>ייתכן שהיא נמחקה.</p></div></main>
      </>
    );
  }

  const today = todayLocal();
  const late = t.status !== "DONE" && !!t.dueDate && t.dueDate < today;
  const next = nextReview(t.reviews);
  const history = [...updates.data].sort((a, b) => b.createdAt - a.createdAt);
  const who = (wid: string | null) => (wid && workers.data.find((x) => x.id === wid)?.name) || "מנהל";

  return (
    <>
      {header}
      <main className="container" style={{ maxWidth: 900 }}>
        <div className="spread">
          <h1 style={{ marginBottom: ".25rem" }}>{t.title}</h1>
          <div className="row">
            <Badge value={t.priority} label={`עדיפות ${PRIORITY[t.priority]}`} />
            <Badge value={t.status} label={TASK_STATUS[t.status]} />
          </div>
        </div>

        <div className="stats" style={{ marginTop: "1rem" }}>
          <div className="stat"><div className="lbl">אחראי/ת</div><div><strong>{assignee.data?.name ?? "לא שויך"}</strong>{team.data && <span className="muted small"> · {team.data.name}</span>}</div></div>
          <div className="stat"><div className="lbl">פרויקט</div><div><strong>{project.data?.name ?? "—"}</strong></div></div>
          <div className={`stat${late ? " alert" : ""}`}>
            <div className="lbl">תאריך יעד</div>
            <div className={late ? "danger-text" : ""}><strong>{t.dueDate ? formatDate(t.dueDate) : "לא נקבע"}</strong>{late && " · באיחור"}</div>
          </div>
          <div className="stat">
            <div className="lbl">ביקורת הבאה</div>
            <div><strong>{next ? formatDate(next.date) : "—"}</strong>{next?.note && <span className="muted small"> · {next.note}</span>}</div>
          </div>
        </div>

        {t.description && (
          <section className="card">
            <h2>תיאור</h2>
            <p className="pre" style={{ margin: 0 }}>{t.description}</p>
          </section>
        )}

        <section className="card">
          <h2>ביקורות בדרך לתאריך היעד</h2>
          <ReviewList reviews={t.reviews} dueDate={t.dueDate} />
        </section>

        <section className="card">
          <h2>עדכונים</h2>
          {history.length === 0 ? (
            <p className="empty">אין עדכונים עדיין</p>
          ) : (
            <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
              {history.map((u) => (
                <li key={u.id} style={{ marginBottom: ".5rem" }}>
                  <strong>{who(u.workerId)}</strong>{" "}
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
          <p className="muted small" style={{ marginBottom: 0 }}>
            נוצרה: {formatDateTime(t.createdAt)}
            {t.completedAt && ` · הושלמה: ${formatDateTime(t.completedAt)}`}
          </p>
        </section>
      </main>
    </>
  );
}
