import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { EQUIPMENT_STATUS, MEETING_STATUS, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { groupTasks, type ReportTask } from "@/lib/report";
import { Badge, Flash, Options } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { requestEquipment, requestMeeting, updateMyTask } from "./actions";

export const dynamic = "force-dynamic";
// The personal link is a secret: keep it out of search engines and referrers.
export const metadata: Metadata = { title: "המשימות שלי", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function WorkerPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const { token } = await params;
  const { msg, error } = await searchParams;
  const w = await db.worker.findUnique({
    where: { token },
    include: {
      team: true,
      tasks: { where: { status: { not: "DONE" } }, include: { project: true, updates: { orderBy: { createdAt: "desc" }, take: 1 } } },
      equipment: { orderBy: { createdAt: "desc" }, take: 15 },
      meetings: { include: { withTeam: true }, orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!w || !w.active) notFound();

  const [teams, projects, recentDone] = await Promise.all([
    db.team.findMany({ where: { id: { not: w.teamId ?? -1 } }, orderBy: { name: "asc" } }),
    db.project.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.task.findMany({ where: { assigneeId: w.id, status: "DONE" }, orderBy: { completedAt: "desc" }, take: 5 }),
  ]);

  const byId = new Map(w.tasks.map((t) => [t.id, t]));
  const groups = groupTasks(
    w.tasks.map<ReportTask>((t) => ({ id: t.id, title: t.title, projectName: t.project?.name ?? null, status: t.status, priority: t.priority, dueDate: t.dueDate })),
    todayLocal(),
  );
  const sections: [string, ReportTask[], boolean][] = [
    ["באיחור", groups.overdue, true],
    ["להיום", groups.dueToday, false],
    ["השבוע הקרוב", groups.thisWeek, false],
    ["בהמשך", groups.later, false],
    ["ללא תאריך יעד", groups.noDate, false],
  ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">שלום {w.name} 👋</span>
          <span className="muted small" style={{ flex: 1 }}>{w.team ? `צוות ${w.team.name}` : ""}</span>
          <Link href={`/?w=${token}`} className="btn ghost sm">ללוח המשותף</Link>
        </div>
      </header>
      <main className="container">
        <Flash msg={msg} error={error} />

        <h1>המשימות שלי ({w.tasks.length})</h1>
        {w.tasks.length === 0 && <div className="card empty">אין לך משימות פתוחות כרגע.</div>}

        {sections.map(([title, list, late]) =>
          list.length ? (
            <section key={title} style={{ marginBottom: "1.25rem" }}>
              <h2 className={late ? "danger-text" : ""}>{title} ({list.length})</h2>
              <div className="task-list">
                {list.map((rt) => {
                  const t = byId.get(rt.id)!;
                  return (
                    <div key={t.id} className={`task-item${late ? " overdue" : ""}`}>
                      <div className="spread">
                        <strong>{t.title}</strong>
                        <div className="row">
                          <Badge value={t.priority} label={`עדיפות ${PRIORITY[t.priority]}`} />
                          <Badge value={t.status} label={TASK_STATUS[t.status]} />
                        </div>
                      </div>
                      <div className="muted small">
                        {t.project && <>פרויקט: {t.project.name} · </>}
                        תאריך יעד: {t.dueDate ? formatDate(t.dueDate) : "לא נקבע"}
                      </div>
                      {t.description && <p className="pre" style={{ margin: ".4rem 0" }}>{t.description}</p>}
                      {t.updates[0]?.comment && (
                        <div className="muted small">עדכון אחרון: “{t.updates[0].comment}” ({formatDateTime(t.updates[0].createdAt)})</div>
                      )}
                      <form action={updateMyTask} className="row" style={{ marginTop: ".5rem" }}>
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="taskId" value={t.id} />
                        <select name="status" defaultValue={t.status} style={{ width: "auto" }} aria-label="סטטוס">
                          <Options map={TASK_STATUS} />
                        </select>
                        <input name="comment" placeholder="הערה (לא חובה)" style={{ flex: 1, minWidth: 160 }} />
                        <SubmitButton className="btn sm">עדכון</SubmitButton>
                      </form>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null,
        )}

        {recentDone.length > 0 && (
          <details className="card">
            <summary>הושלמו לאחרונה ({recentDone.length})</summary>
            <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
              {recentDone.map((t) => (
                <li key={t.id}>{t.title} <span className="muted small">· {formatDateTime(t.completedAt)}</span></li>
              ))}
            </ul>
          </details>
        )}

        <div className="grid grid-2" style={{ marginTop: "1rem" }}>
          <section className="card">
            <h2>בקשת ציוד</h2>
            <form action={requestEquipment} className="stack">
              <input type="hidden" name="token" value={token} />
              <div className="fields">
                <label>מה צריך?<input name="item" required /></label>
                <label>כמות<input name="quantity" type="number" min={1} defaultValue={1} /></label>
                <label>נדרש עד<input name="neededBy" type="date" /></label>
                <label>מחיר משוער (₪)<input name="estCost" type="number" min={0} step="0.01" /></label>
              </div>
              <label>
                פרויקט
                <select name="projectId" defaultValue="">
                  <option value="">— ללא —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label>קישור למוצר (לא חובה)<input name="link" type="url" dir="ltr" placeholder="https://" /></label>
              <label>הערות<textarea name="notes" /></label>
              <div><SubmitButton>שליחה לאישור המנהל</SubmitButton></div>
            </form>
            {w.equipment.length > 0 && (
              <>
                <h3 style={{ marginTop: "1rem" }}>הבקשות שלי</h3>
                <table>
                  <tbody>
                    {w.equipment.map((e) => (
                      <tr key={e.id}>
                        <td>{e.item} × {e.quantity}{e.managerNote && <div className="muted small">מנהל: {e.managerNote}</div>}</td>
                        <td className="nowrap"><Badge value={e.status} label={EQUIPMENT_STATUS[e.status]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <section className="card">
            <h2>צריך פגישה עם צוות אחר?</h2>
            <form action={requestMeeting} className="stack">
              <input type="hidden" name="token" value={token} />
              <label>נושא<input name="topic" required /></label>
              <div className="fields">
                <label>
                  עם צוות
                  <select name="withTeamId" defaultValue="">
                    <option value="">— לבחור —</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label>נדרש עד<input name="neededBy" type="date" /></label>
              </div>
              <label>פרטים<textarea name="notes" placeholder="מה צריך לסגור, מי צריך להשתתף…" /></label>
              <div><SubmitButton>רישום</SubmitButton></div>
            </form>
            {w.meetings.length > 0 && (
              <>
                <h3 style={{ marginTop: "1rem" }}>הבקשות שלי</h3>
                <table>
                  <tbody>
                    {w.meetings.map((m) => (
                      <tr key={m.id}>
                        <td>{m.topic}{m.withTeam && <span className="muted small"> · {m.withTeam.name}</span>}</td>
                        <td className="nowrap"><Badge value={m.status} label={MEETING_STATUS[m.status]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        </div>
        <p className="muted small">זהו קישור אישי – לא לשתף אותו. מי שמחזיק בקישור יכול לעדכן את המשימות שלך.</p>
      </main>
    </>
  );
}
