import { Link, useParams } from "react-router";
import { byId, useCollection, useDocument } from "@/lib/data";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { EQUIPMENT_STATUS, MEETING_STATUS, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { groupTasks, type ReportTask } from "@/lib/report";
import { TASK_STATUSES, type EquipmentRequest, type MeetingRequest, type Project, type Task, type Team, type Worker, type WorkerLink } from "@/lib/types";
import { oneOf, optDate, optInt, optNum, optStr, optUrl, str } from "@/lib/formdata";
import { requestEquipment, requestMeeting, updateMyTask } from "@/lib/workerActions";
import { Badge, Options } from "@/components/ui";
import { FlashBox, useAct } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { UserError } from "@/lib/actions";

/** A worker's personal page, reached from the secret link in every email. No login. */
export function WorkerPage() {
  const { token = "" } = useParams();
  const link = useDocument<WorkerLink>(token ? `workerLinks/${token}` : null);
  const workerId = link.data?.workerId ?? null;
  const worker = useDocument<Worker>(workerId ? `workers/${workerId}` : null);

  if (link.loading || worker.loading) return <main className="container"><p className="muted">טוען…</p></main>;
  if (!workerId || !worker.data || !worker.data.active) {
    return (
      <main className="container" style={{ maxWidth: 520, paddingTop: "4rem" }}>
        <div className="card">
          <h1>הקישור האישי לא תקף</h1>
          <p>ייתכן שהמנהל יצר לך קישור חדש. השתמשו בקישור מהמייל האחרון, או פנו למנהל.</p>
          <a href="#/">ללוח המשותף</a>
        </div>
      </main>
    );
  }
  return <WorkerHome token={token} workerId={workerId} worker={worker.data} />;
}

function WorkerHome({ token, workerId, worker }: { token: string; workerId: string; worker: Worker }) {
  const act = useAct();
  const who = { token, workerId, workerName: worker.name };
  const tasks = useCollection<Task>("tasks", { where: [["assigneeId", "==", workerId], ["status", "in", ["TODO", "IN_PROGRESS", "BLOCKED"]]] });
  // Needs the composite index in firestore.indexes.json; if it's missing the list is just hidden.
  const done = useCollection<Task>("tasks", {
    where: [["assigneeId", "==", workerId], ["status", "==", "DONE"]],
    orderBy: ["completedAt", "desc"],
    limit: 5,
  });
  const equipment = useCollection<EquipmentRequest>("equipment", { where: ["requesterId", "==", workerId] });
  const meetings = useCollection<MeetingRequest>("meetings", { where: ["requesterId", "==", workerId] });
  const teams = useCollection<Team>("teams");
  const projects = useCollection<Project>("projects");
  const projectMap = byId(projects.data);
  const teamMap = byId(teams.data);

  const open = tasks.data.filter((t) => t.status !== "DONE");
  const taskMap = byId(open);
  const recentDone = done.data;
  const groups = groupTasks(
    open.map<ReportTask>((t) => ({
      id: t.id,
      title: t.title,
      projectName: t.projectId ? (projectMap.get(t.projectId)?.name ?? null) : null,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
    })),
    todayLocal(),
  );
  const sections: [string, ReportTask[], boolean][] = [
    ["באיחור", groups.overdue, true],
    ["להיום", groups.dueToday, false],
    ["השבוע הקרוב", groups.thisWeek, false],
    ["בהמשך", groups.later, false],
    ["ללא תאריך יעד", groups.noDate, false],
  ];
  const newest = <T extends { createdAt: number }>(list: T[], n: number) => [...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, n);

  const onUpdate = act(async (fd: FormData) => {
    const task = taskMap.get(str(fd, "taskId"));
    const status = oneOf(fd, "status", TASK_STATUSES);
    if (!task || !status) throw new UserError("המשימה לא נמצאה");
    const changed = await updateMyTask(who, task, status, optStr(fd, "comment"));
    if (!changed) return "לא בוצע שינוי";
    return status === "DONE" && status !== task.status ? "כל הכבוד! המשימה סומנה כהושלמה" : "העדכון נשמר";
  });

  const onEquipment = act(async (fd: FormData) => {
    const item = str(fd, "item");
    if (!item) throw new UserError("יש להזין שם פריט");
    await requestEquipment(who, {
      item: item.slice(0, 200),
      quantity: Math.min(10000, Math.max(1, optInt(fd, "quantity") ?? 1)),
      link: optUrl(fd, "link"),
      estCost: optNum(fd, "estCost"),
      notes: optStr(fd, "notes"),
      neededBy: optDate(fd, "neededBy"),
      projectId: optStr(fd, "projectId"),
    });
  }, "הבקשה נשלחה למנהל לאישור");

  const onMeeting = act(async (fd: FormData) => {
    const topic = str(fd, "topic");
    if (!topic) throw new UserError("יש להזין נושא לפגישה");
    const withTeamId = optStr(fd, "withTeamId");
    await requestMeeting(
      who,
      { topic: topic.slice(0, 200), notes: optStr(fd, "notes"), neededBy: optDate(fd, "neededBy"), withTeamId },
      withTeamId ? (teamMap.get(withTeamId)?.name ?? null) : null,
    );
  }, "הצורך בפגישה נרשם");

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">שלום {worker.name} 👋</span>
          <span className="muted small" style={{ flex: 1 }}>{worker.teamId ? `צוות ${teamMap.get(worker.teamId)?.name ?? ""}` : ""}</span>
          <Link to={`/?w=${token}`} className="btn ghost sm">ללוח המשותף</Link>
        </div>
      </header>
      <main className="container">
        <FlashBox />

        <h1>המשימות שלי ({open.length})</h1>
        {tasks.loading && <p className="muted">טוען…</p>}
        {!tasks.loading && open.length === 0 && <div className="card empty">אין לך משימות פתוחות כרגע.</div>}

        {sections.map(([title, list, late]) =>
          list.length ? (
            <section key={title} style={{ marginBottom: "1.25rem" }}>
              <h2 className={late ? "danger-text" : ""}>{title} ({list.length})</h2>
              <div className="task-list">
                {list.map((rt) => {
                  const t = taskMap.get(rt.id)!;
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
                        {rt.projectName && <>פרויקט: {rt.projectName} · </>}
                        תאריך יעד: {t.dueDate ? formatDate(t.dueDate) : "לא נקבע"}
                      </div>
                      {t.description && <p className="pre" style={{ margin: ".4rem 0" }}>{t.description}</p>}
                      {t.lastComment && <div className="muted small">עדכון אחרון: “{t.lastComment}” ({formatDateTime(t.updatedAt)})</div>}
                      <form action={onUpdate} className="row" style={{ marginTop: ".5rem" }}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <select name="status" defaultValue={t.status} style={{ width: "auto" }} aria-label="סטטוס">
                          <Options map={TASK_STATUS} />
                        </select>
                        <input name="comment" maxLength={1000} placeholder="הערה (לא חובה)" style={{ flex: 1, minWidth: 160 }} />
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
            <form action={onEquipment} className="stack">
              <div className="fields">
                <label>מה צריך?<input name="item" required maxLength={200} /></label>
                <label>כמות<input name="quantity" type="number" min={1} max={10000} defaultValue={1} /></label>
                <label>נדרש עד<input name="neededBy" type="date" /></label>
                <label>מחיר משוער (₪)<input name="estCost" type="number" min={0} step="0.01" /></label>
              </div>
              <label>
                פרויקט
                <select name="projectId" defaultValue="">
                  <option value="">— ללא —</option>
                  {projects.data.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label>קישור למוצר (לא חובה)<input name="link" type="url" dir="ltr" maxLength={500} placeholder="https://" /></label>
              <label>הערות<textarea name="notes" maxLength={2000} /></label>
              <div><SubmitButton>שליחה לאישור המנהל</SubmitButton></div>
            </form>
            {equipment.data.length > 0 && (
              <>
                <h3 style={{ marginTop: "1rem" }}>הבקשות שלי</h3>
                <table>
                  <tbody>
                    {newest(equipment.data, 15).map((e) => (
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
            <form action={onMeeting} className="stack">
              <label>נושא<input name="topic" required maxLength={200} /></label>
              <div className="fields">
                <label>
                  עם צוות
                  <select name="withTeamId" defaultValue="">
                    <option value="">— לבחור —</option>
                    {teams.data.filter((t) => t.id !== worker.teamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label>נדרש עד<input name="neededBy" type="date" /></label>
              </div>
              <label>פרטים<textarea name="notes" maxLength={2000} placeholder="מה צריך לסגור, מי צריך להשתתף…" /></label>
              <div><SubmitButton>רישום</SubmitButton></div>
            </form>
            {meetings.data.length > 0 && (
              <>
                <h3 style={{ marginTop: "1rem" }}>הבקשות שלי</h3>
                <table>
                  <tbody>
                    {newest(meetings.data, 10).map((m) => (
                      <tr key={m.id}>
                        <td>{m.topic}{m.withTeamId && <span className="muted small"> · {teamMap.get(m.withTeamId)?.name}</span>}</td>
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
