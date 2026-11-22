import { formatDate } from "./dates";
import { C, esc, layout } from "./email-templates";
import { HAZARD_ICON, HAZARDS, SAFETY, allergenNames, summarizeLesson } from "./allergens";
import { ACTIVITY_KIND, LESSON_KIND, LESSON_STATUS, LOCATION, SUBJECT, gradeLabel } from "./lessons";
import { sortedReviews } from "./reviews";
import type { Lesson } from "./types";

/** Hebrew RTL emails about lessons (מערכים). */

function safetyBlock(lesson: Lesson): { html: string; text: string } {
  const s = summarizeLesson(lesson);
  const names = allergenNames(s);
  const lines: string[] = [];
  if (s.food) lines.push("⚠ המערך כולל מזון");
  if (names.length) lines.push(`אלרגנים: ${names.join(", ")}`);
  if (s.itemsMissingAllergenInfo.length) lines.push(`חסר מידע על אלרגנים: ${s.itemsMissingAllergenInfo.map((i) => i.name).join(", ")}`);
  if (s.hazards.length) lines.push(`חומרים מסוכנים: ${s.hazards.map((h) => `${HAZARD_ICON[h]} ${HAZARDS[h]}`).join(", ")}`);
  if (lesson.safety.length) lines.push(`בטיחות: ${lesson.safety.map((x) => SAFETY[x]).join(", ")}`);
  if (!lines.length) return { html: "", text: "" };
  return {
    html: `<div style="border:1px solid ${C.red};border-radius:8px;padding:10px 14px;margin:12px 0;background:#fff7f7;">${lines
      .map((l) => `<div>${esc(l)}</div>`)
      .join("")}</div>`,
    text: `\n${lines.join("\n")}\n`,
  };
}

function details(lesson: Lesson, ownerNames: string[]) {
  return `<div style="font-size:14px;color:${C.muted};">
  ${esc(SUBJECT[lesson.subject])} · ${esc(LESSON_KIND[lesson.kind])} · ${esc(gradeLabel(lesson.grades))} · ${esc(LOCATION[lesson.location])} · ${lesson.durationMin} דקות<br>
  מדריכים: <strong>${esc(ownerNames.join(", ") || "—")}</strong><br>
  תאריך יעד סופי: <strong>${lesson.dueDate ? formatDate(lesson.dueDate) : "לא נקבע"}</strong> · פריטי ציוד: ${lesson.equipment.length}
</div>`;
}

export type SubmissionReport = { done: string | null; next: string | null; blockers: string | null } | null | undefined;

/**
 * The status report sent with a lesson file: status, deadline, review dates, equipment,
 * allergens / hazards, and what the instructor wrote (done / next / blockers).
 * Pure function (unit-tested): rows of [label, value].
 */
export function statusReportRows(lesson: Lesson, report: SubmissionReport, today: string): [string, string][] {
  const rows: [string, string][] = [];
  rows.push(["סטטוס", LESSON_STATUS[lesson.status]]);
  rows.push(["מקום וגיל", `${LOCATION[lesson.location]} · ${gradeLabel(lesson.grades)}`]);
  if (lesson.dueDate) {
    const days = Math.round((Date.parse(lesson.dueDate) - Date.parse(today)) / 864e5);
    const when = days > 0 ? `עוד ${days} ימים` : days === 0 ? "היום" : `באיחור של ${-days} ימים`;
    rows.push(["תאריך יעד סופי", `${formatDate(lesson.dueDate)} (${when})`]);
  } else rows.push(["תאריך יעד סופי", "לא נקבע"]);
  const reviews = sortedReviews(lesson.reviews);
  if (reviews.length) {
    const done = reviews.filter((r) => r.done).length;
    const next = reviews.find((r) => !r.done);
    rows.push(["ביקורות", `${done} מתוך ${reviews.length} בוצעו${next ? ` · הבאה: ${formatDate(next.date)}${next.note ? ` – ${next.note}` : ""}` : ""}`]);
  }
  if (lesson.activities.length) rows.push(["חלקי המערך", lesson.activities.map((x) => `${ACTIVITY_KIND[x.kind]}: ${x.title}`).join(" · ")]);
  const toOrder = lesson.equipment.filter((i) => i.toOrder);
  rows.push(["רשימת ציוד", `${lesson.equipment.length} פריטים${toOrder.length ? ` · צריך להזמין: ${toOrder.map((i) => i.name + (i.quantity ? ` (${i.quantity})` : "")).join(", ")}` : ""}`]);
  if (report?.done) rows.push(["מה הושלם", report.done]);
  if (report?.next) rows.push(["מה נשאר", report.next]);
  if (report?.blockers) rows.push(["חסמים / צריך מהמנהל", report.blockers]);
  return rows;
}

/** To the program manager, with the lesson file attached and a status report. */
export function lessonSubmittedEmail(p: {
  lesson: Lesson;
  ownerNames: string[];
  submittedBy: string;
  version: number;
  fileName: string | null;
  note: string | null;
  report?: SubmissionReport;
  today: string;
  url: string;
}) {
  const subject = `מערך לבדיקה: ${p.lesson.title} (גרסה ${p.version})`;
  const sb = safetyBlock(p.lesson);
  const rows = statusReportRows(p.lesson, p.report, p.today);
  const table = `<h2 style="font-size:16px;margin:16px 0 6px;">דוח סטטוס</h2>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid ${C.line};color:${C.muted};white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:6px 8px;border-bottom:1px solid ${C.line};white-space:pre-wrap;">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
  const body = `<p><strong>${esc(p.submittedBy)}</strong> שלח/ה לבדיקה את המערך <strong>${esc(p.lesson.title)}</strong> (גרסה ${p.version}).</p>
${details(p.lesson, p.ownerNames)}
${p.note ? `<div style="border-right:4px solid ${C.brand};background:#eff6ff;padding:8px 12px;margin:12px 0;border-radius:6px;white-space:pre-wrap;">${esc(p.note)}</div>` : ""}
${table}
${sb.html}
<p style="margin-top:14px;">${p.fileName ? `📎 הקובץ <strong>${esc(p.fileName)}</strong> מצורף למייל הזה – אפשר להעביר אותו מכאן לגורמים הרלוונטיים.` : "לא צורף קובץ."}</p>
<p style="color:${C.muted};font-size:13px;">לאישור או להחזרה עם הערות – בדף המערך במערכת.</p>`;
  const text = `${p.submittedBy} שלח/ה לבדיקה את המערך "${p.lesson.title}" (גרסה ${p.version}).
מדריכים: ${p.ownerNames.join(", ")}

דוח סטטוס:
${rows
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n")}
${p.note ? `הערה: ${p.note}\n` : ""}${sb.text}${p.fileName ? `הקובץ ${p.fileName} מצורף.\n` : ""}
${p.url}`;
  return { subject, html: layout(subject, body, [{ label: "לדף המערך", href: p.url }]), text };
}

/** To a new instructor: welcome + a sign-in link (no password). */
export function instructorWelcomeEmail(p: { workerName: string; loginUrl: string; managerName: string }) {
  const subject = "ברוך/ה הבא/ה למערכת המערכים של תכנית המדעים";
  const body = `<p>שלום ${esc(p.workerName)},</p>
<p>${esc(p.managerName)} הוסיף/ה אותך למערכת המערכים. כאן רואים את המערכים ומי עובד עליהם, מעדכנים סטטוס ושולחים את קובץ המערך לבדיקה.</p>
<p>אין סיסמה: לוחצים על הכפתור ונכנסים. בפעם הבאה, אם תתבקש/י להיכנס שוב, מקלידים את המייל באתר ומקבלים קישור חדש.</p>`;
  const text = `שלום ${p.workerName},
הוספת למערכת המערכים של תכנית המדעים.
כניסה (בלי סיסמה): ${p.loginUrl}`;
  return { subject, html: layout(subject, body, [{ label: "כניסה למערכת", href: p.loginUrl }]), text };
}

/** A sign-in link that was asked for on the site. */
export function loginLinkEmail(p: { loginUrl: string }) {
  const subject = "קישור כניסה למערכת המערכים";
  const body = `<p>ביקשת להיכנס למערכת המערכים של תכנית המדעים. לוחצים על הכפתור ונכנסים.</p>
<p style="color:${C.muted};font-size:13px;">הקישור פועל פעם אחת. אם לא ביקשת – אפשר להתעלם מהמייל.</p>`;
  return { subject, html: layout(subject, body, [{ label: "כניסה", href: p.loginUrl }]), text: `כניסה למערכת המערכים: ${p.loginUrl}` };
}

/** To each instructor: approved, or returned with notes. */
export function lessonDecisionEmail(p: {
  workerName: string;
  lesson: Lesson;
  decision: "APPROVED" | "CHANGES_REQUESTED";
  notes: string | null;
  version: number;
  personalUrl: string;
}) {
  const ok = p.decision === "APPROVED";
  const subject = ok ? `המערך "${p.lesson.title}" אושר 🎉` : `המערך "${p.lesson.title}" הוחזר עם הערות`;
  const body = `<p>שלום ${esc(p.workerName)},</p>
<p>${ok ? `גרסה ${p.version} של המערך <strong>${esc(p.lesson.title)}</strong> <strong style="color:${C.ink};">אושרה</strong>. תודה!` : `גרסה ${p.version} של המערך <strong>${esc(p.lesson.title)}</strong> הוחזרה לתיקונים.`}</p>
${p.notes ? `<div style="border-right:4px solid ${ok ? C.brand : C.red};background:#fafafa;padding:8px 12px;border-radius:6px;white-space:pre-wrap;">${esc(p.notes)}</div>` : ""}
${ok ? "" : `<p>אחרי התיקונים שולחים את הגרסה החדשה מהעמוד האישי שלך.</p>`}`;
  const text = `שלום ${p.workerName},\n${ok ? `המערך "${p.lesson.title}" אושר.` : `המערך "${p.lesson.title}" הוחזר לתיקונים.`}\n${p.notes ? `הערות: ${p.notes}\n` : ""}\n${p.personalUrl}`;
  return { subject, html: layout(subject, body, [{ label: "לעמוד שלי", href: p.personalUrl }]), text };
}

/** To an instructor who was added to a lesson. */
export function lessonAssignedEmail(p: { workerName: string; lesson: Lesson; ownerNames: string[]; personalUrl: string }) {
  const subject = `שויכת למערך: ${p.lesson.title}`;
  const body = `<p>שלום ${esc(p.workerName)},</p>
<p>שויכת לעבודה על המערך <strong>${esc(p.lesson.title)}</strong> (${esc(LESSON_KIND[p.lesson.kind])}).</p>
${details(p.lesson, p.ownerNames)}
<p>בעמוד האישי שלך אפשר לעדכן את רשימת הציוד, האלרגנים וחלקי המערך, ולשלוח את קובץ המערך לבדיקה.</p>`;
  const text = `שלום ${p.workerName},\nשויכת לעבודה על המערך "${p.lesson.title}".\nתאריך יעד: ${p.lesson.dueDate ? formatDate(p.lesson.dueDate) : "לא נקבע"}\n\n${p.personalUrl}`;
  return { subject, html: layout(subject, body, [{ label: "לעמוד שלי", href: p.personalUrl }]), text };
}
