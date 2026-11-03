import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { areRemindersDue, isWeeklyReportDue } from "@/lib/schedule";
import { getSettings, sendDueReminders, sendReports } from "@/lib/notify";
import { todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called on a schedule (hourly is ideal) by Vercel Cron, GitHub Actions, or any cron service.
 * Safe to call any number of times: it sends the weekly report once per weekly slot and
 * due-date reminders once per day.
 *
 * Auth: "Authorization: Bearer <CRON_SECRET>" (Vercel Cron sends this automatically).
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const s = await getSettings();
  const result: Record<string, unknown> = { at: now.toISOString() };

  // Each job first "claims" its run with a conditional update, so overlapping calls can't double-send.
  if (isWeeklyReportDue(s, now)) {
    const claim = await db.settings.updateMany({ where: { id: 1, lastReportAt: s.lastReportAt }, data: { lastReportAt: now } });
    if (claim.count === 1) result.weeklyReport = await sendReports({ since: s.lastReportAt });
  }
  if (areRemindersDue(s, now)) {
    const claim = await db.settings.updateMany({
      where: { id: 1, lastReminderDate: s.lastReminderDate },
      data: { lastReminderDate: todayLocal(now) },
    });
    if (claim.count === 1) result.reminders = await sendDueReminders(now);
  }

  return NextResponse.json(result);
}

export const GET = run;
export const POST = run;
