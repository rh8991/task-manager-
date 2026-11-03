import type { EquipmentStatus, MeetingStatus, Priority, TaskStatus } from "@prisma/client";
import { addDays, dateKey } from "./dates";

/** Pure report logic (no database), so it can be unit-tested. */

export type ReportTask = {
  id: number;
  title: string;
  projectName: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: Date | null;
};

export type GroupedTasks = {
  overdue: ReportTask[];
  dueToday: ReportTask[];
  thisWeek: ReportTask[];
  later: ReportTask[];
  noDate: ReportTask[];
};

const PRIORITY_ORDER: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function byDueThenPriority(a: ReportTask, b: ReportTask): number {
  const da = dateKey(a.dueDate) ?? "9999";
  const dbk = dateKey(b.dueDate) ?? "9999";
  if (da !== dbk) return da < dbk ? -1 : 1;
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
}

/** Groups open tasks by due date relative to `today` (YYYY-MM-DD). Done tasks are ignored. */
export function groupTasks(tasks: ReportTask[], today: string): GroupedTasks {
  const weekEnd = addDays(today, 7);
  const g: GroupedTasks = { overdue: [], dueToday: [], thisWeek: [], later: [], noDate: [] };
  for (const t of [...tasks].sort(byDueThenPriority)) {
    if (t.status === "DONE") continue;
    const d = dateKey(t.dueDate);
    if (!d) g.noDate.push(t);
    else if (d < today) g.overdue.push(t);
    else if (d === today) g.dueToday.push(t);
    else if (d <= weekEnd) g.thisWeek.push(t);
    else g.later.push(t);
  }
  return g;
}

export type WorkerReport = {
  workerName: string;
  tasks: GroupedTasks;
  doneSinceLastReport: number;
  equipment: { item: string; quantity: number; status: EquipmentStatus }[];
  meetings: { topic: string; withTeam: string | null; status: MeetingStatus }[];
};

export function openTaskCount(g: GroupedTasks): number {
  return g.overdue.length + g.dueToday.length + g.thisWeek.length + g.later.length + g.noDate.length;
}
