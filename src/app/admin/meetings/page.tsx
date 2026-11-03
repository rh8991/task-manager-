import Link from "next/link";
import type { MeetingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { MEETING_STATUS } from "@/lib/labels";
import { Badge, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createMeeting, deleteMeeting, setMeetingStatus } from "../actions";

const FILTERS: { key: string; label: string; statuses: MeetingStatus[] }[] = [
  { key: "open", label: "פתוחות", statuses: ["OPEN", "SCHEDULED"] },
  { key: "closed", label: "התקיימו / בוטלו", statuses: ["DONE", "CANCELLED"] },
];

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string; f?: string }> }) {
  const { msg, error, f = "open" } = await searchParams;
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[0];

  const [meetings, teams, workers] = await Promise.all([
    db.meetingRequest.findMany({
      where: { status: { in: filter.statuses } },
      include: { withTeam: true, requester: { include: { team: true } } },
      orderBy: [{ neededBy: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    db.team.findMany({ orderBy: { name: "asc" } }),
    db.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <h1>פגישות נדרשות</h1>
      <p className="muted" style={{ marginTop: "-.5rem" }}>
        מעקב אחרי הצורך בפגישות עם צוותים אחרים. קביעת הפגישה עצמה נעשית מחוץ למערכת – כאן רק מסמנים שנקבעה.
      </p>
      <Flash msg={msg} error={error} />

      <details className="card">
        <summary>+ רישום צורך בפגישה</summary>
        <form action={createMeeting} className="stack">
          <div className="fields">
            <label>נושא<input name="topic" required /></label>
            <label>
              עם צוות
              <select name="withTeamId" defaultValue="">
                <option value="">— לבחור —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label>
              מבקש/ת
              <select name="requesterId" defaultValue="">
                <option value="">— מנהל —</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
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
          <Link key={x.key} href={`/admin/meetings?f=${x.key}`} className={`btn sm ${x.key === filter.key ? "" : "ghost"}`}>{x.label}</Link>
        ))}
      </div>

      <section className="card">
        {meetings.length === 0 ? (
          <p className="empty">אין פגישות להצגה</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>נושא</th><th>מבקש/ת</th><th>עם צוות</th><th>נדרש עד</th><th>סטטוס</th><th>עדכון</th></tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.topic}</strong>
                      {m.notes && <div className="muted small pre">{m.notes}</div>}
                    </td>
                    <td>
                      {m.requester?.name ?? <span className="muted">מנהל</span>}
                      {m.requester?.team && <div className="muted small">צוות {m.requester.team.name}</div>}
                    </td>
                    <td>{m.withTeam?.name ?? "—"}</td>
                    <td className="nowrap">{formatDate(m.neededBy) || "—"}</td>
                    <td><Badge value={m.status} label={MEETING_STATUS[m.status]} /></td>
                    <td>
                      <div className="row">
                        <form action={setMeetingStatus} className="inline-form">
                          <input type="hidden" name="id" value={m.id} />
                          <select name="status" defaultValue={m.status} aria-label="סטטוס">
                            {Object.entries(MEETING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <SubmitButton className="btn ghost sm">עדכון</SubmitButton>
                        </form>
                        <form action={deleteMeeting}>
                          <input type="hidden" name="id" value={m.id} />
                          <SubmitButton className="btn danger sm" confirm="למחוק?">מחיקה</SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
