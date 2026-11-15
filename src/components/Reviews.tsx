import { useState } from "react";
import { formatDate, todayLocal } from "@/lib/dates";
import { REVIEW_STATE, REVIEW_TONE, reviewState, sortedReviews, type ReviewRow } from "@/lib/reviews";
import type { Review } from "@/lib/types";

/**
 * Form field for review dates ("תאריכי ביקורת"). Rows are kept in state and sent as one hidden
 * JSON field named "reviews" (read with parseReviewField). Re-mount it (key) to reset.
 */
export function ReviewsEditor({ initial }: { initial?: Review[] }) {
  const [rows, setRows] = useState<ReviewRow[]>(() => sortedReviews(initial).map((r) => ({ id: r.id, date: r.date, note: r.note })));
  const set = (i: number, patch: Partial<ReviewRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8, padding: ".6rem .75rem", margin: 0 }}>
      <legend className="small" style={{ fontWeight: 600, padding: "0 .3rem" }}>תאריכי ביקורת בדרך לתאריך היעד</legend>
      <input type="hidden" name="reviews" value={JSON.stringify(rows)} />
      {rows.length === 0 && <p className="muted small" style={{ margin: "0 0 .5rem" }}>אין עדיין תאריכי ביקורת.</p>}
      <div style={{ display: "grid", gap: ".4rem" }}>
        {rows.map((r, i) => (
          <div key={r.id ?? `new-${i}`} className="row" style={{ flexWrap: "nowrap" }}>
            <input
              type="date"
              aria-label="תאריך ביקורת"
              value={r.date}
              onChange={(e) => set(i, { date: e.target.value })}
              style={{ width: "auto", flex: "0 0 auto" }}
            />
            <input
              aria-label="מה בודקים"
              placeholder="מה בודקים? (למשל: טיוטה ראשונה)"
              maxLength={200}
              value={r.note ?? ""}
              onChange={(e) => set(i, { note: e.target.value })}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button type="button" className="btn ghost sm" aria-label="הסרת ביקורת" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn ghost sm" style={{ marginTop: ".5rem" }} onClick={() => setRows((rs) => [...rs, { date: "", note: "" }])}>
        + הוספת תאריך ביקורת
      </button>
    </fieldset>
  );
}

/** Review dates as a small timeline, ending with the due date. Optional mark-done buttons. */
export function ReviewList({
  reviews,
  dueDate,
  onToggle,
  compact,
}: {
  reviews: Review[] | undefined;
  dueDate?: string | null;
  onToggle?: (review: Review) => void;
  compact?: boolean;
}) {
  const today = todayLocal();
  const list = sortedReviews(reviews);
  if (!list.length && !compact) return <p className="empty small">לא נקבעו תאריכי ביקורת.</p>;
  if (!list.length) return null;
  return (
    <ol className="reviews">
      {list.map((r) => {
        const st = reviewState(r, today);
        return (
          <li key={r.id} className={`review ${st}`}>
            <span className="review-dot" aria-hidden />
            <span className="nowrap">{formatDate(r.date)}</span>
            {r.note && <span className="review-note">{r.note}</span>}
            <span className={`badge ${REVIEW_TONE[st]}`}>{st === "done" ? "✓ " : ""}ביקורת {REVIEW_STATE[st]}</span>
            {onToggle && (
              <button type="button" className="btn ghost sm" onClick={() => onToggle(r)}>
                {r.done ? "ביטול סימון" : "סימון כבוצעה"}
              </button>
            )}
          </li>
        );
      })}
      {dueDate && !compact && (
        <li className="review due">
          <span className="review-dot" aria-hidden />
          <span className="nowrap">{formatDate(dueDate)}</span>
          <span className="review-note"><strong>תאריך יעד</strong></span>
        </li>
      )}
    </ol>
  );
}
