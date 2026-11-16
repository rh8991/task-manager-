import { Link, useNavigate, useSearchParams } from "react-router";
import { byId, useCollection } from "@/lib/data";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { createLesson } from "@/lib/lessonActions";
import { ALLERGENS } from "@/lib/allergens";
import { GRADES, LESSON_KIND, LESSON_STATUS, LOCATION, SUBJECT, gradeRange, isLessonLate, withLessonDefaults } from "@/lib/lessons";
import { nextReview } from "@/lib/reviews";
import { checked, oneOf, optDate, optInt, str } from "@/lib/formdata";
import { LESSON_KINDS, LESSON_LOCATIONS, LESSON_STATUSES, SUBJECTS, type Lesson, type LessonSubmission, type Team, type Worker } from "@/lib/types";
import { Stat } from "@/components/ui";
import { ActForm } from "@/components/ActForm";
import { SubmitButton } from "@/components/SubmitButton";
import { useAct } from "@/components/Flash";
import { LessonStatusBadge, SafetyTags } from "@/components/LessonParts";

/** All lessons (מערכים): status, who works on them, deadlines, allergens. */
export function LessonsPage() {
  const act = useAct();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const today = todayLocal();
  const lessons = useCollection<Lesson>("lessons");
  const workers = useCollection<Worker>("workers");
  const teams = useCollection<Team>("teams");
  const subs = useCollection<LessonSubmission>("lessonSubmissions", { orderBy: ["submittedAt", "desc"], limit: 300 });
  const workerMap = byId(workers.data);
  const lastSub = new Map<string, LessonSubmission>();
  for (const s of subs.data) if (!lastSub.has(s.lessonId)) lastSub.set(s.lessonId, s);

  // Instructors first (team named "מדריכים"), then everyone else.
  const instructorsTeam = teams.data.find((t) => t.name.includes("מדריכ"));
  const active = workers.data
    .filter((w) => w.active)
    .sort((a, b) => Number(b.teamId === instructorsTeam?.id) - Number(a.teamId === instructorsTeam?.id) || a.name.localeCompare(b.name, "he"));

  const status = sp.get("status") ?? "working";
  const subject = sp.get("subject") ?? "";
  const owner = sp.get("owner") ?? "";
  const allergen = sp.get("allergen") ?? "";
  const all = lessons.data.map((l) => withLessonDefaults(l));
  const list = all
    .filter((l) =>
      status === "working" ? !["APPROVED", "ACTIVE", "ARCHIVED"].includes(l.status) : status === "all" ? l.status !== "ARCHIVED" : l.status === status,
    )
    .filter((l) => !subject || l.subject === subject)
    .filter((l) => !owner || l.ownerIds.includes(owner))
    .filter((l) => !allergen || l.equipment.some((i) => i.allergens.includes(allergen)))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.title.localeCompare(b.title, "he"));
  const count = (s: Lesson["status"]) => all.filter((l) => l.status === s).length;

  const onCreate = act(async (fd: FormData) => {
    const ownerIds = fd.getAll("ownerIds").map(String);
    const id = await createLesson({
      title: str(fd, "title"),
      subject: oneOf(fd, "subject", SUBJECTS) ?? "MULTI",
      kind: oneOf(fd, "kind", LESSON_KINDS) ?? "NEW",
      gradeFrom: optInt(fd, "gradeFrom") ?? 1,
      gradeTo: optInt(fd, "gradeTo") ?? 12,
      location: oneOf(fd, "location", LESSON_LOCATIONS) ?? "PARK_LAB",
      durationMin: 90,
      goals: null,
      summary: null,
      ownerIds,
      startDate: optDate(fd, "startDate"),
      dueDate: optDate(fd, "dueDate"),
      status: ownerIds.length && checked(fd, "started") ? "IN_PROGRESS" : "IDEA",
      reviews: [],
      activities: [],
      equipment: [],
      safety: [],
    });
    navigate(`/admin/lessons/${id}`);
    return ownerIds.length ? "המערך נוצר. המדריכים יקבלו מייל בדקות הקרובות." : "המערך נוצר";
  });

  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    setSp(next);
  };

  return (
    <>
      <div className="spread">
        <h1>מערכים</h1>
        <div className="row">
          <Link to="/lessons" className="btn ghost sm">לוח מערכים</Link>
          <Link to="/allergens" className="btn ghost sm">בודק אלרגיות</Link>
        </div>
      </div>

      <div className="stats">
        {(["IDEA", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "ACTIVE"] as const).map((s) => (
          <button key={s} type="button" className="stat" style={{ textAlign: "start", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => setFilter("status", s)}>
            <div className="num">{count(s)}</div>
            <div className="lbl">{LESSON_STATUS[s]}</div>
          </button>
        ))}
        <Stat num={all.filter((l) => isLessonLate(l, today)).length} label="באיחור" alert={all.some((l) => isLessonLate(l, today))} />
      </div>

      <details className="card" open={sp.get("new") === "1" || (!lessons.loading && all.length === 0) || undefined}>
        <summary>+ מערך חדש</summary>
        <ActForm action={onCreate} className="stack">
          <label>שם המערך<input name="title" required placeholder='למשל: המרות אנרגיה – חט"ב' /></label>
          <div className="fields">
            <label>תחום<select name="subject" defaultValue="CHEMISTRY">{SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT[s]}</option>)}</select></label>
            <label>סוג<select name="kind" defaultValue="NEW">{LESSON_KINDS.map((k) => <option key={k} value={k}>{LESSON_KIND[k]}</option>)}</select></label>
            <label>משכבה<select name="gradeFrom" defaultValue={7}>{GRADES.map((g, i) => <option key={g} value={i + 1}>{g}</option>)}</select></label>
            <label>עד שכבה<select name="gradeTo" defaultValue={9}>{GRADES.map((g, i) => <option key={g} value={i + 1}>{g}</option>)}</select></label>
            <label>מקום<select name="location" defaultValue="PARK_LAB">{LESSON_LOCATIONS.map((l) => <option key={l} value={l}>{LOCATION[l]}</option>)}</select></label>
            <label>תאריך התחלה<input type="date" name="startDate" /></label>
            <label>תאריך יעד סופי<input type="date" name="dueDate" /></label>
          </div>
          <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8, padding: ".5rem .75rem" }}>
            <legend className="small" style={{ fontWeight: 600 }}>מדריכים שעובדים על המערך</legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: ".2rem .75rem", maxHeight: 160, overflowY: "auto" }}>
              {active.map((w) => <label key={w.id} className="check small"><input type="checkbox" name="ownerIds" value={w.id} /> {w.name}</label>)}
            </div>
          </fieldset>
          <label className="check"><input type="checkbox" name="started" defaultChecked /> העבודה כבר התחילה (סטטוס "בכתיבה")</label>
          <div className="row">
            <SubmitButton>יצירת מערך</SubmitButton>
            <span className="muted small">אחר כך ממשיכים בדף המערך: חלקי המערך, רשימת ציוד, אלרגנים ותאריכי ביקורת.</span>
          </div>
        </ActForm>
      </details>

      <div className="card row">
        <select aria-label="סטטוס" value={status} onChange={(e) => setFilter("status", e.target.value)} style={{ maxWidth: 190 }}>
          <option value="working">בעבודה (לא אושרו)</option>
          <option value="all">כל המערכים</option>
          {LESSON_STATUSES.map((s) => <option key={s} value={s}>{LESSON_STATUS[s]}</option>)}
        </select>
        <select aria-label="תחום" value={subject} onChange={(e) => setFilter("subject", e.target.value)} style={{ maxWidth: 150 }}>
          <option value="">כל התחומים</option>
          {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT[s]}</option>)}
        </select>
        <select aria-label="מדריך" value={owner} onChange={(e) => setFilter("owner", e.target.value)} style={{ maxWidth: 170 }}>
          <option value="">כל המדריכים</option>
          {active.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select aria-label="מכיל אלרגן" value={allergen} onChange={(e) => setFilter("allergen", e.target.value)} style={{ maxWidth: 170 }}>
          <option value="">כל האלרגנים</option>
          {Object.entries(ALLERGENS).map(([k, v]) => <option key={k} value={k}>מכיל: {v}</option>)}
        </select>
        {[...sp.keys()].length > 0 && <Link to="/admin/lessons" className="small">ניקוי</Link>}
      </div>

      <section className="card">
        <p className="muted small" style={{ marginTop: 0 }}>{list.length} מערכים</p>
        {lessons.loading ? (
          <p className="muted">טוען…</p>
        ) : list.length === 0 ? (
          <p className="empty">אין מערכים להצגה</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>מערך</th><th>מי עובד עליו</th><th>סטטוס</th><th>יעד סופי</th><th>ביקורת הבאה</th><th>אלרגנים ובטיחות</th><th>שליחה אחרונה</th></tr>
              </thead>
              <tbody>
                {list.map((l) => {
                  const late = isLessonLate(l, today);
                  const r = nextReview(l.reviews);
                  const s = lastSub.get(l.id);
                  return (
                    <tr key={l.id} className={late ? "overdue" : ""}>
                      <td>
                        <Link to={`/admin/lessons/${l.id}`}><strong>{l.title}</strong></Link>
                        <div className="muted small">{SUBJECT[l.subject]} · {gradeRange(l.gradeFrom, l.gradeTo)} · {LESSON_KIND[l.kind]}</div>
                      </td>
                      <td>{l.ownerIds.map((id) => workerMap.get(id)?.name).filter(Boolean).join(", ") || <span className="muted">לא שויך</span>}</td>
                      <td><LessonStatusBadge status={l.status} /></td>
                      <td className={`nowrap ${late ? "danger-text" : ""}`}>{formatDate(l.dueDate) || "—"}</td>
                      <td className={`nowrap small ${r && r.date < today ? "danger-text" : ""}`}>{r ? <>{formatDate(r.date)}{r.note && <div className="muted">{r.note}</div>}</> : "—"}</td>
                      <td><SafetyTags lesson={l} /></td>
                      <td className="small">
                        {s ? (
                          <>
                            גרסה {s.version} · {formatDateTime(s.submittedAt)}
                            <div className={s.emailStatus === "failed" ? "danger-text" : "muted"}>
                              {s.emailStatus === "sent" ? "✓ נשלח למייל" : s.emailStatus === "failed" ? "שליחת המייל נכשלה" : "ממתין לשליחה"}
                            </div>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
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
