import { describe, expect, it } from "vitest";
import { parseWorkerLines } from "@/lib/bulk";

describe("parseWorkerLines", () => {
  it("reads name, email and optional team; skips blank lines", () => {
    const r = parseWorkerLines("דנה כהן, Dana@Example.com, פיתוח\n\nיוסי לוי, yossi@gmail.com\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { line: 1, name: "דנה כהן", email: "dana@example.com", team: "פיתוח" },
      { line: 3, name: "יוסי לוי", email: "yossi@gmail.com", team: null },
    ]);
  });

  it("accepts tabs and semicolons (pasted from a spreadsheet)", () => {
    const r = parseWorkerLines("מיכל\tmichal@walla.co.il\tתפעול\nאבי;avi@example.com;רכש");
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.team)).toEqual(["תפעול", "רכש"]);
  });

  it("reports bad lines with their line numbers", () => {
    const r = parseWorkerLines(", nobody@example.com\nnoa, not-an-email\nomer, omer@example.com\nomer2, OMER@example.com");
    expect(r.errors).toHaveLength(3);
    expect(r.errors[0]).toContain("שורה 1");
    expect(r.errors[1]).toContain("שורה 2");
    expect(r.errors[2]).toContain("שורה 4");
  });

  it("rejects emails that already exist", () => {
    const r = parseWorkerLines("דנה, dana@example.com", ["DANA@example.com"]);
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toContain("כבר קיים");
  });

  it("complains about empty input", () => {
    expect(parseWorkerLines("  \n ").errors).toHaveLength(1);
  });

  it("handles 30 workers", () => {
    const text = Array.from({ length: 30 }, (_, i) => `עובד ${i + 1}, w${i + 1}@example.com, צוות ${(i % 4) + 1}`).join("\n");
    const r = parseWorkerLines(text);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(30);
  });
});
