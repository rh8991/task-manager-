import { Link, useSearchParams } from "react-router";
import { byId, useCollection } from "@/lib/data";
import { dateKey, formatDate, todayLocal } from "@/lib/dates";
import { EQUIPMENT_STATUS, MEETING_STATUS, TASK_STATUS } from "@/lib/labels";
import type { EquipmentRequest, MeetingRequest, Project, Task, Team, Worker } from "@/lib/types";
import { Badge, Stat } from "@/components/ui";

/** Shared, read-only board: who is working on what, equipment to order, meetings needed. */
export function Dashboard() {
  const [sp] = useSearchParams();
  const tv = sp.get("tv") === "1";
  const teamId = sp.get("team");
  const myToken = sp.get("w");

  const teams = useCollection<Team>("teams");
  const workers = useCollection<Worker>("workers");
  const tasks = useCollection<Task>("tasks");
  const projects = useCollection<Project>("projects");
  const equipment = useCollection<EquipmentRequest>("equipment");
  const meetings = useCollection<MeetingRequest>("meetings");

  const today = todayLocal();
  const projectMap = byId(projects.data);
  const workerMap = byId(workers.data);
  const teamMap = byId(teams.data);
  const inTeam = (workerId: string | null) => !teamId || (workerId ? workerMap.get(workerId)?.teamId === teamId : false);

  const activeWorkers = workers.data
    .filter((w) => w.active && (!teamId || w.teamId === teamId))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
  const openTasks = tasks.data.filter((t) => t.status !== "DONE");
  const tasksOf = (wid: string) =>
    openTasks
      .filter((t) => t.assigneeId === wid)
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const allTasks = activeWorkers.flatMap((w) => tasksOf(w.id));
  const overdue = allTasks.filter((t) => t.dueDate && t.dueDate < today).length;
  const unassigned = teamId ? 0 : openTasks.filter((t) => !t.assigneeId).length;
  const weekAgo = Date.now() - 7 * 864e5;
  const doneThisWeek = tasks.data.filter((t) => t.status === "DONE" && (t.completedAt ?? 0) >= weekAgo && inTeam(t.assigneeId)).length;

  const toOrder = equipment.data
    .filter((e) => e.status === "APPROVED" && inTeam(e.requesterId))
    .sort((a, b) => (a.neededBy ?? "9999").localeCompare(b.neededBy ?? "9999"));
  const pendingEq = equipment.data.filter((e) => e.status === "PENDING" && inTeam(e.requesterId)).length;
  const ordered = equipment.data.filter((e) => e.status === "ORDERED" && inTeam(e.requesterId));
  const openMeetings = meetings.data
    .filter((m) => (m.status === "OPEN" || m.status === "SCHEDULED") && (!teamId || m.withTeamId === teamId || inTeam(m.requesterId)))
    .sort((a, b) => (a.neededBy ?? "9999").localeCompare(b.neededBy ?? "9999"));

  const link = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (myToken) p.set("w", myToken);
    if (tv) p.set("tv", "1");
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const loading = workers.loading || tasks.loading;
  const loadError = workers.error || tasks.error;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">לוח משימות משותף</span>
          <span className="muted small" style={{ flex: 1 }}>מתעדכן בזמן אמת · {formatDate(today)}</span>
          {myToken && <Link to={`/w/${myToken}`} className="btn ghost sm">המשימות שלי</Link>}
          {!tv && <Link to={link({ tv: "1", team: teamId })} className="btn ghost sm">מצב מסך</Link>}
          <Link to="/admin" className="btn ghost sm">ניהול</Link>
        </div>
      </header>
      <main className="container">
        {loadError && <div className="flash error">לא ניתן לטעון נתונים: {loadError}</div>}

        {teams.data.length > 0 && (
          <div className="row" style={{ marginBottom: "1rem" }}>
            <Link to={link({})} className={`btn sm ${!teamId ? "" : "ghost"}`}>כל הצוותים</Link>
            {[...teams.data].sort((a, b) => a.name.localeCompare(b.name, "he")).map((t) => (
              <Link key={t.id} to={link({ team: t.id })} className={`btn sm ${teamId === t.id ? "" : "ghost"}`}>{t.name}</Link>
            ))}
          </div>
        )}

        <div className="stats">
          <Stat num={allTasks.length} label="משימות פתוחות" />
          <Stat num={allTasks.filter((t) => t.status === "IN_PROGRESS").length} label="בתהליך" />
          <Stat num={overdue} label="באיחור" alert={overdue > 0} />
          <Stat num={allTasks.filter((t) => t.status === "BLOCKED").length} label="תקועות" alert={allTasks.some((t) => t.status === "BLOCKED")} />
          <Stat num={doneThisWeek} label="הושלמו ב-7 ימים" />
          <Stat num={toOrder.length} label="ציוד להזמנה" />
          <Stat num={openMeetings.filter((m) => m.status === "OPEN").length} label="פגישות נדרשות" />
        </div>
        {unassigned > 0 && <p className="muted small">+ {unassigned} משימות פתוחות שעדיין לא שויכו לעובד/ת.</p>}

        <h2>מי עובד על מה</h2>
        {loading ? (
          <p className="muted">טוען…</p>
        ) : activeWorkers.length === 0 ? (
          <div className="card empty">אין עובדים להצגה.</div>
        ) : (
          <div className="grid grid-3" style={{ marginBottom: "1.5rem" }}>
            {activeWorkers.map((w) => {
              const list = tasksOf(w.id);
              return (
                <section key={w.id} className="card" style={{ marginBottom: 0 }}>
                  <div className="spread">
                    <h3 style={{ margin: 0 }}>{w.name}</h3>
                    <span className="muted small">{w.teamId ? teamMap.get(w.teamId)?.name : ""}</span>
                  </div>
                  {list.length === 0 ? (
                    <p className="empty small">אין משימות פתוחות</p>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: ".5rem 0 0", display: "grid", gap: ".4rem" }}>
                      {list.slice(0, 6).map((t) => {
                        const late = !!t.dueDate && dateKey(t.dueDate)! < today;
                        const project = t.projectId ? projectMap.get(t.projectId)?.name : null;
                        return (
                          <li key={t.id} className="spread" style={{ gap: ".4rem", flexWrap: "nowrap" }}>
                            <span style={{ minWidth: 0 }}>
                              {t.title}
                              <span className={`small ${late ? "danger-text" : "muted"}`}>
                                {t.dueDate && ` · ${formatDate(t.dueDate)}`}
                                {project && ` · ${project}`}
                              </span>
                            </span>
                            <Badge value={t.status} label={TASK_STATUS[t.status]} />
                          </li>
                        );
                      })}
                      {list.length > 6 && <li className="muted small">ועוד {list.length - 6}…</li>}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <div className="grid grid-2">
          <section className="card">
            <h2>ציוד – מה צריך להזמין</h2>
            {pendingEq > 0 && <p className="muted small" style={{ marginTop: 0 }}>{pendingEq} בקשות נוספות ממתינות לאישור מנהל.</p>}
            {toOrder.length === 0 ? (
              <p className="empty">אין פריטים שמחכים להזמנה</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>פריט</th><th>כמות</th><th>עבור</th><th>נדרש עד</th></tr></thead>
                  <tbody>
                    {toOrder.map((e) => (
                      <tr key={e.id}>
                        <td>{e.item}{e.projectId && <div className="muted small">{projectMap.get(e.projectId)?.name}</div>}</td>
                        <td>{e.quantity}</td>
                        <td>{(e.requesterId && workerMap.get(e.requesterId)?.name) ?? "—"}</td>
                        <td className="nowrap">{formatDate(e.neededBy) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {ordered.length > 0 && (
              <>
                <h3 style={{ marginTop: "1rem" }}>הוזמן – בדרך</h3>
                <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
                  {ordered.map((e) => (
                    <li key={e.id}>
                      {e.item} × {e.quantity}{" "}
                      <span className="muted small">
                        · {(e.requesterId && workerMap.get(e.requesterId)?.name) ?? "מנהל"} · <Badge value={e.status} label={EQUIPMENT_STATUS[e.status]} />
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card">
            <h2>פגישות בין צוותים</h2>
            {openMeetings.length === 0 ? (
              <p className="empty">אין פגישות נדרשות</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>נושא</th><th>מי</th><th>עם צוות</th><th>עד</th><th>סטטוס</th></tr></thead>
                  <tbody>
                    {openMeetings.map((m) => {
                      const req = m.requesterId ? workerMap.get(m.requesterId) : null;
                      return (
                        <tr key={m.id}>
                          <td>{m.topic}</td>
                          <td>{req?.name ?? "מנהל"}{req?.teamId && <div className="muted small">{teamMap.get(req.teamId)?.name}</div>}</td>
                          <td>{(m.withTeamId && teamMap.get(m.withTeamId)?.name) ?? "—"}</td>
                          <td className="nowrap">{formatDate(m.neededBy) || "—"}</td>
                          <td><Badge value={m.status} label={MEETING_STATUS[m.status]} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
