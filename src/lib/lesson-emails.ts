import { formatDate } from "./dates";
import { C, esc, layout } from "./email-templates";
import { HAZARD_ICON, HAZARDS, SAFETY, allergenNames, summarizeLesson } from "./allergens";
import { ACTIVITY_KIND, LESSON_KIND, LOCATION, SUBJECT, gradeRange } from "./lessons";
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
  ${esc(SUBJECT[lesson.subject])} · ${esc(LESSON_KIND[lesson.kind])} · ${esc(gradeRange(lesson.gradeFrom, lesson.gradeTo))} · ${esc(LOCATION[lesson.location])} · ${lesson.durationMin} דקות<br>
  מדריכים: <strong>${esc(ownerNames.join(", ") || "—")}</strong><br>
  תאריך יעד סופי: <strong>${lesson.dueDate ? formatDate(lesson.dueDate) : "לא נקבע"}</strong> · פריטי ציוד: ${lesson.equipment.length}
</div>`;
}

/** To the program manager, with the lesson file attached. */
export function lessonSubmittedEmail(p: {
  lesson: Lesson;
  ownerNames: string[];
  submittedBy: string;
  version: number;
  fileName: string | null;
  note: string | null;
  url: string;
}) {
  const subject = `מערך לבדיקה: ${p.lesson.title} (גרסה ${p.version})`;
  const sb = safetyBlock(p.lesson);
  const activities = p.lesson.activities.length
    ? `<p style="margin:10px 0 4px;"><strong>חלקי המערך:</strong></p><ol style="margin:0;padding-right:20px;">${p.lesson.activities
        .map((a) => `<li>${esc(ACTIVITY_KIND[a.kind])}: ${esc(a.title)}</li>`)
        .join("")}</ol>`
    : "";
  const body = `<p><strong>${esc(p.submittedBy)}</strong> שלח/ה לבדיקה את המערך <strong>${esc(p.lesson.title)}</strong> (גרסה ${p.version}).</p>
${details(p.lesson, p.ownerNames)}
${p.note ? `<div style="border-right:4px solid ${C.brand};background:#eff6ff;padding:8px 12px;margin:12px 0;border-radius:6px;white-space:pre-wrap;">${esc(p.note)}</div>` : ""}
${sb.html}
${activities}
<p style="margin-top:14px;">${p.fileName ? `📎 הקובץ <strong>${esc(p.fileName)}</strong> מצורף למייל הזה – אפשר להעביר אותו מכאן לגורמים הרלוונטיים.` : "לא צורף קובץ."}</p>
<p style="color:${C.muted};font-size:13px;">לאישור או להחזרה עם הערות – בדף המערך במערכת.</p>`;
  const text = `${p.submittedBy} שלח/ה לבדיקה את המערך "${p.lesson.title}" (גרסה ${p.version}).\nמדריכים: ${p.ownerNames.join(", ")}\nתאריך יעד: ${
    p.lesson.dueDate ? formatDate(p.lesson.dueDate) : "לא נקבע"
  }\n${p.note ? `הערה: ${p.note}\n` : ""}${sb.text}${p.fileName ? `הקובץ ${p.fileName} מצורף.\n` : ""}\n${p.url}`;
  return { subject, html: layout(subject, body, [{ label: "לדף המערך", href: p.url }]), text };
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
