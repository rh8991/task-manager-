import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { WEEKDAYS_HE } from "@/lib/labels";
import { getSettings } from "@/lib/notify";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { saveSettings, sendReportNow, sendTestEmail } from "../actions";

const KIND: Record<string, string> = {
  report: "דוח",
  "task-assigned": "משימה חדשה",
  "due-reminder": "תזכורת",
  "manager-notice": "התראה למנהל",
  test: "בדיקה",
};
const STATUS: Record<string, { label: string; tone: string }> = {
  SENT: { label: "נשלח", tone: "green" },
  FAILED: { label: "נכשל", tone: "red" },
  LOGGED: { label: "לא נשלח (אין SMTP)", tone: "amber" },
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { msg, error } = await searchParams;
  const [s, workers, log] = await Promise.all([
    getSettings(),
    db.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  const smtpReady = !!process.env.SMTP_HOST;

  return (
    <>
      <h1>דוחות והגדרות</h1>
      <Flash msg={msg} error={error} />
      {!smtpReady && (
        <div className="flash error">
          שליחת מיילים עדיין לא הוגדרה (חסר SMTP_HOST). המיילים נרשמים ביומן אבל לא נשלחים בפועל. ראו README.
        </div>
      )}

      <div className="grid grid-2">
        <section className="card">
          <h2>שליחת דוח עכשיו</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            כל עובד/ת מקבל/ת מייל אישי עם המשימות הפתוחות שלו/ה (באיחור, להיום, השבוע, בהמשך), סטטוס הציוד שביקש/ה והפגישות הנדרשות.
          </p>
          <form action={sendReportNow} className="stack">
            <label>
              הודעה אישית בראש הדוח (לא חובה)
              <textarea name="note" placeholder="למשל: שבוע טוב! תזכורת שביום חמישי יש ישיבת צוות." />
            </label>
            <label className="check"><input type="radio" name="scope" value="all" defaultChecked /> לכל העובדים הפעילים ({workers.length})</label>
            <label className="check"><input type="radio" name="scope" value="some" /> רק לעובדים שאבחר:</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: ".2rem .75rem", maxHeight: 180, overflowY: "auto", paddingInlineStart: "1.5rem" }}>
              {workers.map((w) => (
                <label key={w.id} className="check small"><input type="checkbox" name="workerIds" value={w.id} /> {w.name}</label>
              ))}
            </div>
            <div className="row">
              <SubmitButton confirm="לשלוח את הדוח עכשיו?">שליחת דוח</SubmitButton>
              {s.lastReportAt && <span className="muted small">דוח אחרון נשלח: {formatDateTime(s.lastReportAt)}</span>}
            </div>
          </form>
        </section>

        <section className="card">
          <h2>הגדרות</h2>
          <form action={saveSettings} className="stack">
            <h3 style={{ margin: 0 }}>דוח שבועי אוטומטי</h3>
            <label className="check">
              <input type="checkbox" name="reportEnabled" defaultChecked={s.reportEnabled} /> לשלוח דוח לכל העובדים כל שבוע
            </label>
            <div className="fields">
              <label>
                ביום
                <select name="reportDay" defaultValue={s.reportDay}>
                  {WEEKDAYS_HE.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </label>
              <label>
                בשעה (שעון ישראל)
                <select name="reportHour" defaultValue={s.reportHour}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
              </label>
            </div>

            <h3 style={{ margin: ".5rem 0 0" }}>התראות</h3>
            <label className="check">
              <input type="checkbox" name="remindersEnabled" defaultChecked={s.remindersEnabled} /> תזכורת במייל לעובד/ת יום לפני תאריך היעד של משימה
            </label>
            <label className="check">
              <input type="checkbox" name="notifyManager" defaultChecked={s.notifyManager} /> לשלוח לי מייל כשעובד/ת מעדכן/ת משימה, מבקש/ת ציוד או פגישה
            </label>

            <h3 style={{ margin: ".5rem 0 0" }}>פרטי המנהל</h3>
            <div className="fields">
              <label>שם (מופיע בדוחות)<input name="managerName" defaultValue={s.managerName} /></label>
              <label>מייל<input name="managerEmail" type="email" dir="ltr" defaultValue={s.managerEmail ?? ""} /></label>
            </div>
            <div className="row">
              <SubmitButton>שמירת הגדרות</SubmitButton>
            </div>
          </form>
          <form action={sendTestEmail} style={{ marginTop: ".75rem" }}>
            <SubmitButton className="btn secondary sm">שליחת מייל בדיקה אליי</SubmitButton>
          </form>
          <p className="muted small" style={{ marginBottom: 0 }}>
            {s.reportEnabled
              ? `הדוח השבועי יישלח בכל יום ${WEEKDAYS_HE[s.reportDay]} ב-${String(s.reportHour).padStart(2, "0")}:00.`
              : "הדוח השבועי כבוי – הדוח נשלח רק כשלוחצים על \"שליחת דוח\"."}
          </p>
        </section>
      </div>

      <section className="card">
        <h2>יומן מיילים</h2>
        {log.length === 0 ? (
          <p className="empty">עוד לא נשלחו מיילים</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>זמן</th><th>סוג</th><th>אל</th><th>נושא</th><th>מצב</th></tr></thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td className="nowrap small">{formatDateTime(l.createdAt)}</td>
                    <td className="small">{KIND[l.kind] ?? l.kind}</td>
                    <td dir="ltr" className="small" style={{ textAlign: "right" }}>{l.to}</td>
                    <td className="small">{l.subject}</td>
                    <td>
                      <span className={`badge ${STATUS[l.status].tone}`}>{STATUS[l.status].label}</span>
                      {l.error && <div className="small danger-text" dir="ltr">{l.error}</div>}
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
