import { addDays, localHourKey, localParts } from "./dates";

export type ReportSchedule = {
  reportEnabled: boolean;
  reportDay: number; // 0 = Sunday
  reportHour: number; // 0-23, Israel time
  scheduleUpdatedAt: Date;
  lastReportAt: Date | null;
};

/**
 * The most recent scheduled slot at or before `now`, as a local "YYYY-MM-DD HH" key.
 */
export function lastScheduledSlot(now: Date, day: number, hour: number): string {
  const p = localParts(now);
  let back = (p.weekday - day + 7) % 7;
  if (back === 0 && p.hour < hour) back = 7;
  return `${addDays(p.date, -back)} ${String(hour).padStart(2, "0")}`;
}

/**
 * Whether the weekly report should be sent now.
 *
 * Idempotent: the cron can call it every hour (or less often) and it fires once per weekly slot.
 * A slot only counts if it falls after the last report AND after the manager last changed the
 * schedule, so turning the schedule on never fires a "missed" report from earlier in the week.
 */
export function isWeeklyReportDue(s: ReportSchedule, now: Date): boolean {
  if (!s.reportEnabled) return false;
  const slot = lastScheduledSlot(now, s.reportDay, s.reportHour);
  if (localHourKey(s.scheduleUpdatedAt) >= slot) return false;
  if (s.lastReportAt && localHourKey(s.lastReportAt) >= slot) return false;
  return true;
}

/** Due-date reminders run once per local day, from 08:00 Israel time. */
export const REMINDER_HOUR = 8;

export function areRemindersDue(
  s: { remindersEnabled: boolean; lastReminderDate: string | null },
  now: Date,
): boolean {
  if (!s.remindersEnabled) return false;
  const p = localParts(now);
  return p.hour >= REMINDER_HOUR && s.lastReminderDate !== p.date;
}
