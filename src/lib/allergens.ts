import type { Lesson, LessonItem } from "./types";

/**
 * Allergens, hazards and safety requirements for lesson equipment.
 * Pure functions, shared by the web app and the mailer.
 */
export const ALLERGENS: Record<string, string> = {
  GLUTEN: "גלוטן / חיטה",
  PEANUTS: "בוטנים",
  TREE_NUTS: "אגוזים",
  SESAME: "שומשום",
  MILK: "חלב",
  EGGS: "ביצים",
  SOY: "סויה",
  FISH: "דגים",
  SHELLFISH: "רכיכות / סרטנים",
  MUSTARD: "חרדל",
  CELERY: "סלרי",
  SULFITES: "סולפיטים",
  LATEX: "לטקס",
  OTHER: "אחר",
};

export const HAZARDS: Record<string, string> = {
  CORROSIVE: "צורב",
  FLAMMABLE: "דליק",
  OXIDIZER: "מחמצן",
  TOXIC: "רעיל",
  HOT: "חם / כוויות",
  SHARP: "שביר / חד",
  PRESSURE: "גז / לחץ",
  ELECTRIC: "חשמל",
  BIOLOGICAL: "ביולוגי",
};

export const HAZARD_ICON: Record<string, string> = {
  CORROSIVE: "🧪",
  FLAMMABLE: "🔥",
  OXIDIZER: "⭕",
  TOXIC: "☠️",
  HOT: "♨️",
  SHARP: "✂️",
  PRESSURE: "💨",
  ELECTRIC: "⚡",
  BIOLOGICAL: "🦠",
};

export const SAFETY: Record<string, string> = {
  GOGGLES: "משקפי מגן",
  GLOVES: "כפפות",
  LAB_COAT: "חלוק",
  FUME_HOOD: "מנדף",
  OUTDOORS: "ביצוע בחוץ",
  EXTINGUISHER: "מטף בהישג יד",
  INSTRUCTOR_ONLY: "הדגמה ע״י המדריך בלבד",
};

/** Safety requirements suggested by each hazard. */
const HAZARD_SAFETY: Record<string, string[]> = {
  CORROSIVE: ["GOGGLES", "GLOVES"],
  FLAMMABLE: ["EXTINGUISHER"],
  OXIDIZER: ["GOGGLES", "GLOVES"],
  TOXIC: ["GLOVES", "FUME_HOOD"],
  HOT: ["GLOVES"],
  PRESSURE: ["GOGGLES"],
  BIOLOGICAL: ["GLOVES"],
};

const order = (codes: Iterable<string>, ref: Record<string, string>) =>
  [...new Set(codes)].filter((c) => c in ref).sort((a, b) => Object.keys(ref).indexOf(a) - Object.keys(ref).indexOf(b));

/** Food item whose allergens were neither listed nor explicitly confirmed as none. */
export const missingAllergenInfo = (i: LessonItem) => i.food && i.allergens.length === 0 && !i.noKnownAllergens;

export type LessonSafetySummary = {
  food: boolean;
  allergens: string[]; // codes
  allergenOther: string[]; // free-text "other" allergens
  hazards: string[];
  suggestedSafety: string[];
  missingSafety: string[]; // suggested by hazards but not marked on the lesson
  itemsMissingAllergenInfo: LessonItem[];
};

export function summarizeLesson(lesson: Pick<Lesson, "equipment" | "safety">): LessonSafetySummary {
  const items = lesson.equipment ?? [];
  const hazards = order(items.flatMap((i) => i.hazards), HAZARDS);
  const suggestedSafety = order(hazards.flatMap((h) => HAZARD_SAFETY[h] ?? []), SAFETY);
  return {
    food: items.some((i) => i.food),
    allergens: order(items.flatMap((i) => i.allergens), ALLERGENS),
    allergenOther: [...new Set(items.filter((i) => i.allergens.includes("OTHER") && i.allergenOther).map((i) => i.allergenOther!.trim()))],
    hazards,
    suggestedSafety,
    missingSafety: suggestedSafety.filter((s) => !(lesson.safety ?? []).includes(s)),
    itemsMissingAllergenInfo: items.filter(missingAllergenInfo),
  };
}

export const allergenNames = (s: Pick<LessonSafetySummary, "allergens" | "allergenOther">) => [
  ...s.allergens.filter((a) => a !== "OTHER").map((a) => ALLERGENS[a]),
  ...s.allergenOther,
  ...(s.allergens.includes("OTHER") && !s.allergenOther.length ? [ALLERGENS.OTHER] : []),
];

/**
 * "Allergy check": which lessons contain any of the selected allergens (and which items),
 * and which don't. Lessons with food items lacking allergen info are listed as "unknown".
 */
export function allergenCheck<L extends Pick<Lesson, "equipment" | "safety">>(lessons: L[], selected: string[]) {
  const contains: { lesson: L; items: LessonItem[] }[] = [];
  const unknown: { lesson: L; items: LessonItem[] }[] = [];
  const safe: L[] = [];
  for (const lesson of lessons) {
    const items = (lesson.equipment ?? []).filter((i) => i.allergens.some((a) => selected.includes(a)));
    const missing = (lesson.equipment ?? []).filter(missingAllergenInfo);
    if (items.length) contains.push({ lesson, items });
    else if (missing.length) unknown.push({ lesson, items: missing });
    else safe.push(lesson);
  }
  return { contains, unknown, safe };
}

/** Why a lesson can't be submitted yet (null = OK). */
export function submitBlocker(lesson: Pick<Lesson, "equipment">): string | null {
  const missing = (lesson.equipment ?? []).filter(missingAllergenInfo);
  if (missing.length) {
    return `יש פריטי מזון בלי מידע על אלרגנים: ${missing.map((i) => i.name).join(", ")}. יש לסמן אלרגנים או "ללא אלרגנים ידועים".`;
  }
  return null;
}
