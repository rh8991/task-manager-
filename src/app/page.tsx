import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { dateKey, formatDate, todayLocal } from "@/lib/dates";
import { EQUIPMENT_STATUS, MEETING_STATUS, TASK_STATUS } from "@/lib/labels";
import { Badge, Flash, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "לוח משימות משותף", robots: { index: false, follow: false }, referrer: "no-referrer" };

type SP = { team?: string; w?: string; tv?: string; msg?: string; error?: string };

/**
 * Shared, read-only dashboard. Public by default; set DASHBOARD_PRIVATE=true to require
 * either the manager session or a worker's personal token (?w=...), which every email includes.
 */
async function canView(w?: string): Promise<boolean> {
  if (process.env.DASHBOARD_PRIVATE !== "true") return true;
  if (await isAdmin()) return true;
  if (!w) return false;
  return !!(await db.worker.findFirst({ where: { token: w, active: true }, select: { id: true } }));
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  if (!(await canView(sp.w))) {
    return (
      <main className="container" style={{ maxWidth: 520, paddingTop: "4rem" }}>
        <div className="card">
          <h1>לוח משימות</h1>
          <Flash error={sp.error} />
          <p>הלוח זמין דרך הקישור שמופיע במייל שקיבלת.</p>
          <Link href="/login">כניסת מנהל</Link>
        </div>
      </main>
    );
  }

  const today = todayLocal();
  const todayDate = new Date(`${today}T00:00:00Z`);
  const teamId = sp.team ? Number(sp.team) : null;
  const workerWhere: Prisma.WorkerWhereInput = { active: true, ...(teamId ? { teamId } : {}) };
  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (sp.w) p.set("w", sp.w);
    if (sp.tv) p.set("tv", sp.tv);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  const [teams, workers, unassigned, toOrder, pendingEq, orderedEq, meetings, doneThisWeek] = await Promise.all([
    db.team.findMany({ orderBy: { name: "asc" } }),
    db.worker.findMany({
      where: workerWhere,
      include: {
        team: true,
        tasks: {
          where: { status: { not: "DONE" } },
          include: { project: true },
          orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
        },
      },
      orderBy: { name: "asc" },
    }),
    teamId ? Promise.resolve(0) : db.task.count({ where: { assigneeId: null, status: { not: "DONE" } } }),
    db.equipmentRequest.findMany({
      where: { status: "APPROVED", ...(teamId ? { requester: { teamId } } : {}) },
      include: { requester: true, project: true },
      orderBy: [{ neededBy: { sort: "asc", nulls: "last" } }],
    }),
    db.equipmentRequest.count({ where: { status: "PENDING", ...(teamId ? { requester: { teamId } } : {}) } }),
    db.equipmentRequest.findMany({
      where: { status: "ORDERED", ...(teamId ? { requester: { teamId } } : {}) },
      include: { requester: true },
      orderBy: { orderedAt: "asc" },
    }),
    db.meetingRequest.findMany({
      where: {
        status: { in: ["OPEN", "SCHEDULED"] },
        ...(teamId ? { OR: [{ withTeamId: teamId }, { requester: { teamId } }] } : {}),
      },
      include: { withTeam: true, requester: { include: { team: true } } },
      orderBy: [{ neededBy: { sort: "asc", nulls: "last" } }],
    }),
    db.task.count({
      where: { status: "DONE", completedAt: { gte: new Date(Date.now() - 7 * 864e5) }, ...(teamId ? { assignee: { teamId } } : {}) },
    }),
  ]);

  const allTasks = workers.flatMap((w) => w.tasks);
  const overdue = allTasks.filter((t) => t.dueDate && t.dueDate < todayDate).length;
  const inProgress = allTasks.filter((t) => t.status === "IN_PROGRESS").length;
  const blocked = allTasks.filter((t) => t.status === "BLOCKED").length;

  return (
    <>
      {sp.tv && <meta httpEquiv="refresh" content="120" />}
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">לוח משימות משותף</span>
          <span className="muted small" style={{ flex: 1 }}>מתעדכן בזמן אמת · {formatDate(todayDate)}</span>
          {sp.w && <Link href={`/w/${sp.w}`} className="btn ghost sm">המשימות שלי</Link>}
          {!sp.tv && <Link href={keep({ tv: "1", team: sp.team ?? "" })} className="btn ghost sm">מצב מסך</Link>}
          <Link href="/admin" className="btn ghost sm">ניהול</Link>
        </div>
      </header>
      <main className="container">
        <Flash msg={sp.msg} error={sp.error} />

        {teams.length > 0 && (
          <div className="row" style={{ marginBottom: "1rem" }}>
            <Link href={keep({})} className={`btn sm ${!teamId ? "" : "ghost"}`}>כל הצוותים</Link>
            {teams.map((t) => (
              <Link key={t.id} href={keep({ team: String(t.id) })} className={`btn sm ${teamId === t.id ? "" : "ghost"}`}>{t.name}</Link>
            ))}
          </div>
        )}

        <div className="stats">
          <Stat num={allTasks.length} label="משימות פתוחות" />
          <Stat num={inProgress} label="בתהליך" />
          <Stat num={overdue} label="באיחור" alert={overdue > 0} />
          <Stat num={blocked} label="תקועות" alert={blocked > 0} />
          <Stat num={doneThisWeek} label="הושלמו ב-7 ימים" />
          <Stat num={toOrder.length} label="ציוד להזמנה" />
          <Stat num={meetings.filter((m) => m.status === "OPEN").length} label="פגישות נדרשות" />
        </div>
        {unassigned > 0 && <p className="muted small">+ {unassigned} משימות פתוחות שעדיין לא שויכו לעובד/ת.</p>}

        <h2>מי עובד על מה</h2>
        {workers.length === 0 ? (
          <div className="card empty">אין עובדים להצגה.</div>
        ) : (
          <div className="grid grid-3" style={{ marginBottom: "1.5rem" }}>
            {workers.map((w) => (
              <section key={w.id} className="card" style={{ marginBottom: 0 }}>
                <div className="spread">
                  <h3 style={{ margin: 0 }}>{w.name}</h3>
                  <span className="muted small">{w.team?.name}</span>
                </div>
                {w.tasks.length === 0 ? (
                  <p className="empty small">אין משימות פתוחות</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: ".5rem 0 0", display: "grid", gap: ".4rem" }}>
                    {w.tasks.slice(0, 6).map((t) => {
                      const late = t.dueDate && dateKey(t.dueDate)! < today;
                      return (
                        <li key={t.id} className="spread" style={{ gap: ".4rem", flexWrap: "nowrap" }}>
                          <span style={{ minWidth: 0 }}>
                            {t.title}
                            <span className={`small ${late ? "danger-text" : "muted"}`}>
                              {t.dueDate && ` · ${formatDate(t.dueDate)}`}
                              {t.project && ` · ${t.project.name}`}
                            </span>
                          </span>
                          <Badge value={t.status} label={TASK_STATUS[t.status]} />
                        </li>
                      );
                    })}
                    {w.tasks.length > 6 && <li className="muted small">ועוד {w.tasks.length - 6}…</li>}
                  </ul>
                )}
              </section>
            ))}
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
                        <td>{e.item}{e.project && <div className="muted small">{e.project.name}</div>}</td>
                        <td>{e.quantity}</td>
                        <td>{e.requester?.name ?? "—"}</td>
                        <td className="nowrap">{formatDate(e.neededBy) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {orderedEq.length > 0 && (
              <>
                <h3 style={{ marginTop: "1rem" }}>הוזמן – בדרך</h3>
                <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
                  {orderedEq.map((e) => (
                    <li key={e.id}>
                      {e.item} × {e.quantity} <span className="muted small">· {e.requester?.name ?? "מנהל"} · <Badge value={e.status} label={EQUIPMENT_STATUS[e.status]} /></span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card">
            <h2>פגישות בין צוותים</h2>
            {meetings.length === 0 ? (
              <p className="empty">אין פגישות נדרשות</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>נושא</th><th>מי</th><th>עם צוות</th><th>עד</th><th>סטטוס</th></tr></thead>
                  <tbody>
                    {meetings.map((m) => (
                      <tr key={m.id}>
                        <td>{m.topic}</td>
                        <td>{m.requester?.name ?? "מנהל"}{m.requester?.team && <div className="muted small">{m.requester.team.name}</div>}</td>
                        <td>{m.withTeam?.name ?? "—"}</td>
                        <td className="nowrap">{formatDate(m.neededBy) || "—"}</td>
                        <td><Badge value={m.status} label={MEETING_STATUS[m.status]} /></td>
                      </tr>
                    ))}
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
