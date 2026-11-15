import { byId, useCollection } from "@/lib/data";
import { UserError, createTeam, createWorker, deleteTeam, deleteWorker, regenerateWorkerLink, updateWorker } from "@/lib/actions";
import type { Task, Team, Worker, WorkerPrivate } from "@/lib/types";
import { checked, optStr, str } from "@/lib/formdata";
import { useAct } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";

/** Personal link to a worker's page (hash route, so the token never reaches a server). */
export function personalUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}#/w/${token}`;
}

export function WorkersPage() {
  const act = useAct();
  const workers = useCollection<Worker>("workers");
  const privates = useCollection<WorkerPrivate>("workerPrivate");
  const teams = useCollection<Team>("teams");
  const tasks = useCollection<Task>("tasks");
  const privMap = byId(privates.data);
  const teamMap = byId(teams.data);
  const sortedTeams = [...teams.data].sort((a, b) => a.name.localeCompare(b.name, "he"));
  const list = [...workers.data].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "he"));

  const TeamSelect = ({ value }: { value?: string | null }) => (
    <select name="teamId" defaultValue={value ?? ""}>
      <option value="">— ללא צוות —</option>
      {sortedTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );

  const onCreate = act(async (fd: FormData) => {
    await createWorker({ name: str(fd, "name"), email: str(fd, "email"), teamId: optStr(fd, "teamId") });
    return `${str(fd, "name")} נוסף/ה`;
  });
  const onUpdate = act(
    (fd: FormData) =>
      updateWorker(str(fd, "id"), { name: str(fd, "name"), email: str(fd, "email"), teamId: optStr(fd, "teamId"), active: checked(fd, "active") }),
    "הפרטים עודכנו",
  );
  const onTeam = act(async (fd: FormData) => {
    const name = str(fd, "name");
    if (teams.data.some((t) => t.name === name)) throw new UserError("צוות בשם הזה כבר קיים");
    await createTeam(name);
    return `הצוות "${name}" נוסף`;
  });
  const onDeleteTeam = act(async (t: { id: string; name: string }) => {
    if (!window.confirm(`למחוק את צוות ${t.name}?`)) return;
    await deleteTeam(t.id);
    return "הצוות נמחק";
  });
  const onRegenerate = act(async (id: string) => {
    if (!window.confirm("הקישור הנוכחי יפסיק לעבוד. להמשיך?")) return;
    await regenerateWorkerLink(id);
    return "נוצר קישור אישי חדש. הקישור הקודם כבר לא עובד.";
  });
  const onDelete = act(async (w: { id: string; name: string }) => {
    if (!window.confirm(`למחוק את ${w.name}? עדיף לסמן כלא פעיל/ה כדי לשמור היסטוריה.`)) return;
    await deleteWorker(w.id);
    return "העובד/ת נמחק/ה. המשימות שלו/ה נשארו ללא אחראי.";
  });

  return (
    <>
      <h1>עובדים וצוותים</h1>

      <div className="grid grid-2">
        <section className="card">
          <h2>הוספת עובד/ת</h2>
          <form action={onCreate} className="stack">
            <div className="fields">
              <label>שם מלא<input name="name" required /></label>
              <label>מייל (כל כתובת)<input name="email" type="email" required dir="ltr" placeholder="name@example.com" /></label>
              <label>צוות<TeamSelect /></label>
            </div>
            <div><SubmitButton>הוספה</SubmitButton></div>
          </form>
        </section>

        <section className="card">
          <h2>צוותים</h2>
          <form action={onTeam} className="row" style={{ marginBottom: ".75rem" }}>
            <input name="name" required placeholder="שם צוות חדש" style={{ maxWidth: 240 }} />
            <SubmitButton className="btn secondary">הוספת צוות</SubmitButton>
          </form>
          {sortedTeams.length === 0 ? (
            <p className="empty">עוד אין צוותים. צוותים משמשים גם לבקשות פגישה בין צוותים.</p>
          ) : (
            <table>
              <tbody>
                {sortedTeams.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td className="muted small">{workers.data.filter((w) => w.teamId === t.id).length} עובדים</td>
                    <td style={{ textAlign: "end" }}>
                      <button className="btn danger sm" onClick={() => onDeleteTeam(t)}>מחיקה</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card">
        <h2>עובדים ({workers.data.filter((w) => w.active).length} פעילים)</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          לכל עובד/ת יש קישור אישי (בלי סיסמה) שמופיע בכל מייל. בקישור רואים את המשימות, מעדכנים סטטוס ומבקשים ציוד או פגישה.
          אם קישור דלף – אפשר ליצור חדש.
        </p>
        {!workers.loading && list.length === 0 ? (
          <p className="empty">עוד אין עובדים.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>שם</th><th>מייל</th><th>צוות</th><th>משימות פתוחות</th><th>קישור אישי</th><th></th></tr></thead>
              <tbody>
                {list.map((w) => {
                  const priv = privMap.get(w.id);
                  return (
                    <tr key={w.id} style={w.active ? undefined : { opacity: 0.55 }}>
                      <td>{w.name}{!w.active && <span className="badge gray" style={{ marginInlineStart: 6 }}>לא פעיל/ה</span>}</td>
                      <td dir="ltr" style={{ textAlign: "right" }}>{priv?.email}</td>
                      <td className="muted">{(w.teamId && teamMap.get(w.teamId)?.name) ?? "—"}</td>
                      <td>{tasks.data.filter((t) => t.assigneeId === w.id && t.status !== "DONE").length}</td>
                      <td className="nowrap">
                        {priv && (
                          <>
                            <CopyButton text={personalUrl(priv.token)} />{" "}
                            <a href={`#/w/${priv.token}`} target="_blank" rel="noreferrer" className="small">פתיחה</a>
                          </>
                        )}
                      </td>
                      <td>
                        <details>
                          <summary className="small">עריכה</summary>
                          <form action={onUpdate} className="stack" style={{ minWidth: 240 }} key={`${w.name}|${priv?.email}|${w.teamId}|${w.active}`}>
                            <input type="hidden" name="id" value={w.id} />
                            <label>שם<input name="name" required defaultValue={w.name} /></label>
                            <label>מייל<input name="email" type="email" required dir="ltr" defaultValue={priv?.email} /></label>
                            <label>צוות<TeamSelect value={w.teamId} /></label>
                            <label className="check"><input type="checkbox" name="active" defaultChecked={w.active} /> פעיל/ה (מקבל/ת מיילים)</label>
                            <SubmitButton className="btn sm">שמירה</SubmitButton>
                          </form>
                          <div className="row" style={{ marginTop: ".5rem" }}>
                            <button className="btn ghost sm" onClick={() => onRegenerate(w.id)}>קישור חדש</button>
                            <button className="btn danger sm" onClick={() => onDelete(w)}>מחיקה</button>
                          </div>
                        </details>
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
