import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { byId, useAdmin, useCollection, useDocument } from "@/lib/data";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { ALLERGENS, HAZARD_ICON, HAZARDS, SAFETY, allergenCheck, allergenNames, summarizeLesson } from "@/lib/allergens";
import { ACTIVITY_KIND, GRADES, ITEM_FOR_LABEL, LESSON_KIND, LESSON_STATUS, LOCATION, SUBJECT, gradeRange, isLessonLate, withLessonDefaults } from "@/lib/lessons";
import { nextReview } from "@/lib/reviews";
import { ITEM_FOR, SUBJECTS, type Lesson, type LessonStatus, type LessonSubmission, type WithId, type Worker } from "@/lib/types";
import { ReviewList } from "@/components/Reviews";
import { LessonStatusBadge, SafetyTags } from "@/components/LessonParts";

function TopBar({ back = "/", children }: { back?: string; children?: React.ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to={back} className="brand">→ לוח משימות משותף</Link>
        <span style={{ flex: 1 }} />
        {children}
      </div>
    </header>
  );
}

const BOARD_COLUMNS: LessonStatus[] = ["IDEA", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "ACTIVE"];

/** #/lessons – every lesson by status: who works on it and the deadline. */
export function LessonsBoard() {
  const [sp, setSp] = useSearchParams();
  const subject = sp.get("subject") ?? "";
  const w = sp.get("w");
  const lessons = useCollection<Lesson>("lessons");
  const workers = useCollection<Worker>("workers");
  const workerMap = byId(workers.data);
  const today = todayLocal();
  const list = lessons.data.map((l) => withLessonDefaults(l)).filter((l) => !subject || l.subject === subject);

  return (
    <>
      <TopBar back={w ? `/?w=${w}` : "/"}>
        <Link to={`/allergens${w ? `?w=${w}` : ""}`} className="btn ghost sm">בודק אלרגיות</Link>
      </TopBar>
      <main className="container" style={{ maxWidth: 1400 }}>
        <div className="spread">
          <h1>מערכים – תכנית המדעים</h1>
          <div className="row">
            <button className={`btn sm ${!subject ? "" : "ghost"}`} onClick={() => setSp(w ? { w } : {})}>הכול</button>
            {SUBJECTS.map((s) => (
              <button key={s} className={`btn sm ${subject === s ? "" : "ghost"}`} onClick={() => setSp({ ...(w ? { w } : {}), subject: s })}>{SUBJECT[s]}</button>
            ))}
          </div>
        </div>
        {lessons.loading ? (
          <p className="muted">טוען…</p>
        ) : (
          <div className="kanban">
            {BOARD_COLUMNS.map((st) => {
              const col = list.filter((l) => l.status === st).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
              return (
                <div key={st} className="kanban-col">
                  <h3><span>{LESSON_STATUS[st]}</span><span className="muted">{col.length}</span></h3>
                  {col.map((l) => {
                    const late = isLessonLate(l, today);
                    const r = nextReview(l.reviews);
                    return (
                      <div key={l.id} className="kanban-card">
                        <Link to={`/lesson/${l.id}${w ? `?w=${w}` : ""}`} className="task-link"><strong>{l.title}</strong></Link>
                        <span className="muted small">{SUBJECT[l.subject]} · {gradeRange(l.gradeFrom, l.gradeTo)} · {LESSON_KIND[l.kind]}</span>
                        <span className="small">👤 {l.ownerIds.map((id) => workerMap.get(id)?.name).filter(Boolean).join(", ") || "לא שויך"}</span>
                        {l.dueDate && <span className={`small ${late ? "danger-text" : "muted"}`}>יעד: {formatDate(l.dueDate)}{late && " · באיחור"}</span>}
                        {r && <span className="small muted">ביקורת: {formatDate(r.date)}{r.note && ` – ${r.note}`}</span>}
                        <SafetyTags lesson={l} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

/** #/lesson/:id – read-only view of a lesson (no files). */
export function LessonView() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const w = sp.get("w");
  const { isAdmin } = useAdmin();
  const doc = useDocument<Lesson>(`lessons/${id}`);
  const workers = useCollection<Worker>("workers");
  const subs = useCollection<LessonSubmission>("lessonSubmissions", { where: ["lessonId", "==", id] });
  const workerMap = byId(workers.data);
  const back = w ? `/lessons?w=${w}` : "/lessons";

  if (doc.loading) return <><TopBar /><main className="container"><p className="muted">טוען…</p></main></>;
  if (!doc.data) return <><TopBar /><main className="container"><div className="card"><h1>המערך לא נמצא</h1></div></main></>;
  const l = withLessonDefaults(doc.data);
  const s = summarizeLesson(l);
  const history = [...subs.data].sort((a, b) => b.submittedAt - a.submittedAt);

  return (
    <>
      <TopBar back={back}>
        <Link to={`/lesson/${l.id}/print`} className="btn ghost sm">רשימת ציוד להדפסה</Link>
        {isAdmin && <Link to={`/admin/lessons/${l.id}`} className="btn ghost sm">עריכה</Link>}
      </TopBar>
      <main className="container" style={{ maxWidth: 960 }}>
        <div className="spread">
          <h1 style={{ marginBottom: ".2rem" }}>{l.title}</h1>
          <LessonStatusBadge status={l.status} />
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {SUBJECT[l.subject]} · {LESSON_KIND[l.kind]} · {gradeRange(l.gradeFrom, l.gradeTo)} · {LOCATION[l.location]} · {l.durationMin} דקות
        </p>
        <div className="stats">
          <div className="stat"><div className="lbl">מי עובד עליו</div><strong>{l.ownerIds.map((x) => workerMap.get(x)?.name).filter(Boolean).join(", ") || "לא שויך"}</strong></div>
          <div className="stat"><div className="lbl">תאריך יעד סופי</div><strong className={isLessonLate(l, todayLocal()) ? "danger-text" : ""}>{formatDate(l.dueDate) || "לא נקבע"}</strong></div>
          <div className="stat"><div className="lbl">גרסה אחרונה שנשלחה</div><strong>{l.version ? `${l.version} · ${formatDateTime(l.lastSubmittedAt)}` : "—"}</strong></div>
        </div>

        <section className="card">
          <h2>אלרגנים ובטיחות</h2>
          <SafetyTags lesson={l} showNone />
          {(l.safety.length > 0 || s.missingSafety.length > 0) && (
            <p className="small" style={{ marginBottom: 0 }}>
              דרישות בטיחות: {l.safety.map((x) => SAFETY[x]).join(", ") || "—"}
              {s.missingSafety.length > 0 && <span className="danger-text"> · מומלץ להוסיף: {s.missingSafety.map((x) => SAFETY[x]).join(", ")}</span>}
            </p>
          )}
        </section>

        {(l.goals || l.summary || l.activities.length > 0) && (
          <section className="card">
            <h2>המערך</h2>
            {l.goals && <p className="pre"><strong>מטרות ומושגים: </strong>{l.goals}</p>}
            {l.summary && <p className="pre">{l.summary}</p>}
            {l.activities.length > 0 && (
              <ol style={{ margin: 0, paddingInlineStart: "1.3rem" }}>
                {l.activities.map((a) => <li key={a.id}><span className="muted small">{ACTIVITY_KIND[a.kind]}: </span>{a.title}</li>)}
              </ol>
            )}
          </section>
        )}

        <section className="card">
          <h2>תאריכים</h2>
          <p className="small" style={{ marginTop: 0 }}>התחלה: {formatDate(l.startDate) || "—"}</p>
          <ReviewList reviews={l.reviews} dueDate={l.dueDate} />
        </section>

        <section className="card">
          <h2>רשימת ציוד ({l.equipment.length})</h2>
          <EquipmentTable lesson={l} />
        </section>

        <section className="card">
          <h2>היסטוריית שליחות</h2>
          {history.length === 0 ? (
            <p className="empty">עוד לא נשלח קובץ לבדיקה</p>
          ) : (
            <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
              {history.map((h) => (
                <li key={h.id}>
                  גרסה {h.version} · {formatDateTime(h.submittedAt)} · {h.submittedBy ? workerMap.get(h.submittedBy)?.name : "מנהלת"}
                  {h.decision && <strong> · {h.decision === "APPROVED" ? "אושר" : "הוחזר עם הערות"}</strong>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function EquipmentTable({ lesson, print }: { lesson: Lesson; print?: boolean }) {
  if (!lesson.equipment.length) return <p className="empty">רשימת הציוד ריקה</p>;
  return (
    <>
      {ITEM_FOR.map((f) => {
        const items = lesson.equipment.filter((i) => i.for === f);
        if (!items.length) return null;
        return (
          <div key={f} style={{ marginBottom: "1rem" }}>
            <h3>{ITEM_FOR_LABEL[f]}</h3>
            <div className="table-wrap">
              <table className="print-table">
                <thead>
                  <tr>{print && <th>✓</th>}<th>פריט</th><th>כמות</th><th>אלרגנים</th><th>סכנות</th><th>הערות</th></tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const al = allergenNames({ allergens: i.allergens, allergenOther: i.allergenOther ? [i.allergenOther] : [] });
                    return (
                      <tr key={i.id} className={al.length ? "overdue" : ""}>
                        {print && <td className="box"><span /></td>}
                        <td>{i.food && "🍎 "}<strong>{i.name}</strong>{i.toOrder && <span className="badge amber" style={{ marginInlineStart: 4 }}>להזמין</span>}</td>
                        <td>{i.quantity}</td>
                        <td className={al.length ? "danger-text" : "muted"}>{al.length ? al.join(", ") : i.food ? (i.noKnownAllergens ? "ללא ידועים" : "⚠ לא צוין") : "—"}</td>
                        <td>{i.hazards.map((h) => `${HAZARD_ICON[h]} ${HAZARDS[h]}`).join(", ") || <span className="muted">—</span>}</td>
                        <td className="small">{i.notes}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** #/lesson/:id/print – equipment checklist for the lab, with allergen and safety warnings. */
export function LessonPrint() {
  const { id = "" } = useParams();
  const doc = useDocument<Lesson>(`lessons/${id}`);
  if (doc.loading) return <main className="container"><p className="muted">טוען…</p></main>;
  if (!doc.data) return <main className="container"><h1>המערך לא נמצא</h1></main>;
  const l = withLessonDefaults(doc.data);
  const s = summarizeLesson(l);
  const names = allergenNames(s);
  return (
    <main className="container" style={{ maxWidth: 900 }}>
      <div className="row no-print" style={{ marginBottom: "1rem" }}>
        <Link to={`/lesson/${l.id}`} className="btn ghost sm">→ חזרה למערך</Link>
        <button className="btn sm" onClick={() => window.print()}>🖨 הדפסה</button>
      </div>
      <h1 style={{ marginBottom: ".2rem" }}>רשימת ציוד: {l.title}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {SUBJECT[l.subject]} · כיתות {GRADES[l.gradeFrom - 1]}–{GRADES[l.gradeTo - 1]} · {LOCATION[l.location]} · {l.durationMin} דקות
      </p>
      {(s.food || names.length > 0 || s.hazards.length > 0 || l.safety.length > 0) && (
        <section className="card" style={{ borderColor: "var(--danger)" }}>
          <h2 className="danger-text">⚠ לתשומת לב לפני הרצועה</h2>
          {s.food && <p style={{ margin: ".2rem 0" }}><strong>המערך כולל מזון.</strong> לבדוק מול הקבוצה אם יש ילדים אלרגיים.</p>}
          {names.length > 0 && <p style={{ margin: ".2rem 0" }}><strong>אלרגנים:</strong> {names.join(", ")}</p>}
          {s.itemsMissingAllergenInfo.length > 0 && <p className="danger-text" style={{ margin: ".2rem 0" }}>חסר מידע על אלרגנים: {s.itemsMissingAllergenInfo.map((i) => i.name).join(", ")}</p>}
          {s.hazards.length > 0 && <p style={{ margin: ".2rem 0" }}><strong>חומרים מסוכנים:</strong> {s.hazards.map((h) => `${HAZARD_ICON[h]} ${HAZARDS[h]}`).join(" · ")}</p>}
          {l.safety.length > 0 && <p style={{ margin: ".2rem 0" }}><strong>בטיחות:</strong> {l.safety.map((x) => SAFETY[x]).join(", ")}</p>}
        </section>
      )}
      <EquipmentTable lesson={l} print />
      <p className="muted small">הודפס מתוך מערכת ניהול המשימות · {formatDateTime(Date.now())}</p>
    </main>
  );
}

/** #/allergens – which lessons contain the selected allergens. */
export function AllergenCheck() {
  const [sp] = useSearchParams();
  const w = sp.get("w");
  const [selected, setSelected] = useState<string[]>([]);
  const [onlyActive, setOnlyActive] = useState(true);
  const lessons = useCollection<Lesson>("lessons");
  const list = lessons.data
    .map((l) => withLessonDefaults(l))
    .filter((l) => l.status !== "ARCHIVED" && (!onlyActive || ["APPROVED", "ACTIVE"].includes(l.status)));
  const r = allergenCheck<WithId<Lesson>>(list, selected);
  const link = (l: WithId<Lesson>) => `/lesson/${l.id}${w ? `?w=${w}` : ""}`;

  return (
    <>
      <TopBar back={w ? `/?w=${w}` : "/"}>
        <Link to={`/lessons${w ? `?w=${w}` : ""}`} className="btn ghost sm">לוח מערכים</Link>
      </TopBar>
      <main className="container" style={{ maxWidth: 960 }}>
        <h1>בודק אלרגיות</h1>
        <p className="muted" style={{ marginTop: "-.5rem" }}>מסמנים את האלרגיות של ילדים בקבוצה ומקבלים אילו מערכים מכילים אותן.</p>
        <section className="card">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: ".3rem .8rem" }}>
            {Object.entries(ALLERGENS).filter(([k]) => k !== "OTHER").map(([k, v]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={selected.includes(k)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, k] : s.filter((x) => x !== k)))} /> {v}
              </label>
            ))}
          </div>
          <label className="check small" style={{ marginTop: ".6rem" }}>
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> רק מערכים מאושרים ופעילים
          </label>
        </section>
        {selected.length === 0 ? (
          <p className="muted">בחרו לפחות אלרגיה אחת.</p>
        ) : (
          <div className="grid grid-2">
            <section className="card" style={{ borderColor: "var(--danger)" }}>
              <h2 className="danger-text">⚠ מכילים ({r.contains.length})</h2>
              {r.contains.length === 0 ? <p className="empty">אף מערך</p> : (
                <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
                  {r.contains.map(({ lesson, items }) => (
                    <li key={lesson.id} style={{ marginBottom: ".4rem" }}>
                      <Link to={link(lesson)}><strong>{lesson.title}</strong></Link>
                      <div className="small">{items.map((i) => `${i.name} (${i.allergens.filter((a) => selected.includes(a)).map((a) => ALLERGENS[a]).join(", ")})`).join(" · ")}</div>
                    </li>
                  ))}
                </ul>
              )}
              {r.unknown.length > 0 && (
                <>
                  <h3 style={{ marginTop: "1rem" }}>חסר מידע – לבדוק ידנית ({r.unknown.length})</h3>
                  <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
                    {r.unknown.map(({ lesson, items }) => (
                      <li key={lesson.id}><Link to={link(lesson)}>{lesson.title}</Link> <span className="small muted">({items.map((i) => i.name).join(", ")})</span></li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            <section className="card">
              <h2>לא מכילים ({r.safe.length})</h2>
              {r.safe.length === 0 ? <p className="empty">אף מערך</p> : (
                <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
                  {r.safe.map((l) => <li key={l.id}><Link to={link(l)}>{l.title}</Link> <span className="small muted">· {gradeRange(l.gradeFrom, l.gradeTo)}</span></li>)}
                </ul>
              )}
              <p className="muted small" style={{ marginBottom: 0 }}>הבדיקה מבוססת על רשימות הציוד שהוזנו למערכת. תמיד לוודא מול המדריך.</p>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
