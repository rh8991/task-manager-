import { describe, expect, it } from "vitest";
import { mergeReviews, nextReview, reviewState, sortedReviews, validateReviews } from "@/lib/reviews";
import type { Review } from "@/lib/types";

const r = (id: string, date: string, done = false): Review => ({ id, date, note: null, done, doneAt: done ? 1 : null });

describe("reviews", () => {
  it("sorts by date and handles tasks without reviews", () => {
    expect(sortedReviews(undefined)).toEqual([]);
    expect(sortedReviews([r("b", "2026-11-20"), r("a", "2026-11-10")]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("gives each review a state relative to today", () => {
    const today = "2026-11-15";
    expect(reviewState(r("1", "2026-11-14"), today)).toBe("overdue");
    expect(reviewState(r("2", "2026-11-15"), today)).toBe("today");
    expect(reviewState(r("3", "2026-11-16"), today)).toBe("upcoming");
    expect(reviewState(r("4", "2026-11-01", true), today)).toBe("done");
  });

  it("next review is the earliest one not done", () => {
    expect(nextReview([r("a", "2026-11-10", true), r("c", "2026-11-30"), r("b", "2026-11-20")])?.id).toBe("b");
    expect(nextReview([r("a", "2026-11-10", true)])).toBeNull();
  });

  it("validates dates against the due date", () => {
    expect(validateReviews([{ date: "2026-11-20", note: null }], "2026-11-30")).toBeNull();
    expect(validateReviews([{ date: "2026-12-01", note: null }], "2026-11-30")).toContain("אחרי תאריך היעד");
    expect(validateReviews([{ date: "", note: null }], null)).toContain("צריך תאריך");
    expect(validateReviews([{ date: "2026-11-20", note: null }, { date: "2026-11-20", note: "x" }], null)).toContain("שתי ביקורות");
  });

  it("merging edits keeps the done state of existing reviews", () => {
    const merged = mergeReviews(
      [{ id: "a", date: "2026-11-12", note: "moved" }, { date: "2026-11-05", note: " new " }],
      [r("a", "2026-11-10", true), r("gone", "2026-11-11")],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ date: "2026-11-05", note: "new", done: false });
    expect(merged[1]).toMatchObject({ id: "a", date: "2026-11-12", note: "moved", done: true });
  });
});
