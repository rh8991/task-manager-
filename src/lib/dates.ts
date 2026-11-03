/**
 * Date helpers. All "local" logic uses Israel time, regardless of where the server runs.
 * Date-only fields (due dates) are stored as UTC midnight and handled as "YYYY-MM-DD" strings.
 */
export const TZ = "Asia/Jerusalem";

export type LocalParts = { date: string; weekday: number; hour: number; minute: number };

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(d: Date, tz = TZ): LocalParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday],
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Today's date in Israel as YYYY-MM-DD. */
export function todayLocal(now = new Date()): string {
  return localParts(now).date;
}

/** Adds days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A stored date-only value as YYYY-MM-DD. */
export function dateKey(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Parses a form value "YYYY-MM-DD" into a Date for a @db.Date column (or null). */
export function parseDateInput(v: FormDataEntryValue | null): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T00:00:00Z`);
}

/** Display a date-only value as DD/MM/YYYY. */
export function formatDate(d: Date | null | undefined): string {
  const k = dateKey(d);
  if (!k) return "";
  const [y, m, day] = k.split("-");
  return `${day}/${m}/${y}`;
}

/** Display a timestamp in Israel time as DD/MM/YYYY HH:MM. */
export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Timestamp expressed as a sortable local string "YYYY-MM-DD HH". */
export function localHourKey(d: Date): string {
  const p = localParts(d);
  return `${p.date} ${String(p.hour).padStart(2, "0")}`;
}
