import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useCollection } from "@/lib/data";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { summarizeLesson, submitBlocker } from "@/lib/allergens";
import { formatSize, MAX_FILE_SIZE } from "@/lib/files";
import { INSTRUCTOR_STATUSES, LESSON_KIND, LESSON_STATUS, LOCATION, SUBJECT, gradeLabel, isLessonLate, withLessonDefaults } from "@/lib/lessons";
import { askManager, saveMyLesson, setMyLessonStatus, submitMyLesson, type Who } from "@/lib/workerLessonActions";
import { optStr, str } from "@/lib/formdata";
import type { Lesson, LessonActivity, LessonItem, LessonStatus, LessonSubmission, WithId } from "@/lib/types";
import { ActForm } from "./ActForm";
import { SubmitButton } from "./SubmitButton";
import { errorText, useAct, useFlash } from "./Flash";
import { ReviewList } from "./Reviews";
import { ActivitiesEditor, EquipmentEditor, LessonStatusBadge, SafetyChecks, SafetyTags, cleanActivities, cleanItems, readJsonField } from "./LessonParts";

/** "המערכים שלי" on the instructor's page. */
export function MyLessons({ who }: { who: Who }) {
  const lessons = useCollection<Lesson>("lessons", { where: ["ownerIds", "array-contains", who.workerId] });
  const list = lessons.data
    .map((l) => withLessonDefaults(l))
    .filter((l) => l.status !== "ARCHIVED")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  return (
    <section style={{ marginBottom: "1.25rem" }}>
      <h1>המערכים שלי ({list.length})</h1>
      {lessons.loading && <p className="muted">טוען…</p>}
      {!lessons.loading && !list.length && (
        <div className="card empty">
          עוד לא שויכת למערך. אפשר לראות את כל המערכים ב<Link to="/lessons">לוח המערכים</Link>.
        </div>
      )}
      <div className="task-list">
        {list.map((l) => <MyLesson key={l.id} lesson={l} who={who} />)}
      </div>
    </section>
  );
}

function MyLesson({ lesson: l, who }: { lesson: WithId<Lesson>; who: Who }) {
  const act = useAct();
  const { show } = useFlash();
  const [progress, setProgress] = useState<string | null>(null);
  const subs = useCollection<LessonSubmission>("lessonSubmissions", { where: ["lessonId", "==", l.id] });
  const history = [...subs.data].sort((a, b) => b.submittedAt - a.submittedAt);
  const late = isLessonLate(l, todayLocal());
  const editable = !["APPROVED", "ACTIVE", "ARCHIVED"].includes(l.status);
  const blocker = submitBlocker(l);
  const summary = summarizeLesson(l);

  const onStatus = act(async (status: LessonStatus) => {
    await setMyLessonStatus(l, status);
  }, "הסטטוס עודכן");

  const onSave = act(async (fd: FormData) => {
    await saveMyLesson(who, l, {
      equipment: cleanItems(readJsonField<LessonItem>(fd, "equipment")),
      activities: cleanActivities(readJsonField<LessonActivity>(fd, "activities")),
      safety: fd.getAll("safety").map(String),
    });
  }, "המערך נשמר");

  const onAsk = act(async (fd: FormData) => {
    await askManager(who, l, str(fd, "topic"), optStr(fd, "notes"));
  }, "הבקשה נשלחה למנהל");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return show("יש לבחור את קובץ המערך", true);
    try {
      setProgress("מעלה את הקובץ…");
      await submitMyLesson(
        who,
        l,
        file,
        { done: optStr(fd, "done"), next: optStr(fd, "next"), blockers: optStr(fd, "blockers") },
        (d, t) => setProgress(`מעלה את הקובץ… ${Math.round((d / t) * 100)}%`),
      );
      form.reset();
      show("המערך נשלח לבדיקה. הקובץ ודוח הסטטוס יגיעו למנהל במייל תוך כ-10–15 דקות.");
    } catch (err) {
      show(errorText(err), true);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className={`task-item${late ? " overdue" : ""}`}>
      <div className="spread">
        <Link to={`/lesson/${l.id}`} className="task-link"><strong>{l.title}</strong></Link>
        <LessonStatusBadge status={l.status} />
      </div>
      <div className="muted small">
        {LOCATION[l.location]} · {SUBJECT[l.subject]} · {gradeLabel(l.grades)} · {LESSON_KIND[l.kind]} · יעד סופי:{" "}
        <span className={late ? "danger-text" : ""}>{formatDate(l.dueDate) || "לא נקבע"}{late && " (באיחור)"}</span>
      </div>
      <div style={{ margin: ".3rem 0" }}><SafetyTags lesson={l} /></div>
      <ReviewList reviews={l.reviews} compact />

      {l.status === "CHANGES_REQUESTED" && l.managerNotes && (
        <div className="flash error" style={{ margin: ".5rem 0" }}>
          <div className="small">הערות מהמנהל:</div>
          <div className="pre">{l.managerNotes}</div>
        </div>
      )}

      {history.length > 0 && (
        <div className="small" style={{ margin: ".3rem 0" }}>
          שליחה אחרונה: גרסה {history[0].version} · {formatDateTime(history[0].submittedAt)} ·{" "}
          {history[0].decision === "APPROVED"
            ? "✓ אושר"
            : history[0].decision === "CHANGES_REQUESTED"
              ? "הוחזר עם הערות"
              : history[0].emailStatus === "sent"
                ? "✓ הגיע למנהל, ממתין להחלטה"
                : history[0].emailStatus === "failed"
                  ? "שליחת המייל נכשלה – המנהל רואה את זה במערכת"
                  : "בדרך למנהל"}
        </div>
      )}

      {editable && (
        <>
          <div className="row" style={{ margin: ".4rem 0" }}>
            <span className="small">סטטוס:</span>
            {INSTRUCTOR_STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                className={`btn sm ${l.status === st ? "" : "ghost"}`}
                disabled={l.status === st}
                onClick={() => onStatus(st)}
              >
                {LESSON_STATUS[st]}
              </button>
            ))}
            <span className="muted small">כדי לסמן "נשלח לבדיקה" – שולחים את קובץ המערך למטה.</span>
          </div>
          <details>
            <summary>עריכת רשימת הציוד, חלקי המערך ובטיחות</summary>
            <ActForm action={onSave} keepValues className="stack" key={l.updatedAt}>
              <h3 style={{ margin: 0 }}>חלקי המערך</h3>
              <ActivitiesEditor initial={l.activities} />
              <h3 style={{ margin: ".5rem 0 0" }}>רשימת ציוד</h3>
              <p className="muted small" style={{ margin: 0 }}>מה שצריך לקנות – מסמנים "צריך להזמין", והמנהל מזמין מול המעבדה.</p>
              <EquipmentEditor initial={l.equipment} />
              <h3 style={{ margin: ".5rem 0 0" }}>בטיחות</h3>
              <SafetyChecks initial={l.safety} suggested={summary.suggestedSafety} />
              <div><SubmitButton>שמירה</SubmitButton></div>
            </ActForm>
          </details>
          <details>
            <summary>שליחת קובץ המערך לבדיקה + דוח סטטוס</summary>
            <form onSubmit={onSubmit} className="stack">
              <label>
                קובץ המערך (PDF, Word או PowerPoint, עד {formatSize(MAX_FILE_SIZE)})
                <input type="file" name="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.odt,.odp" />
              </label>
              <label>מה הושלם<textarea name="done" maxLength={2000} placeholder="למשל: כל ההדגמות כתובות, רשימת הציוד מעודכנת" /></label>
              <label>מה נשאר<textarea name="next" maxLength={2000} placeholder="למשל: לכתוב את התחרות, הרצה ניסיונית" /></label>
              <label>חסמים / מה צריך מהמנהל<textarea name="blockers" maxLength={2000} placeholder="למשל: צריך פגישה עם המעבדה על מי חמצן" /></label>
              {blocker && <div className="danger-text small">{blocker}</div>}
              <div className="row">
                <button type="submit" className="btn" disabled={!!progress || !!blocker}>{progress ?? "שליחה לבדיקה"}</button>
                <span className="muted small">הקובץ ודוח הסטטוס נשלחים במייל למנהל, והסטטוס מתעדכן ל"נשלח לבדיקה".</span>
              </div>
            </form>
          </details>
        </>
      )}
      <details>
        <summary>בקשה למנהל (פגישה עם צוות אחר, ציוד, עזרה)</summary>
        <ActForm action={onAsk} className="stack">
          <input name="topic" required maxLength={200} placeholder="למשל: צריך פגישה עם המעבדה על החומרים המסוכנים" />
          <textarea name="notes" maxLength={2000} placeholder="פרטים (לא חובה)" />
          <div><SubmitButton className="btn secondary sm">שליחה למנהל</SubmitButton></div>
        </ActForm>
      </details>
    </div>
  );
}
