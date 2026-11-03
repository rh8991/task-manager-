import { formatDate } from "./dates";
import { EQUIPMENT_STATUS, MEETING_STATUS, PRIORITY, TASK_STATUS } from "./labels";
import { openTaskCount, type ReportTask, type WorkerReport } from "./report";

/**
 * Hebrew, right-to-left email templates. Plain HTML with inline styles so they render well in
 * Gmail, Outlook and phone mail apps. Each template also returns a plain-text version.
 */

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const C = {
  ink: "#1f2937",
  muted: "#6b7280",
  line: "#e5e7eb",
  brand: "#2563eb",
  red: "#b91c1c",
  amber: "#b45309",
  bg: "#f3f4f6",
};

function layout(title: string, body: string, buttons: { label: string; href: string }[] = []): string {
  const btns = buttons
    .map(
      (b, i) =>
        `<a href="${esc(b.href)}" style="display:inline-block;margin:4px;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;${
          i === 0 ? `background:${C.brand};color:#fff;` : `background:#fff;color:${C.brand};border:1px solid ${C.brand};`
        }">${esc(b.label)}</a>`,
    )
    .join("");
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div dir="rtl" style="max-width:640px;margin:0 auto;padding:24px 12px;font-family:Arial,'Segoe UI',Tahoma,sans-serif;color:${C.ink};text-align:right;direction:rtl;">
  <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid ${C.line};">
    <h1 style="margin:0 0 16px;font-size:20px;">${esc(title)}</h1>
    ${body}
    ${btns ? `<div style="margin-top:24px;text-align:center;">${btns}</div>` : ""}
  </div>
  <p style="color:${C.muted};font-size:12px;text-align:center;margin-top:12px;">הודעה אוטומטית ממערכת ניהול המשימות</p>
</div></body></html>`;
}

function taskRows(tasks: ReportTask[]): string {
  return tasks
    .map(
      (t) => `<tr>
  <td style="padding:8px;border-bottom:1px solid ${C.line};"><strong>${esc(t.title)}</strong>${
    t.projectName ? `<br><span style="color:${C.muted};font-size:12px;">${esc(t.projectName)}</span>` : ""
  }</td>
  <td style="padding:8px;border-bottom:1px solid ${C.line};white-space:nowrap;">${esc(TASK_STATUS[t.status])}</td>
  <td style="padding:8px;border-bottom:1px solid ${C.line};white-space:nowrap;">${esc(PRIORITY[t.priority])}</td>
  <td style="padding:8px;border-bottom:1px solid ${C.line};white-space:nowrap;">${t.dueDate ? formatDate(t.dueDate) : "—"}</td>
</tr>`,
    )
    .join("");
}

function taskSection(title: string, color: string, tasks: ReportTask[]): string {
  if (!tasks.length) return "";
  return `<h2 style="font-size:16px;margin:20px 0 6px;color:${color};">${esc(title)} (${tasks.length})</h2>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">
<tr style="color:${C.muted};font-size:12px;"><td style="padding:4px 8px;">משימה</td><td style="padding:4px 8px;">סטטוס</td><td style="padding:4px 8px;">עדיפות</td><td style="padding:4px 8px;">תאריך יעד</td></tr>
${taskRows(tasks)}</table>`;
}

function taskText(title: string, tasks: ReportTask[]): string {
  if (!tasks.length) return "";
  return `\n${title}:\n${tasks
    .map((t) => `- ${t.title}${t.projectName ? ` [${t.projectName}]` : ""} | ${TASK_STATUS[t.status]} | ${t.dueDate ? formatDate(t.dueDate) : "ללא תאריך"}`)
    .join("\n")}\n`;
}

// ---------------------------------------------------------------------------

export function taskAssignedEmail(p: {
  workerName: string;
  task: ReportTask & { description: string | null };
  personalUrl: string;
  reassigned?: boolean;
}) {
  const t = p.task;
  const subject = `משימה חדשה: ${t.title}`;
  const body = `<p>שלום ${esc(p.workerName)},</p>
<p>${p.reassigned ? "הועברה אליך משימה:" : "קיבלת משימה חדשה:"}</p>
<div style="border:1px solid ${C.line};border-radius:8px;padding:12px 16px;background:#fafafa;">
  <div style="font-size:17px;font-weight:700;margin-bottom:6px;">${esc(t.title)}</div>
  ${t.description ? `<div style="white-space:pre-wrap;margin-bottom:8px;">${esc(t.description)}</div>` : ""}
  <div style="font-size:14px;color:${C.muted};">
    ${t.projectName ? `פרויקט: <strong>${esc(t.projectName)}</strong><br>` : ""}
    עדיפות: <strong>${esc(PRIORITY[t.priority])}</strong><br>
    תאריך יעד: <strong>${t.dueDate ? formatDate(t.dueDate) : "לא נקבע"}</strong>
  </div>
</div>`;
  const text = `שלום ${p.workerName},\n${p.reassigned ? "הועברה אליך משימה" : "קיבלת משימה חדשה"}: ${t.title}\n${
    t.description ? `${t.description}\n` : ""
  }${t.projectName ? `פרויקט: ${t.projectName}\n` : ""}עדיפות: ${PRIORITY[t.priority]}\nתאריך יעד: ${
    t.dueDate ? formatDate(t.dueDate) : "לא נקבע"
  }\n\nלעדכון סטטוס: ${p.personalUrl}`;
  return { subject, html: layout(subject, body, [{ label: "לעמוד המשימות שלי", href: p.personalUrl }]), text };
}

export function reportEmail(p: {
  report: WorkerReport;
  personalUrl: string;
  dashboardUrl: string;
  managerNote?: string | null;
  managerName: string;
}) {
  const r = p.report;
  const open = openTaskCount(r.tasks);
  const subject = `דוח משימות – ${r.workerName}`;
  const note = p.managerNote?.trim()
    ? `<div style="border-right:4px solid ${C.brand};background:#eff6ff;padding:10px 14px;margin:12px 0;border-radius:6px;">
<div style="font-size:12px;color:${C.muted};">הודעה מ${esc(p.managerName)}:</div>
<div style="white-space:pre-wrap;">${esc(p.managerNote.trim())}</div></div>`
    : "";
  const summary = `<p>שלום ${esc(r.workerName)},</p>
<p>יש לך <strong>${open}</strong> משימות פתוחות${
    r.tasks.overdue.length ? `, מתוכן <strong style="color:${C.red};">${r.tasks.overdue.length} באיחור</strong>` : ""
  }.${r.doneSinceLastReport ? ` מאז הדוח הקודם השלמת ${r.doneSinceLastReport} משימות – כל הכבוד!` : ""}</p>`;

  const equipment = r.equipment.length
    ? `<h2 style="font-size:16px;margin:20px 0 6px;">ציוד שביקשת</h2><ul style="margin:0;padding-right:20px;">${r.equipment
        .map((e) => `<li>${esc(e.item)} × ${e.quantity} – ${esc(EQUIPMENT_STATUS[e.status])}</li>`)
        .join("")}</ul>`
    : "";
  const meetings = r.meetings.length
    ? `<h2 style="font-size:16px;margin:20px 0 6px;">פגישות נדרשות</h2><ul style="margin:0;padding-right:20px;">${r.meetings
        .map((m) => `<li>${esc(m.topic)}${m.withTeam ? ` – עם צוות ${esc(m.withTeam)}` : ""} (${esc(MEETING_STATUS[m.status])})</li>`)
        .join("")}</ul>`
    : "";

  const body =
    note +
    summary +
    (open === 0 ? `<p>אין לך משימות פתוחות כרגע.</p>` : "") +
    taskSection("באיחור", C.red, r.tasks.overdue) +
    taskSection("להיום", C.amber, r.tasks.dueToday) +
    taskSection("השבוע הקרוב", C.ink, r.tasks.thisWeek) +
    taskSection("בהמשך", C.ink, r.tasks.later) +
    taskSection("ללא תאריך יעד", C.muted, r.tasks.noDate) +
    equipment +
    meetings;

  const text =
    `${p.managerNote?.trim() ? `הודעה מ${p.managerName}: ${p.managerNote.trim()}\n\n` : ""}שלום ${r.workerName},\nיש לך ${open} משימות פתוחות.\n` +
    taskText("באיחור", r.tasks.overdue) +
    taskText("להיום", r.tasks.dueToday) +
    taskText("השבוע הקרוב", r.tasks.thisWeek) +
    taskText("בהמשך", r.tasks.later) +
    taskText("ללא תאריך יעד", r.tasks.noDate) +
    (r.equipment.length ? `\nציוד:\n${r.equipment.map((e) => `- ${e.item} × ${e.quantity}: ${EQUIPMENT_STATUS[e.status]}`).join("\n")}\n` : "") +
    (r.meetings.length
      ? `\nפגישות:\n${r.meetings.map((m) => `- ${m.topic}${m.withTeam ? ` (${m.withTeam})` : ""}: ${MEETING_STATUS[m.status]}`).join("\n")}\n`
      : "") +
    `\nהעמוד שלי: ${p.personalUrl}\nלוח משותף: ${p.dashboardUrl}`;

  return {
    subject,
    html: layout(subject, body, [
      { label: "לעמוד המשימות שלי", href: p.personalUrl },
      { label: "ללוח המשותף", href: p.dashboardUrl },
    ]),
    text,
  };
}

export function dueReminderEmail(p: { workerName: string; tasks: ReportTask[]; personalUrl: string }) {
  const subject = p.tasks.length === 1 ? `תזכורת: "${p.tasks[0].title}" מחר` : `תזכורת: ${p.tasks.length} משימות ליום מחר`;
  const body = `<p>שלום ${esc(p.workerName)},</p><p>תזכורת – המשימות הבאות מגיעות לתאריך היעד מחר:</p>${taskSection("מחר", C.amber, p.tasks)}`;
  const text = `שלום ${p.workerName},\nתזכורת – משימות לתאריך יעד מחר:${taskText("מחר", p.tasks)}\n${p.personalUrl}`;
  return { subject, html: layout(subject, body, [{ label: "לעמוד המשימות שלי", href: p.personalUrl }]), text };
}

export function managerNoticeEmail(p: { subject: string; lines: string[]; url: string }) {
  const body = p.lines.map((l) => `<p style="margin:4px 0;white-space:pre-wrap;">${esc(l)}</p>`).join("");
  return {
    subject: p.subject,
    html: layout(p.subject, body, [{ label: "לפאנל הניהול", href: p.url }]),
    text: `${p.lines.join("\n")}\n\n${p.url}`,
  };
}
