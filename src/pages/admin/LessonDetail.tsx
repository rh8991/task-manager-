import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { byId, useCollection, useDocument } from "@/lib/data";
import { formatDate, formatDateTime } from "@/lib/dates";
import { createTask } from "@/lib/actions";
import { decideSubmission, deleteLesson, managerSubmit, orderLessonItem, setLessonReviewDone, updateLesson } from "@/lib/lessonActions";
import { downloadLessonFile } from "@/lib/fileStore";
import { mimeFor, formatSize } from "@/lib/files";
import { summarizeLesson, submitBlocker } from "@/lib/allergens";
import { GRADES, LESSON_KIND, LESSON_STATUS, LOCATION, SUBJECT, withLessonDefaults } from "@/lib/lessons";
import { parseReviewField } from "@/lib/reviews";
import { oneOf, optDate, optInt, optStr, str } from "@/lib/formdata";
import { EQUIPMENT_STATUS, TASK_STATUS } from "@/lib/labels";
import {
  LESSON_KINDS,
  LESSON_LOCATIONS,
  LESSON_STATUSES,
  SUBJECTS,
  type EquipmentRequest,
  type Lesson,
  type LessonActivity,
  type LessonItem,
  type LessonSubmission,
  type Task,
  type Team,
  type Worker,
} from "@/lib/types";
import { Badge } from "@/components/ui";
import { ActForm } from "@/components/ActForm";
import { SubmitButton } from "@/components/SubmitButton";
import { useAct, useFlash, errorText } from "@/components/Flash";
import { ReviewList, ReviewsEditor } from "@/components/Reviews";
import { ActivitiesEditor, EquipmentEditor, LessonStatusBadge, SafetyChecks, SafetyTags, cleanActivities, cleanItems, readJsonField } from "@/components/LessonParts";

export function LessonDetail() {
  const { id = "" } = useParams();
  const act = useAct();
  const { show } = useFlash();
  const navigate = useNavigate();
  const lessonDoc = useDocument<Lesson>(`lessons/${id}`);
  const workers = useCollection<Worker>("workers");
  const teams = useCollection<Team>("teams");
  const subs = useCollection<LessonSubmission>("lessonSubmissions", { where: ["lessonId", "==", id] });
  const tasks = useCollection<Task>("tasks", { where: ["lessonId", "==", id] });
  const orders = useCollection<EquipmentRequest>("equipment", { where: ["lessonId", "==", id] });
  const [progress, setProgress] = useState<string | null>(null);

  if (lessonDoc.loading) return <p className="muted">טוען…</p>;
  if (!lessonDoc.data) return <><h1>המערך לא נמצא</h1><Link to="/admin/lessons">→ חזרה למערכים</Link></>;
  const l = withLessonDefaults(lessonDoc.data);
  const workerMap = byId(workers.data);
  const teamMap = byId(teams.data);
  const summary = summarizeLesson(l);
  const history = [...subs.data].sort((a, b) => b.submittedAt - a.submittedAt);
  const pending = history.find((s) => !s.decision);
  const active = workers.data.filter((w) => w.active || l.ownerIds.includes(w.id)).sort((a, b) => a.name.localeCompare(b.name, "he"));
  const dept = (name: string) => teams.data.find((t) => t.name.includes(name));

  const onSave = act(async (fd: FormData) => {
    const added = await updateLesson(l.id, {
      title: str(fd, "title"),
      subject: oneOf(fd, "subject", SUBJECTS) ?? l.subject,
      kind: oneOf(fd, "kind", LESSON_KINDS) ?? l.kind,
      gradeFrom: optInt(fd, "gradeFrom") ?? l.gradeFrom,
      gradeTo: optInt(fd, "gradeTo") ?? l.gradeTo,
      location: oneOf(fd, "location", LESSON_LOCATIONS) ?? l.location,
      durationMin: optInt(fd, "durationMin") ?? 90,
      goals: optStr(fd, "goals"),
      summary: optStr(fd, "summary"),
      ownerIds: fd.getAll("ownerIds").map(String),
      status: oneOf(fd, "status", LESSON_STATUSES) ?? l.status,
      startDate: optDate(fd, "startDate"),
      dueDate: optDate(fd, "dueDate"),
      reviews: parseReviewField(fd.get("reviews")),
      activities: cleanActivities(readJsonField<LessonActivity>(fd, "activities")),
      equipment: cleanItems(readJsonField<LessonItem>(fd, "equipment")),
      safety: fd.getAll("safety").map(String),
    });
    return added ? `המערך נשמר. ${added} מדריכים חדשים יקבלו מייל.` : "המערך נשמר";
  });

  const onDecide = act(async (fd: FormData) => {
    if (!pending) return;
    const decision = str(fd, "decision") === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED";
    await decideSubmission(l.id, pending.id, decision, optStr(fd, "notes"));
    return decision === "APPROVED" ? "המערך אושר. המדריכים יקבלו מייל." : "המערך הוחזר עם הערות. המדריכים יקבלו מייל.";
  });

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return show("יש לבחור קובץ", true);
    try {
      setProgress("מעלה…");
      await managerSubmit(l, file, optStr(fd, "note"), (d, t) => setProgress(`מעלה… ${d}/${t}`));
      form.reset();
      show("הקובץ נשמר ונשלח אלייך במייל (תוך כ-10–15 דקות)");
    } catch (err) {
      show(errorText(err), true);
    } finally {
      setProgress(null);
    }
  }

  const onTask = act(async (fd: FormData) => {
    await createTask({
      title: str(fd, "title"),
      description: optStr(fd, "description"),
      priority: "MEDIUM",
      dueDate: optDate(fd, "dueDate"),
      projectId: null,
      assigneeId: optStr(fd, "assigneeId"),
      teamId: optStr(fd, "teamId"),
      lessonId: l.id,
      reviews: [],
    });
  }, "המשימה נוצרה");

  const onOrder = act((item: LessonItem) => orderLessonItem(l, item, l.ownerIds[0] ?? null), "נוצרה בקשת הזמנה למעבדה");
  const onToggleReview = act((r: { id: string; done: boolean }) => setLessonReviewDone(l.id, r.id, !r.done), "הביקורת עודכנה");
  const onDelete = act(async () => {
    if (!window.confirm(`למחוק את המערך "${l.title}"? (הקבצים והשליחות נשארים בארכיון)`)) return;
    await deleteLesson(l.id);
    navigate("/admin/lessons");
  });
  const download = act(async (s: LessonSubmission) => {
    if (!s.fileId || !s.fileName) return;
    await downloadLessonFile(s.fileId, s.fileName, mimeFor(s.fileName));
  });

  const ordered = new Set(orders.data.map((o) => o.item));
  const toOrder = l.equipment.filter((i) => i.toOrder);

  return (
    <>
      <p className="small"><Link to="/admin/lessons">→ חזרה למערכים</Link></p>
      <div className="spread">
        <div>
          <h1 style={{ marginBottom: ".2rem" }}>{l.title}</h1>
          <div className="muted small">
            {SUBJECT[l.subject]} · {LESSON_KIND[l.kind]} · כיתות {GRADES[l.gradeFrom - 1]}–{GRADES[l.gradeTo - 1]} · {LOCATION[l.location]} · {l.durationMin} דק'
          </div>
        </div>
        <div className="row">
          <LessonStatusBadge status={l.status} />
          <Link to={`/lesson/${l.id}`} className="btn ghost sm">תצוגה</Link>
          <Link to={`/lesson/${l.id}/print`} className="btn ghost sm">רשימת ציוד להדפסה</Link>
        </div>
      </div>
      <div style={{ margin: ".5rem 0 1rem" }}><SafetyTags lesson={l} showNone /></div>

      <div className="grid grid-2">
        <section className="card">
          <h2>שליחות לבדיקה</h2>
          {pending && (
            <div className="flash" style={{ background: "var(--amber-bg)", color: "var(--amber-fg)" }}>
              גרסה {pending.version} ממתינה להחלטה שלך
            </div>
          )}
          {history.length === 0 ? (
            <p className="empty">עוד לא נשלח קובץ</p>
          ) : (
            <ul style={{ margin: 0, paddingInlineStart: "1.1rem", display: "grid", gap: ".6rem" }}>
              {history.map((s) => (
                <li key={s.id}>
                  <strong>גרסה {s.version}</strong> · {s.submittedBy ? (workerMap.get(s.submittedBy)?.name ?? "מדריך") : "מנהלת"} · {formatDateTime(s.submittedAt)}
                  {s.fileName && (
                    <div className="small">
                      📎 {s.fileName} {s.fileSize ? `(${formatSize(s.fileSize)})` : ""}{" "}
                      <button type="button" className="btn ghost sm" onClick={() => download(s)}>הורדה</button>
                    </div>
                  )}
                  <div className={`small ${s.emailStatus === "failed" ? "danger-text" : "muted"}`}>
                    {s.emailStatus === "sent" ? `✓ נשלח למייל ${formatDateTime(s.emailAt)}` : s.emailStatus === "failed" ? `שליחת המייל נכשלה: ${s.emailError ?? ""}` : "ממתין לשליחה במייל (עד כ-15 דקות)"}
                  </div>
                  {s.note && <div className="small pre">הערת המדריך: {s.note}</div>}
                  {s.decision && (
                    <div className="small">
                      <Badge value={s.decision === "APPROVED" ? "DONE" : "BLOCKED"} label={s.decision === "APPROVED" ? "אושר" : "הוחזר עם הערות"} /> {formatDateTime(s.decidedAt)}
                      {s.decisionNotes && <div className="pre">{s.decisionNotes}</div>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {pending && (
            <ActForm action={onDecide} className="stack" style={{ marginTop: "1rem" }}>
              <label>הערות למדריכים (חובה כשמחזירים)<textarea name="notes" placeholder="מה צריך לתקן?" /></label>
              <div className="row">
                <button type="submit" name="decision" value="APPROVED" className="btn">אישור המערך</button>
                <button type="submit" name="decision" value="CHANGES_REQUESTED" className="btn danger">החזרה עם הערות</button>
              </div>
            </ActForm>
          )}

          <details style={{ marginTop: "1rem" }}>
            <summary className="small">העלאת קובץ בעצמי (למשל קובץ שקיבלתי במייל)</summary>
            <form onSubmit={onUpload} className="stack">
              <input type="file" name="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.odt,.odp" />
              <input name="note" placeholder="הערה (לא חובה)" />
              <div className="row">
                <button type="submit" className="btn sm" disabled={!!progress}>{progress ?? "שמירה ושליחה אליי במייל"}</button>
                {submitBlocker(l) && <span className="danger-text small">{submitBlocker(l)}</span>}
              </div>
            </form>
          </details>
        </section>

        <section className="card">
          <h2>תאריכים</h2>
          <p className="small" style={{ marginTop: 0 }}>
            התחלה: <strong>{formatDate(l.startDate) || "—"}</strong> · יעד סופי: <strong>{formatDate(l.dueDate) || "לא נקבע"}</strong>
          </p>
          <ReviewList reviews={l.reviews} dueDate={l.dueDate} onToggle={(r) => onToggleReview(r)} />
          {l.managerNotes && l.status === "CHANGES_REQUESTED" && <div className="small pre" style={{ marginTop: ".5rem" }}>הערות אחרונות: {l.managerNotes}</div>}
        </section>
      </div>

      <section className="card">
        <h2>עריכת המערך</h2>
        <ActForm action={onSave} keepValues className="stack" key={l.updatedAt}>
          <label>שם<input name="title" required defaultValue={l.title} /></label>
          <div className="fields">
            <label>סטטוס<select name="status" defaultValue={l.status}>{LESSON_STATUSES.map((s) => <option key={s} value={s}>{LESSON_STATUS[s]}</option>)}</select></label>
            <label>תחום<select name="subject" defaultValue={l.subject}>{SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT[s]}</option>)}</select></label>
            <label>סוג<select name="kind" defaultValue={l.kind}>{LESSON_KINDS.map((k) => <option key={k} value={k}>{LESSON_KIND[k]}</option>)}</select></label>
            <label>משכבה<select name="gradeFrom" defaultValue={l.gradeFrom}>{GRADES.map((g, i) => <option key={g} value={i + 1}>{g}</option>)}</select></label>
            <label>עד שכבה<select name="gradeTo" defaultValue={l.gradeTo}>{GRADES.map((g, i) => <option key={g} value={i + 1}>{g}</option>)}</select></label>
            <label>מקום<select name="location" defaultValue={l.location}>{LESSON_LOCATIONS.map((x) => <option key={x} value={x}>{LOCATION[x]}</option>)}</select></label>
            <label>משך (דקות)<input type="number" name="durationMin" min={15} max={600} defaultValue={l.durationMin} /></label>
            <label>תאריך התחלה<input type="date" name="startDate" defaultValue={l.startDate ?? ""} /></label>
            <label>תאריך יעד סופי<input type="date" name="dueDate" defaultValue={l.dueDate ?? ""} /></label>
          </div>
          <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8, padding: ".5rem .75rem" }}>
            <legend className="small" style={{ fontWeight: 600 }}>מדריכים שעובדים על המערך</legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: ".2rem .75rem", maxHeight: 160, overflowY: "auto" }}>
              {active.map((w) => (
                <label key={w.id} className="check small"><input type="checkbox" name="ownerIds" value={w.id} defaultChecked={l.ownerIds.includes(w.id)} /> {w.name}{w.teamId && <span className="muted"> · {teamMap.get(w.teamId)?.name}</span>}</label>
              ))}
            </div>
          </fieldset>
          <label>מטרות ומושגים<textarea name="goals" defaultValue={l.goals ?? ""} /></label>
          <label>תקציר<textarea name="summary" defaultValue={l.summary ?? ""} /></label>
          <ReviewsEditor initial={l.reviews} />
          <h3 style={{ margin: ".5rem 0 0" }}>חלקי המערך</h3>
          <ActivitiesEditor initial={l.activities} />
          <h3 style={{ margin: ".5rem 0 0" }}>רשימת ציוד, אלרגנים וסכנות</h3>
          <EquipmentEditor initial={l.equipment} />
          <h3 style={{ margin: ".5rem 0 0" }}>בטיחות</h3>
          <SafetyChecks initial={l.safety} suggested={summary.suggestedSafety} />
          <div className="row"><SubmitButton>שמירת המערך</SubmitButton></div>
        </ActForm>
      </section>

      <div className="grid grid-2">
        <section className="card">
          <h2>משימות של המערך</h2>
          {tasks.data.length === 0 ? (
            <p className="empty small">אין משימות</p>
          ) : (
            <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
              {tasks.data.map((t) => (
                <li key={t.id}>
                  <Link to={`/admin/tasks/${t.id}`}>{t.title}</Link>{" "}
                  <span className="muted small">
                    {t.teamId && `· ${teamMap.get(t.teamId)?.name ?? ""} `}
                    {t.assigneeId && `· ${workerMap.get(t.assigneeId)?.name ?? ""} `}
                    {t.dueDate && `· ${formatDate(t.dueDate)}`}
                  </span>{" "}
                  <Badge value={t.status} label={TASK_STATUS[t.status]} />
                </li>
              ))}
            </ul>
          )}
          <ActForm action={onTask} className="stack" style={{ marginTop: ".75rem" }}>
            <input name="title" required placeholder="משימה חדשה (למשל: להזמין מגנזיום, לתקן מנדף)" />
            <div className="fields">
              <label>
                מחלקה
                <select name="teamId" defaultValue={dept("מעבדה")?.id ?? ""}>
                  <option value="">— ללא —</option>
                  {teams.data.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label>
                עובד/ת (לא חובה)
                <select name="assigneeId" defaultValue="">
                  <option value="">— ללא —</option>
                  {active.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label>תאריך יעד<input type="date" name="dueDate" /></label>
            </div>
            <div><SubmitButton className="btn secondary sm">+ הוספת משימה</SubmitButton></div>
          </ActForm>
        </section>

        <section className="card">
          <h2>הזמנות ציוד למערך</h2>
          {toOrder.length > 0 && (
            <>
              <p className="small" style={{ marginTop: 0 }}>פריטים שסומנו "צריך להזמין":</p>
              <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
                {toOrder.map((i) => (
                  <li key={i.id} style={{ marginBottom: ".3rem" }}>
                    {i.name} {i.quantity && <span className="muted">× {i.quantity}</span>}{" "}
                    {ordered.has(i.name) ? <span className="badge green">הוזמן במערכת</span> : <button type="button" className="btn secondary sm" onClick={() => onOrder(i)}>בקשת הזמנה</button>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {orders.data.length === 0 ? (
            <p className="empty small">אין בקשות הזמנה למערך</p>
          ) : (
            <table style={{ marginTop: ".5rem" }}>
              <tbody>
                {orders.data.map((o) => (
                  <tr key={o.id}><td>{o.item} × {o.quantity}</td><td><Badge value={o.status} label={EQUIPMENT_STATUS[o.status]} /></td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="small" style={{ marginBottom: 0 }}><Link to="/admin/equipment">לכל הזמנות הציוד ←</Link></p>
        </section>
      </div>

      <div className="row no-print">
        <button type="button" className="btn danger sm" onClick={() => onDelete()}>מחיקת המערך</button>
      </div>
    </>
  );
}
