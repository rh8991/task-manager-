import { describe, expect, it } from "vitest";
import { areRemindersDue, isWeeklyReportDue, lastScheduledSlot } from "@/lib/schedule";
import { addDays, localParts } from "@/lib/dates";

// 2026-11-01 is a Sunday. Israel is UTC+2 in November.
const il = (local: string) => new Date(`${local}:00+02:00`);

describe("localParts", () => {
  it("uses Israel time", () => {
    const p = localParts(new Date("2026-11-01T23:30:00Z")); // 01:30 Monday in Israel
    expect(p).toMatchObject({ date: "2026-11-02", weekday: 1, hour: 1 });
  });
});

describe("addDays", () => {
  it("crosses month boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("lastScheduledSlot", () => {
  it("is today's slot once the hour has passed", () => {
    expect(lastScheduledSlot(il("2026-11-01T09:15"), 0, 8)).toBe("2026-11-01 08");
  });
  it("is last week's slot before the hour", () => {
    expect(lastScheduledSlot(il("2026-11-01T07:59"), 0, 8)).toBe("2026-10-25 08");
  });
  it("finds the most recent weekday", () => {
    // Wednesday; schedule is Sunday 08:00
    expect(lastScheduledSlot(il("2026-11-04T12:00"), 0, 8)).toBe("2026-11-01 08");
  });
});

describe("isWeeklyReportDue", () => {
  const base = {
    reportEnabled: true,
    reportDay: 0,
    reportHour: 8,
    scheduleUpdatedAt: il("2026-10-20T10:00"),
    lastReportAt: il("2026-10-25T08:05"),
  };

  it("fires at the scheduled hour", () => {
    expect(isWeeklyReportDue(base, il("2026-11-01T08:00"))).toBe(true);
  });
  it("does not fire before the hour", () => {
    expect(isWeeklyReportDue(base, il("2026-11-01T07:00"))).toBe(false);
  });
  it("does not fire twice for the same slot", () => {
    expect(isWeeklyReportDue({ ...base, lastReportAt: il("2026-11-01T08:01") }, il("2026-11-01T09:00"))).toBe(false);
  });
  it("catches up later in the week if the cron missed the slot", () => {
    expect(isWeeklyReportDue(base, il("2026-11-03T15:00"))).toBe(true);
  });
  it("does not fire when disabled", () => {
    expect(isWeeklyReportDue({ ...base, reportEnabled: false }, il("2026-11-01T08:00"))).toBe(false);
  });
  it("does not fire for a slot before the schedule was turned on", () => {
    const s = { ...base, lastReportAt: null, scheduleUpdatedAt: il("2026-11-03T10:00") };
    expect(isWeeklyReportDue(s, il("2026-11-03T11:00"))).toBe(false);
    expect(isWeeklyReportDue(s, il("2026-11-08T08:00"))).toBe(true);
  });
  it("a manual report sent after the slot counts for that week", () => {
    expect(isWeeklyReportDue({ ...base, lastReportAt: il("2026-11-02T12:00") }, il("2026-11-03T08:00"))).toBe(false);
  });
});

describe("areRemindersDue", () => {
  it("runs once a day from 08:00", () => {
    expect(areRemindersDue({ remindersEnabled: true, lastReminderDate: "2026-10-31" }, il("2026-11-01T07:00"))).toBe(false);
    expect(areRemindersDue({ remindersEnabled: true, lastReminderDate: "2026-10-31" }, il("2026-11-01T08:00"))).toBe(true);
    expect(areRemindersDue({ remindersEnabled: true, lastReminderDate: "2026-11-01" }, il("2026-11-01T18:00"))).toBe(false);
    expect(areRemindersDue({ remindersEnabled: false, lastReminderDate: null }, il("2026-11-01T09:00"))).toBe(false);
  });
});
