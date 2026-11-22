import { describe, expect, it } from "vitest";
import { allergenCheck, allergenNames, submitBlocker, summarizeLesson } from "@/lib/allergens";
import { fileProblem, joinBytes, splitBytes } from "@/lib/files";
import { gradeLabel, isLessonLate, lessonStages, withLessonDefaults } from "@/lib/lessons";
import { lessonSubmittedEmail, statusReportRows } from "@/lib/lesson-emails";
import type { LessonItem } from "@/lib/types";

const item = (over: Partial<LessonItem>): LessonItem => ({
  id: Math.random().toString(36).slice(2),
  name: "x",
  quantity: "1",
  for: "INSTRUCTOR",
  food: false,
  allergens: [],
  allergenOther: null,
  noKnownAllergens: false,
  hazards: [],
  toOrder: false,
  notes: null,
  ...over,
});

describe("lesson safety summary", () => {
  const energy = {
    equipment: [
      item({ name: "מי חמצן 30%", hazards: ["CORROSIVE", "OXIDIZER"] }),
      item({ name: "מגנזיום", hazards: ["FLAMMABLE"] }),
      item({ name: "בלונים", allergens: ["LATEX"] }),
    ],
    safety: ["GOGGLES"],
  };

  it("collects hazards, allergens and suggested safety", () => {
    const s = summarizeLesson(energy);
    expect(s.hazards).toEqual(["CORROSIVE", "FLAMMABLE", "OXIDIZER"]);
    expect(s.allergens).toEqual(["LATEX"]);
    expect(s.food).toBe(false);
    expect(s.suggestedSafety).toEqual(["GOGGLES", "GLOVES", "EXTINGUISHER"]);
    expect(s.missingSafety).toEqual(["GLOVES", "EXTINGUISHER"]);
  });

  it("names include free-text 'other' allergens", () => {
    const s = summarizeLesson({ equipment: [item({ allergens: ["MILK", "OTHER"], allergenOther: "קיווי" })], safety: [] });
    expect(allergenNames(s)).toEqual(["חלב", "קיווי"]);
  });

  it("blocks submitting food without allergen info", () => {
    expect(submitBlocker({ equipment: [item({ name: "קמח", food: true })] })).toContain("קמח");
    expect(submitBlocker({ equipment: [item({ name: "מלח", food: true, noKnownAllergens: true })] })).toBeNull();
    expect(submitBlocker({ equipment: [item({ name: "קמח", food: true, allergens: ["GLUTEN"] })] })).toBeNull();
  });

  it("allergy check splits lessons into contains / unknown / safe", () => {
    const kitchen = { equipment: [item({ name: "חמאת בוטנים", food: true, allergens: ["PEANUTS"] })], safety: [] };
    const unknown = { equipment: [item({ name: "עוגיות", food: true })], safety: [] };
    const r = allergenCheck([energy, kitchen, unknown], ["PEANUTS", "LATEX"]);
    expect(r.contains.map((c) => c.items.map((i) => i.name))).toEqual([["בלונים"], ["חמאת בוטנים"]]);
    expect(r.unknown).toHaveLength(1);
    expect(r.safe).toHaveLength(0);
    expect(allergenCheck([energy, kitchen], ["SESAME"]).safe).toHaveLength(2);
  });
});

describe("files", () => {
  it("split and join give back the same bytes", () => {
    const data = new Uint8Array(2_500_001).map((_, i) => (i * 31) % 256);
    const parts = splitBytes(data, 900 * 1024);
    expect(parts).toHaveLength(3);
    expect(joinBytes(parts)).toEqual(data);
  });

  it("checks type and size", () => {
    expect(fileProblem("מערך.pdf", 1000)).toBeNull();
    expect(fileProblem("מערך.PPTX", 1000)).toBeNull();
    expect(fileProblem("virus.exe", 1000)).toContain("לא נתמך");
    expect(fileProblem("big.pdf", 9 * 1024 * 1024)).toContain("גדול מדי");
  });
});

describe("lesson helpers", () => {
  it("age labels by school stage", () => {
    expect(gradeLabel([3, 4])).toBe("יסודי (ג–ד)");
    expect(gradeLabel([1, 2, 3, 4, 5, 6])).toBe("יסודי (א–ו)");
    expect(gradeLabel([2, 5])).toBe("יסודי (ב, ה)");
    expect(gradeLabel([7, 8, 9])).toBe("חטיבת ביניים");
    expect(gradeLabel([7, 8, 9, 10, 11, 12])).toBe('חט"ב + תיכון');
    expect(gradeLabel([6, 7, 8, 9])).toBe('יסודי (ו) + חט"ב');
    expect(gradeLabel([])).toBe("גיל לא נקבע");
    expect(lessonStages([4, 10, 11, 12])).toEqual(["ELEMENTARY", "HIGH"]);
  });
  it("old lessons with a grade range are converted", () => {
    expect(withLessonDefaults({ gradeFrom: 7, gradeTo: 9 }).grades).toEqual([7, 8, 9]);
    expect(withLessonDefaults({ grades: [9, 3, 3, 40] }).grades).toEqual([3, 9]);
  });
  it("late only while still being worked on", () => {
    expect(isLessonLate({ status: "IN_PROGRESS", dueDate: "2026-11-01" }, "2026-11-16")).toBe(true);
    expect(isLessonLate({ status: "APPROVED", dueDate: "2026-11-01" }, "2026-11-16")).toBe(false);
  });
});

describe("status report sent with the lesson file", () => {
  const lesson = withLessonDefaults({
    title: "המרות אנרגיה", status: "IN_PROGRESS", location: "PARK_LAB", grades: [7, 8, 9], dueDate: "2026-11-30",
    reviews: [
      { id: "a", date: "2026-11-10", note: "טיוטה", done: true, doneAt: 1 },
      { id: "b", date: "2026-11-25", note: "הרצה", done: false, doneAt: null },
    ],
    equipment: [item({ name: "מגנזיום", quantity: "2", toOrder: true }), item({ name: "בלונים", allergens: ["LATEX"] })],
  });
  it("lists deadline, review progress, items to order and what the instructor wrote", () => {
    const rows = Object.fromEntries(statusReportRows(lesson, { done: "כל ההדגמות", next: "התחרות", blockers: null }, "2026-11-22"));
    expect(rows["תאריך יעד סופי"]).toBe("30/11/2026 (עוד 8 ימים)");
    expect(rows["ביקורות"]).toBe("1 מתוך 2 בוצעו · הבאה: 25/11/2026 – הרצה");
    expect(rows["רשימת ציוד"]).toBe("2 פריטים · צריך להזמין: מגנזיום (2)");
    expect(rows["מקום וגיל"]).toBe("פארק המדע · חטיבת ביניים");
    expect(rows["מה הושלם"]).toBe("כל ההדגמות");
    expect(rows["חסמים / צריך מהמנהל"]).toBeUndefined();
    expect(Object.fromEntries(statusReportRows(lesson, null, "2026-12-03"))["תאריך יעד סופי"]).toContain("באיחור של 3 ימים");
  });
  it("email shows the report, escapes HTML and mentions the attachment", () => {
    const e = lessonSubmittedEmail({
      lesson, ownerNames: ["דנה"], submittedBy: "דנה", version: 2, fileName: "מערך.pdf", note: null,
      report: { done: "<script>x</script>", next: null, blockers: "צריך פגישה עם המעבדה" }, today: "2026-11-22", url: "https://x/#/admin/lessons/1",
    });
    expect(e.subject).toBe("מערך לבדיקה: המרות אנרגיה (גרסה 2)");
    expect(e.html).toContain("דוח סטטוס");
    expect(e.html).toContain("צריך פגישה עם המעבדה");
    expect(e.html).not.toContain("<script>x</script>");
    expect(e.html).toContain("מערך.pdf");
    expect(e.text).toContain("- מה הושלם: <script>x</script>");
  });
});
