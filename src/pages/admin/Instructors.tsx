import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { byId, useCollection } from "@/lib/data";
import { ActForm } from "@/components/ActForm";
import { OPEN_TASKS } from "@/lib/queries";
import { createWorker, createWorkers, deleteWorker, resendWelcome, updateWorker } from "@/lib/actions";
import { LESSON_STATUS, WORKING_STATUSES } from "@/lib/lessons";
import type { Lesson, Task, Worker, WorkerPrivate } from "@/lib/types";
import { checked, str } from "@/lib/formdata";
import { parseWorkerLines } from "@/lib/bulk";
import { errorText, useAct, useFlash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

/** The manager's team of instructors (מדריכים): add, edit, deactivate, delete. */
export function InstructorsPage() {
  const act = useAct();
  const workers = useCollection<Worker>("workers");
  const privates = useCollection<WorkerPrivate>("workerPrivate");
  const tasks = useCollection<Task>("tasks", OPEN_TASKS);
  const lessons = useCollection<Lesson>("lessons");
  const privMap = byId(privates.data);
  const list = [...workers.data].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "he"));

  const onCreate = act(async (fd: FormData) => {
    await createWorker({ name: str(fd, "name"), email: str(fd, "email") });
    return `${str(fd, "name")} נוסף/ה. יישלח מייל עם קישור כניסה.`;
  });
  const onUpdate = act(
    (fd: FormData) => updateWorker(str(fd, "id"), { name: str(fd, "name"), email: str(fd, "email"), active: checked(fd, "active") }),
    "הפרטים עודכנו",
  );
  const onWelcome = act((id: string) => resendWelcome(id), "מייל עם קישור כניסה יישלח בדקות הקרובות");
  const onDelete = act(async (w: { id: string; name: string }) => {
    if (!window.confirm(`למחוק את ${w.name}? המשימות שלו/ה יישארו בלי אחראי והוא/היא יוסר/ו מהמערכים. (אפשר גם לסמן "לא פעיל/ה")`)) return;
    await deleteWorker(w.id);
    return `${w.name} נמחק/ה`;
  });

  return (
    <>
      <h1>מדריכים</h1>
      <p className="muted" style={{ marginTop: "-.5rem" }}>
        מדריכים נכנסים עם קישור שנשלח למייל שלהם (בלי סיסמה). הם רואים את המערכים ומי עובד עליהם, מעדכנים סטטוס ושולחים קבצים לבדיקה.
        הם לא רואים צוותים אחרים, הזמנות ציוד או פגישות.
      </p>

      <div className="grid grid-2">
        <section className="card">
          <h2>הוספת מדריך/ה</h2>
          <ActForm action={onCreate} className="stack">
            <div className="fields">
              <label>שם מלא<input name="name" required /></label>
              <label>מייל (כל כתובת)<input name="email" type="email" required dir="ltr" placeholder="name@example.com" /></label>
            </div>
            <div><SubmitButton>הוספה</SubmitButton></div>
          </ActForm>
        </section>
        <BulkAdd existingEmails={privates.data.map((p) => p.email)} />
      </div>

      <section className="card">
        <h2>המדריכים ({workers.data.filter((w) => w.active).length} פעילים)</h2>
        {!workers.loading && list.length === 0 ? (
          <p className="empty">עוד אין מדריכים.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>שם</th><th>מייל</th><th>מערכים בעבודה</th><th>משימות פתוחות</th><th></th></tr></thead>
              <tbody>
                {list.map((w) => {
                  const priv = privMap.get(w.id);
                  const mine = lessons.data.filter((l) => (l.ownerIds ?? []).includes(w.id) && WORKING_STATUSES.includes(l.status));
                  return (
                    <tr key={w.id} style={w.active ? undefined : { opacity: 0.55 }}>
                      <td>{w.name}{!w.active && <span className="badge gray" style={{ marginInlineStart: 6 }}>לא פעיל/ה</span>}</td>
                      <td dir="ltr" style={{ textAlign: "right" }}>{priv?.email}</td>
                      <td className="small">
                        {mine.length === 0 ? <span className="muted">—</span> : mine.map((l) => (
                          <div key={l.id}><Link to={`/admin/lessons/${l.id}`}>{l.title}</Link> <span className="muted">· {LESSON_STATUS[l.status]}</span></div>
                        ))}
                      </td>
                      <td>{tasks.data.filter((t) => t.assigneeId === w.id).length}</td>
                      <td>
                        <details>
                          <summary className="small">עריכה</summary>
                          <ActForm action={onUpdate} keepValues className="stack" style={{ minWidth: 240 }} key={`${w.name}|${priv?.email}|${w.active}`}>
                            <input type="hidden" name="id" value={w.id} />
                            <label>שם<input name="name" required defaultValue={w.name} /></label>
                            <label>מייל<input name="email" type="email" required dir="ltr" defaultValue={priv?.email} /></label>
                            <label className="check"><input type="checkbox" name="active" defaultChecked={w.active} /> פעיל/ה (יכול/ה להיכנס ומקבל/ת מיילים)</label>
                            <SubmitButton className="btn sm">שמירה</SubmitButton>
                          </ActForm>
                          <div className="row" style={{ marginTop: ".5rem" }}>
                            <button className="btn ghost sm" onClick={() => onWelcome(w.id)}>שליחת קישור כניסה שוב</button>
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

/** Paste many instructors at once ("name, email" per line). Keeps the text if something is wrong. */
function BulkAdd({ existingEmails }: { existingEmails: string[] }) {
  const { show } = useFlash();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const { rows, errors } = parseWorkerLines(str(new FormData(form), "lines"), existingEmails);
    setErrors(errors);
    if (errors.length) return show(`לא נשמר דבר – יש לתקן ${errors.length === 1 ? "שורה אחת" : `${errors.length} שורות`} (מפורט למטה)`, true);
    setBusy(true);
    try {
      await createWorkers(rows);
      form.reset();
      show(`נוספו ${rows.length} מדריכים. כל אחד/ת יקבל/תקבל מייל עם קישור כניסה.`);
    } catch (err) {
      show(errorText(err), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>הוספת כמה מדריכים יחד</h2>
      <p className="muted small" style={{ marginTop: 0 }}>שורה לכל מדריך/ה: <strong>שם, מייל</strong>. אפשר גם להדביק שתי עמודות מאקסל.</p>
      <form onSubmit={submit} className="stack">
        <textarea name="lines" dir="auto" rows={5} required placeholder={"דנה כהן, dana@example.com\nיוסי לוי, yossi@gmail.com"} />
        {errors.length > 0 && <ul className="danger-text small" style={{ margin: 0 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div><button type="submit" className="btn" disabled={busy}>{busy ? "…" : "הוספת כולם"}</button></div>
      </form>
    </section>
  );
}
