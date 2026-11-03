import { describe, expect, it } from "vitest";
import { groupTasks, openTaskCount, type ReportTask } from "@/lib/report";
import { esc, reportEmail, taskAssignedEmail } from "@/lib/email-templates";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
let id = 0;
const task = (over: Partial<ReportTask>): ReportTask => ({
  id: ++id,
  title: `task ${id}`,
  projectName: null,
  status: "TODO",
  priority: "MEDIUM",
  dueDate: null,
  ...over,
});

describe("groupTasks", () => {
  const today = "2026-11-03";
  const tasks = [
    task({ title: "late", dueDate: d("2026-11-01") }),
    task({ title: "today", dueDate: d("2026-11-03") }),
    task({ title: "week", dueDate: d("2026-11-10") }),
    task({ title: "later", dueDate: d("2026-11-11") }),
    task({ title: "nodate" }),
    task({ title: "done-late", dueDate: d("2026-10-01"), status: "DONE" }),
  ];

  it("buckets by due date and skips done tasks", () => {
    const g = groupTasks(tasks, today);
    expect(g.overdue.map((t) => t.title)).toEqual(["late"]);
    expect(g.dueToday.map((t) => t.title)).toEqual(["today"]);
    expect(g.thisWeek.map((t) => t.title)).toEqual(["week"]);
    expect(g.later.map((t) => t.title)).toEqual(["later"]);
    expect(g.noDate.map((t) => t.title)).toEqual(["nodate"]);
    expect(openTaskCount(g)).toBe(5);
  });

  it("sorts same-day tasks by priority", () => {
    const g = groupTasks(
      [task({ title: "low", priority: "LOW", dueDate: d("2026-11-05") }), task({ title: "urgent", priority: "URGENT", dueDate: d("2026-11-05") })],
      today,
    );
    expect(g.thisWeek.map((t) => t.title)).toEqual(["urgent", "low"]);
  });
});

describe("email templates", () => {
  it("escapes HTML in user content", () => {
    expect(esc(`<script>"x"&'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
    const e = taskAssignedEmail({
      workerName: "<b>דנה</b>",
      task: { ...task({ title: "<img src=x>" }), description: null },
      personalUrl: "https://app.example.com/w/abc",
    });
    expect(e.html).not.toContain("<img src=x>");
    expect(e.html).not.toContain("<b>דנה</b>");
  });

  it("report is RTL Hebrew and includes sections and links", () => {
    const e = reportEmail({
      report: {
        workerName: "דנה",
        tasks: groupTasks([task({ title: "משימה באיחור", dueDate: d("2026-11-01") })], "2026-11-03"),
        doneSinceLastReport: 2,
        equipment: [{ item: "מסך", quantity: 1, status: "APPROVED" }],
        meetings: [{ topic: "תיאום", withTeam: "שיווק", status: "OPEN" }],
      },
      personalUrl: "https://app.example.com/w/abc",
      dashboardUrl: "https://app.example.com/?w=abc",
      managerNote: "שבוע טוב",
      managerName: "רון",
    });
    expect(e.html).toContain('dir="rtl"');
    expect(e.html).toContain("באיחור");
    expect(e.html).toContain("משימה באיחור");
    expect(e.html).toContain("שבוע טוב");
    expect(e.html).toContain("https://app.example.com/w/abc");
    expect(e.text).toContain("מסך");
  });
});
