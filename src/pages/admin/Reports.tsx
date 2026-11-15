import { useCollection, useSettings } from "@/lib/data";
import { ActForm } from "@/components/ActForm";
import { formatDateTime } from "@/lib/dates";
import { WEEKDAYS_HE } from "@/lib/labels";
import { queueReport, queueTestEmail, saveSettings } from "@/lib/actions";
import type { EmailLog, OutboxDoc, Worker } from "@/lib/types";
import { checked, optInt, optStr, str } from "@/lib/formdata";
import { useAct } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

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
const QUEUE_NOTE = "המיילים יוצאים תוך כ-10–15 דקות (שירות השליחה רץ כל 10 דקות).";

export function ReportsPage() {
  const act = useAct();
  const settings = useSettings();
  const s = settings.data;
  const workers = useCollection<Worker>("workers");
  const log = useCollection<EmailLog>("emailLog", { orderBy: ["createdAt", "desc"], limit: 40 });
  const pending = useCollection<OutboxDoc>("outbox", { where: ["status", "==", "pending"] });
  const active = workers.data.filter((w) => w.active).sort((a, b) => a.name.localeCompare(b.name, "he"));

  const onSend = act(async (fd: FormData) => {
    if (!window.confirm("לשלוח את הדוח?")) return;
    const some = str(fd, "scope") === "some";
    await queueReport(some ? fd.getAll("workerIds").map(String) : null, optStr(fd, "note"));
    return `הדוח נכנס לתור השליחה. ${QUEUE_NOTE}`;
  });
  const onSave = act(
    (fd: FormData) =>
      saveSettings(s, {
        managerName: str(fd, "managerName"),
        managerEmail: optStr(fd, "managerEmail"),
        notifyManager: checked(fd, "notifyManager"),
        remindersEnabled: checked(fd, "remindersEnabled"),
        reportEnabled: checked(fd, "reportEnabled"),
        reportDay: Math.min(6, Math.max(0, optInt(fd, "reportDay") ?? s.reportDay)),
        reportHour: Math.min(23, Math.max(0, optInt(fd, "reportHour") ?? s.reportHour)),
      }),
    "ההגדרות נשמרו",
  );
  const onTest = act(async () => {
    await queueTestEmail(s);
    return `מייל בדיקה ייצא אל ${s.managerEmail}. ${QUEUE_NOTE}`;
  });

  return (
    <>
      <h1>דוחות והגדרות</h1>
      {pending.data.length > 0 && (
        <div className="flash">{pending.data.length} מיילים ממתינים בתור. {QUEUE_NOTE}</div>
      )}

      <div className="grid grid-2">
        <section className="card">
          <h2>שליחת דוח עכשיו</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            כל עובד/ת מקבל/ת מייל אישי עם המשימות הפתוחות שלו/ה (באיחור, להיום, השבוע, בהמשך), סטטוס הציוד שביקש/ה והפגישות הנדרשות.
          </p>
          <ActForm action={onSend} className="stack">
            <label>
              הודעה אישית בראש הדוח (לא חובה)
              <textarea name="note" placeholder="למשל: שבוע טוב! תזכורת שביום חמישי יש ישיבת צוות." />
            </label>
            <label className="check"><input type="radio" name="scope" value="all" defaultChecked /> לכל העובדים הפעילים ({active.length})</label>
            <label className="check"><input type="radio" name="scope" value="some" /> רק לעובדים שאבחר:</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: ".2rem .75rem", maxHeight: 180, overflowY: "auto", paddingInlineStart: "1.5rem" }}>
              {active.map((w) => (
                <label key={w.id} className="check small"><input type="checkbox" name="workerIds" value={w.id} /> {w.name}</label>
              ))}
            </div>
            <div className="row">
              <SubmitButton>שליחת דוח</SubmitButton>
              {s.lastReportAt && <span className="muted small">דוח אחרון נשלח: {formatDateTime(s.lastReportAt)}</span>}
            </div>
          </ActForm>
        </section>

        <section className="card">
          <h2>הגדרות</h2>
          {/* key: re-mount with fresh defaults once settings load */}
          <ActForm action={onSave} className="stack" key={settings.loading ? "loading" : JSON.stringify(s)} keepValues>
            <h3 style={{ margin: 0 }}>דוח שבועי אוטומטי</h3>
            <label className="check"><input type="checkbox" name="reportEnabled" defaultChecked={s.reportEnabled} /> לשלוח דוח לכל העובדים כל שבוע</label>
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
            <div className="row"><SubmitButton>שמירת הגדרות</SubmitButton></div>
          </ActForm>
          <button className="btn secondary sm" style={{ marginTop: ".75rem" }} onClick={() => onTest()}>שליחת מייל בדיקה אליי</button>
          <p className="muted small" style={{ marginBottom: 0 }}>
            {s.reportEnabled
              ? `הדוח השבועי יישלח בכל יום ${WEEKDAYS_HE[s.reportDay]} ב-${String(s.reportHour).padStart(2, "0")}:00 (עד כ-15 דקות אחרי).`
              : 'הדוח השבועי כבוי – הדוח נשלח רק כשלוחצים על "שליחת דוח".'}
          </p>
        </section>
      </div>

      <section className="card">
        <h2>יומן מיילים</h2>
        {log.data.length === 0 ? (
          <p className="empty">עוד לא נשלחו מיילים</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>זמן</th><th>סוג</th><th>אל</th><th>נושא</th><th>מצב</th></tr></thead>
              <tbody>
                {log.data.map((l) => (
                  <tr key={l.id}>
                    <td className="nowrap small">{formatDateTime(l.createdAt)}</td>
                    <td className="small">{KIND[l.kind] ?? l.kind}</td>
                    <td dir="ltr" className="small" style={{ textAlign: "right" }}>{l.to}</td>
                    <td className="small">{l.subject}</td>
                    <td>
                      <span className={`badge ${STATUS[l.status]?.tone ?? "gray"}`}>{STATUS[l.status]?.label ?? l.status}</span>
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
