import { db } from "@/lib/db";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";
import { personalUrl } from "@/lib/notify";
import { createTeam, createWorker, deleteTeam, deleteWorker, regenerateWorkerLink, updateWorker } from "../actions";

export default async function WorkersPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { msg, error } = await searchParams;
  const [workers, teams] = await Promise.all([
    db.worker.findMany({
      include: { team: true, _count: { select: { tasks: { where: { status: { not: "DONE" } } } } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    db.team.findMany({ include: { _count: { select: { workers: true } } }, orderBy: { name: "asc" } }),
  ]);

  const TeamSelect = ({ value }: { value?: number | null }) => (
    <select name="teamId" defaultValue={value ?? ""}>
      <option value="">— ללא צוות —</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );

  return (
    <>
      <h1>עובדים וצוותים</h1>
      <Flash msg={msg} error={error} />

      <div className="grid grid-2">
        <section className="card">
          <h2>הוספת עובד/ת</h2>
          <form action={createWorker} className="stack">
            <div className="fields">
              <label>
                שם מלא
                <input name="name" required />
              </label>
              <label>
                מייל (כל כתובת)
                <input name="email" type="email" required dir="ltr" placeholder="name@example.com" />
              </label>
              <label>
                צוות
                <TeamSelect />
              </label>
            </div>
            <div><SubmitButton>הוספה</SubmitButton></div>
          </form>
        </section>

        <section className="card">
          <h2>צוותים</h2>
          <form action={createTeam} className="row" style={{ marginBottom: ".75rem" }}>
            <input name="name" required placeholder="שם צוות חדש" style={{ maxWidth: 240 }} />
            <SubmitButton className="btn secondary">הוספת צוות</SubmitButton>
          </form>
          {teams.length === 0 ? (
            <p className="empty">עוד אין צוותים. צוותים משמשים גם לבקשות פגישה בין צוותים.</p>
          ) : (
            <table>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td className="muted small">{t._count.workers} עובדים</td>
                    <td style={{ textAlign: "end" }}>
                      <form action={deleteTeam}>
                        <input type="hidden" name="id" value={t.id} />
                        <SubmitButton className="btn danger sm" confirm={`למחוק את צוות ${t.name}?`}>מחיקה</SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card">
        <h2>עובדים ({workers.filter((w) => w.active).length} פעילים)</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          לכל עובד/ת יש קישור אישי (בלי סיסמה) שמופיע בכל מייל. בקישור רואים את המשימות, מעדכנים סטטוס ומבקשים ציוד או פגישה.
          אם קישור דלף – אפשר ליצור חדש.
        </p>
        {workers.length === 0 ? (
          <p className="empty">עוד אין עובדים.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>שם</th><th>מייל</th><th>צוות</th><th>משימות פתוחות</th><th>קישור אישי</th><th></th></tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.id} style={w.active ? undefined : { opacity: 0.55 }}>
                    <td>{w.name}{!w.active && <span className="badge gray" style={{ marginInlineStart: 6 }}>לא פעיל/ה</span>}</td>
                    <td dir="ltr" style={{ textAlign: "right" }}>{w.email}</td>
                    <td className="muted">{w.team?.name ?? "—"}</td>
                    <td>{w._count.tasks}</td>
                    <td className="nowrap">
                      <CopyButton text={personalUrl(w.token)} />{" "}
                      <a href={`/w/${w.token}`} target="_blank" className="small">פתיחה</a>
                    </td>
                    <td>
                      <details>
                        <summary className="small">עריכה</summary>
                        <form action={updateWorker} className="stack" style={{ minWidth: 240 }}>
                          <input type="hidden" name="id" value={w.id} />
                          <label>שם<input name="name" required defaultValue={w.name} /></label>
                          <label>מייל<input name="email" type="email" required dir="ltr" defaultValue={w.email} /></label>
                          <label>צוות<TeamSelect value={w.teamId} /></label>
                          <label className="check"><input type="checkbox" name="active" defaultChecked={w.active} /> פעיל/ה (מקבל/ת מיילים)</label>
                          <SubmitButton className="btn sm">שמירה</SubmitButton>
                        </form>
                        <div className="row" style={{ marginTop: ".5rem" }}>
                          <form action={regenerateWorkerLink}>
                            <input type="hidden" name="id" value={w.id} />
                            <SubmitButton className="btn ghost sm" confirm="הקישור הנוכחי יפסיק לעבוד. להמשיך?">קישור חדש</SubmitButton>
                          </form>
                          <form action={deleteWorker}>
                            <input type="hidden" name="id" value={w.id} />
                            <SubmitButton className="btn danger sm" confirm={`למחוק את ${w.name}? עדיף לסמן כלא פעיל/ה כדי לשמור היסטוריה.`}>מחיקה</SubmitButton>
                          </form>
                        </div>
                      </details>
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
