import { Link, useSearchParams } from "react-router";
import { byId, useCollection } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { MEETING_STATUS } from "@/lib/labels";
import { createMeeting, deleteMeeting, setMeetingStatus } from "@/lib/actions";
import { MEETING_STATUSES, type MeetingRequest, type MeetingStatus, type Team, type Worker } from "@/lib/types";
import { oneOf, optDate, optStr, str } from "@/lib/formdata";
import { Badge } from "@/components/ui";
import { useAct } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

const FILTERS: { key: string; label: string; statuses: MeetingStatus[] }[] = [
  { key: "open", label: "פתוחות", statuses: ["OPEN", "SCHEDULED"] },
  { key: "closed", label: "התקיימו / בוטלו", statuses: ["DONE", "CANCELLED"] },
];

export function MeetingsPage() {
  const act = useAct();
  const [sp] = useSearchParams();
  const filter = FILTERS.find((x) => x.key === (sp.get("f") ?? "open")) ?? FILTERS[0];
  const meetings = useCollection<MeetingRequest>("meetings", { where: ["status", "in", filter.statuses] });
  const teams = useCollection<Team>("teams");
  const workers = useCollection<Worker>("workers");
  const teamMap = byId(teams.data);
  const workerMap = byId(workers.data);

  const list = meetings.data
    .filter((m) => filter.statuses.includes(m.status))
    .sort((a, b) => (a.neededBy ?? "9999").localeCompare(b.neededBy ?? "9999") || a.createdAt - b.createdAt);

  const onCreate = act(
    (fd: FormData) =>
      createMeeting({
        topic: str(fd, "topic"),
        notes: optStr(fd, "notes"),
        neededBy: optDate(fd, "neededBy"),
        withTeamId: optStr(fd, "withTeamId"),
        requesterId: optStr(fd, "requesterId"),
      }),
    "הצורך בפגישה נרשם",
  );
  const onStatus = act(async (fd: FormData) => {
    const s = oneOf(fd, "status", MEETING_STATUSES);
    if (s) await setMeetingStatus(str(fd, "id"), s);
  }, "הסטטוס עודכן");
  const onDelete = act(async (id: string) => {
    if (!window.confirm("למחוק?")) return;
    await deleteMeeting(id);
    return "נמחק";
  });

  return (
    <>
      <h1>פגישות נדרשות</h1>
      <p className="muted" style={{ marginTop: "-.5rem" }}>
        מעקב אחרי הצורך בפגישות עם צוותים אחרים. קביעת הפגישה עצמה נעשית מחוץ למערכת – כאן רק מסמנים שנקבעה.
      </p>

      <details className="card">
        <summary>+ רישום צורך בפגישה</summary>
        <form action={onCreate} className="stack">
          <div className="fields">
            <label>נושא<input name="topic" required /></label>
            <label>
              עם צוות
              <select name="withTeamId" defaultValue="">
                <option value="">— לבחור —</option>
                {teams.data.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label>
              מבקש/ת
              <select name="requesterId" defaultValue="">
                <option value="">— מנהל —</option>
                {workers.data.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label>נדרש עד<input name="neededBy" type="date" /></label>
          </div>
          <label>פרטים<textarea name="notes" placeholder="מה צריך לסגור בפגישה, מי צריך להשתתף…" /></label>
          <div><SubmitButton>שמירה</SubmitButton></div>
        </form>
      </details>

      <div className="row" style={{ marginBottom: ".75rem" }}>
        {FILTERS.map((x) => (
          <Link key={x.key} to={`/admin/meetings?f=${x.key}`} className={`btn sm ${x.key === filter.key ? "" : "ghost"}`}>{x.label}</Link>
        ))}
      </div>

      <section className="card">
        {meetings.loading ? (
          <p className="muted">טוען…</p>
        ) : list.length === 0 ? (
          <p className="empty">אין פגישות להצגה</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>נושא</th><th>מבקש/ת</th><th>עם צוות</th><th>נדרש עד</th><th>סטטוס</th><th>עדכון</th></tr></thead>
              <tbody>
                {list.map((m) => {
                  const req = m.requesterId ? workerMap.get(m.requesterId) : undefined;
                  return (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.topic}</strong>
                        {m.notes && <div className="muted small pre">{m.notes}</div>}
                      </td>
                      <td>
                        {req?.name ?? <span className="muted">מנהל</span>}
                        {req?.teamId && <div className="muted small">צוות {teamMap.get(req.teamId)?.name}</div>}
                      </td>
                      <td>{(m.withTeamId && teamMap.get(m.withTeamId)?.name) ?? "—"}</td>
                      <td className="nowrap">{formatDate(m.neededBy) || "—"}</td>
                      <td><Badge value={m.status} label={MEETING_STATUS[m.status]} /></td>
                      <td>
                        <div className="row">
                          <form action={onStatus} className="inline-form">
                            <input type="hidden" name="id" value={m.id} />
                            <select name="status" defaultValue={m.status} key={m.status} aria-label="סטטוס">
                              {Object.entries(MEETING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            <SubmitButton className="btn ghost sm">עדכון</SubmitButton>
                          </form>
                          <button className="btn danger sm" onClick={() => onDelete(m.id)}>מחיקה</button>
                        </div>
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
