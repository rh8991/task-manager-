import { describe, expect, it } from "vitest";
import { allergenCheck, allergenNames, submitBlocker, summarizeLesson } from "@/lib/allergens";
import { fileProblem, joinBytes, splitBytes } from "@/lib/files";
import { gradeRange, isLessonLate } from "@/lib/lessons";
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
  it("grade ranges in Hebrew", () => {
    expect(gradeRange(7, 9)).toBe("כיתות ז–ט");
    expect(gradeRange(11, 12)).toBe("כיתות יא–יב");
    expect(gradeRange(3, 3)).toBe("כיתה ג");
  });
  it("late only while still being worked on", () => {
    expect(isLessonLate({ status: "IN_PROGRESS", dueDate: "2026-11-01" }, "2026-11-16")).toBe(true);
    expect(isLessonLate({ status: "APPROVED", dueDate: "2026-11-01" }, "2026-11-16")).toBe(false);
  });
});
