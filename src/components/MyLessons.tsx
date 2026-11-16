import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useCollection } from "@/lib/data";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { summarizeLesson, submitBlocker } from "@/lib/allergens";
import { formatSize, MAX_FILE_SIZE } from "@/lib/files";
import { LESSON_KIND, SUBJECT, gradeRange, isLessonLate, withLessonDefaults } from "@/lib/lessons";
import { saveMyLesson, submitMyLesson } from "@/lib/workerLessonActions";
import type { Lesson, LessonActivity, LessonItem, LessonSubmission, WithId } from "@/lib/types";
import { ActForm } from "./ActForm";
import { SubmitButton } from "./SubmitButton";
import { errorText, useAct, useFlash } from "./Flash";
import { ReviewList } from "./Reviews";
import { ActivitiesEditor, EquipmentEditor, LessonStatusBadge, SafetyChecks, SafetyTags, cleanActivities, cleanItems, readJsonField } from "./LessonParts";

type Who = { token: string; workerId: string; workerName: string };

/** "המערכים שלי" on the instructor's personal page. */
export function MyLessons({ who }: { who: Who }) {
  const lessons = useCollection<Lesson>("lessons", { where: ["ownerIds", "array-contains", who.workerId] });
  const list = lessons.data
    .map((l) => withLessonDefaults(l))
    .filter((l) => l.status !== "ARCHIVED")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  if (!list.length) return null;
  return (
    <section style={{ marginBottom: "1.25rem" }}>
      <h2>המערכים שלי ({list.length})</h2>
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

  const onSave = act(async (fd: FormData) => {
    await saveMyLesson(who, l, {
      equipment: cleanItems(readJsonField<LessonItem>(fd, "equipment")),
      activities: cleanActivities(readJsonField<LessonActivity>(fd, "activities")),
      safety: fd.getAll("safety").map(String),
    });
  }, "המערך נשמר");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return show("יש לבחור את קובץ המערך", true);
    const note = String(fd.get("note") ?? "").trim() || null;
    try {
      setProgress("מעלה את הקובץ…");
      await submitMyLesson(who, l, file, note, (d, t) => setProgress(`מעלה את הקובץ… ${Math.round((d / t) * 100)}%`));
      form.reset();
      show("המערך נשלח לבדיקה. הקובץ יגיע למנהלת התכנית במייל תוך כ-10–15 דקות.");
    } catch (err) {
      show(errorText(err), true);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className={`task-item${late ? " overdue" : ""}`}>
      <div className="spread">
        <Link to={`/lesson/${l.id}?w=${who.token}`} className="task-link"><strong>{l.title}</strong></Link>
        <LessonStatusBadge status={l.status} />
      </div>
      <div className="muted small">
        {SUBJECT[l.subject]} · {gradeRange(l.gradeFrom, l.gradeTo)} · {LESSON_KIND[l.kind]} · יעד סופי:{" "}
        <span className={late ? "danger-text" : ""}>{formatDate(l.dueDate) || "לא נקבע"}</span>
      </div>
      <div style={{ margin: ".3rem 0" }}><SafetyTags lesson={l} /></div>
      <ReviewList reviews={l.reviews} compact />

      {l.status === "CHANGES_REQUESTED" && l.managerNotes && (
        <div className="flash error" style={{ margin: ".5rem 0" }}>
          <div className="small">הערות מהמנהלת:</div>
          <div className="pre">{l.managerNotes}</div>
        </div>
      )}

      {history.length > 0 && (
        <div className="small" style={{ margin: ".3rem 0" }}>
          שליחה אחרונה: גרסה {history[0].version} · {formatDateTime(history[0].submittedAt)} ·{" "}
          {history[0].decision === "APPROVED" ? "✓ אושר" : history[0].decision === "CHANGES_REQUESTED" ? "הוחזר עם הערות" : history[0].emailStatus === "sent" ? "✓ הגיע למנהלת, ממתין להחלטה" : history[0].emailStatus === "failed" ? "שליחת המייל נכשלה – המנהלת תראה את זה במערכת" : "בדרך למנהלת"}
        </div>
      )}

      {editable && (
        <>
          <details>
            <summary>עריכת רשימת הציוד, חלקי המערך ובטיחות</summary>
            <ActForm action={onSave} keepValues className="stack" key={l.updatedAt}>
              <h3 style={{ margin: 0 }}>חלקי המערך</h3>
              <ActivitiesEditor initial={l.activities} />
              <h3 style={{ margin: ".5rem 0 0" }}>רשימת ציוד</h3>
              <EquipmentEditor initial={l.equipment} />
              <h3 style={{ margin: ".5rem 0 0" }}>בטיחות</h3>
              <SafetyChecks initial={l.safety} suggested={summary.suggestedSafety} />
              <div><SubmitButton>שמירה</SubmitButton></div>
            </ActForm>
          </details>
          <details>
            <summary>שליחת קובץ המערך לבדיקה</summary>
            <form onSubmit={onSubmit} className="stack">
              <label>
                קובץ המערך (PDF, Word או PowerPoint, עד {formatSize(MAX_FILE_SIZE)})
                <input type="file" name="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.odt,.odp" />
              </label>
              <label>הערה למנהלת (לא חובה)<textarea name="note" maxLength={2000} placeholder="מה השתנה בגרסה הזו?" /></label>
              {blocker && <div className="danger-text small">{blocker}</div>}
              <div className="row">
                <button type="submit" className="btn" disabled={!!progress || !!blocker}>{progress ?? "שליחה לבדיקה"}</button>
                <span className="muted small">הקובץ נשלח במייל למנהלת התכנית, והסטטוס יתעדכן ל"נשלח לבדיקה".</span>
              </div>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
