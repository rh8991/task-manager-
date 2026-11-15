import type { Review } from "./types";

/**
 * Review dates ("תאריכי ביקורת"): checkpoints on the way to a task's due date.
 * Pure helpers, shared by the web app and the mailer.
 */
export type ReviewState = "done" | "overdue" | "today" | "upcoming";

export const REVIEW_STATE: Record<ReviewState, string> = {
  done: "בוצעה",
  overdue: "באיחור",
  today: "היום",
  upcoming: "מתוכננת",
};

export const REVIEW_TONE: Record<ReviewState, "green" | "red" | "amber" | "gray"> = {
  done: "green",
  overdue: "red",
  today: "amber",
  upcoming: "gray",
};

/** Reviews sorted by date (tasks created before this feature have none). */
export function sortedReviews(reviews: Review[] | undefined | null): Review[] {
  return [...(reviews ?? [])].sort((a, b) => a.date.localeCompare(b.date));
}

export function reviewState(r: Review, today: string): ReviewState {
  if (r.done) return "done";
  if (r.date < today) return "overdue";
  if (r.date === today) return "today";
  return "upcoming";
}

/** The first review not yet done (overdue ones first, since they come earlier). */
export function nextReview(reviews: Review[] | undefined | null): Review | null {
  return sortedReviews(reviews).find((r) => !r.done) ?? null;
}

export function newReviewId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Checks review dates entered by the manager. Returns an error message, or null when OK.
 * Rules: a valid date for each review, no duplicates, and none after the due date.
 */
export function validateReviews(reviews: ReviewRow[], dueDate: string | null): string | null {
  if (reviews.length > 20) return "אפשר עד 20 תאריכי ביקורת למשימה";
  const seen = new Set<string>();
  for (const r of reviews) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return "לכל ביקורת צריך תאריך";
    if (dueDate && r.date > dueDate) return "תאריך ביקורת לא יכול להיות אחרי תאריך היעד של המשימה";
    if (seen.has(r.date)) return "יש שתי ביקורות באותו תאריך";
    seen.add(r.date);
    if (r.note && r.note.length > 200) return "התיאור של ביקורת ארוך מדי (עד 200 תווים)";
  }
  return null;
}

/**
 * Merges edited review rows with the stored ones: keeps the done state of reviews that still
 * exist (matched by id), and sorts by date.
 */
export type ReviewRow = { id?: string; date: string; note: string | null };

export function mergeReviews(
  rows: ReviewRow[],
  existing: Review[] | undefined,
): Review[] {
  const old = new Map((existing ?? []).map((r) => [r.id, r]));
  return sortedReviews(
    rows.map((row) => {
      const prev = row.id ? old.get(row.id) : undefined;
      return {
        id: prev?.id ?? row.id ?? newReviewId(),
        date: row.date,
        note: row.note?.trim() || null,
        done: prev?.done ?? false,
        doneAt: prev?.doneAt ?? null,
      };
    }),
  );
}

/** Reads the hidden "reviews" field written by the ReviewsEditor component. */
export function parseReviewField(v: FormDataEntryValue | null): ReviewRow[] {
  if (typeof v !== "string" || !v) return [];
  try {
    const rows = JSON.parse(v) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r): r is ReviewRow => !!r && typeof r === "object" && typeof (r as ReviewRow).date === "string")
      .map((r) => ({ id: typeof r.id === "string" ? r.id : undefined, date: r.date, note: typeof r.note === "string" ? r.note : null }))
      .filter((r) => r.date || r.note);
  } catch {
    return [];
  }
}
