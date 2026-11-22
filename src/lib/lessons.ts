import type { ActivityKind, ItemFor, Lesson, LessonKind, LessonLocation, LessonStatus, Subject } from "./types";

/** Labels and small helpers for lessons (מערכים). */
export const LESSON_STATUS: Record<LessonStatus, string> = {
  IDEA: "רעיון",
  IN_PROGRESS: "בכתיבה / בשיפוץ",
  SUBMITTED: "נשלח לבדיקה",
  CHANGES_REQUESTED: "הוחזר עם הערות",
  APPROVED: "מאושר",
  ACTIVE: "פעיל בתכנית",
  ARCHIVED: "בארכיון",
};

export const LESSON_TONE: Record<LessonStatus, string> = {
  IDEA: "gray",
  IN_PROGRESS: "blue",
  SUBMITTED: "amber",
  CHANGES_REQUESTED: "red",
  APPROVED: "purple",
  ACTIVE: "green",
  ARCHIVED: "gray",
};

/** Statuses an instructor may set by hand. "Sent for review" happens only by sending the file. */
export const INSTRUCTOR_STATUSES: LessonStatus[] = ["IDEA", "IN_PROGRESS"];

export const SUBJECT: Record<Subject, string> = { CHEMISTRY: "כימיה", PHYSICS: "פיזיקה", BIOLOGY: "ביולוגיה", MULTI: "רב-תחומי" };
export const LOCATION: Record<LessonLocation, string> = { PARK_LAB: "פארק המדע", MUSEUM: "מוזיאון המדע", OTHER: "אחר" };
/** Locations offered when creating / editing a lesson ("other" is kept only for old data). */
export const MAIN_LOCATIONS: LessonLocation[] = ["PARK_LAB", "MUSEUM"];
export const LESSON_KIND: Record<LessonKind, string> = { NEW: "מערך חדש", RENOVATION: "שיפוץ מערך קיים" };
export const ACTIVITY_KIND: Record<ActivityKind, string> = {
  DEMO: "הדגמה",
  HANDS_ON: "התנסות",
  PRESENTATION: "מצגת",
  DIGITAL: "תוכן דיגיטלי",
  COMPETITION: "תחרות",
  DISCUSSION: "דיון",
};
export const ITEM_FOR_LABEL: Record<ItemFor, string> = { INSTRUCTOR: "למדריך", PER_GROUP: "לכל קבוצה", PER_STUDENT: "לכל ילד" };

export const GRADES = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "יא", "יב"];

// ---------------------------------------------------------------- ages

export type Stage = "ELEMENTARY" | "MIDDLE" | "HIGH";
export const STAGES: { key: Stage; label: string; short: string; grades: number[] }[] = [
  { key: "ELEMENTARY", label: "יסודי", short: "יסודי", grades: [1, 2, 3, 4, 5, 6] },
  { key: "MIDDLE", label: "חטיבת ביניים", short: 'חט"ב', grades: [7, 8, 9] },
  { key: "HIGH", label: "תיכון", short: "תיכון", grades: [10, 11, 12] },
];

export const stageOf = (grade: number): Stage => (grade <= 6 ? "ELEMENTARY" : grade <= 9 ? "MIDDLE" : "HIGH");
export const lessonStages = (grades: number[]): Stage[] => STAGES.filter((s) => s.grades.some((g) => grades.includes(g))).map((s) => s.key);

/** Valid, sorted, unique grades 1–12. */
export function cleanGrades(grades: unknown[]): number[] {
  return [...new Set(grades.map(Number).filter((g) => Number.isInteger(g) && g >= 1 && g <= 12))].sort((a, b) => a - b);
}

/** Consecutive runs as "ג–ד", single grades as "ב". */
function runs(grades: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < grades.length; i++) {
    let j = i;
    while (j + 1 < grades.length && grades[j + 1] === grades[j] + 1) j++;
    out.push(i === j ? GRADES[grades[i] - 1] : `${GRADES[grades[i] - 1]}–${GRADES[grades[j] - 1]}`);
    i = j;
  }
  return out.join(", ");
}

/**
 * Human label for the ages of a lesson, by school stage:
 * "יסודי (ג–ד)", "חטיבת ביניים", "חט"ב + תיכון", "יסודי (ו) + חט"ב".
 */
export function gradeLabel(gradesIn: number[]): string {
  const grades = cleanGrades(gradesIn);
  if (!grades.length) return "גיל לא נקבע";
  const parts = STAGES.flatMap((s) => {
    const g = grades.filter((x) => s.grades.includes(x));
    if (!g.length) return [];
    const whole = g.length === s.grades.length;
    if (s.key === "ELEMENTARY") return [whole ? "יסודי (א–ו)" : `יסודי (${runs(g)})`];
    return [whole ? s.label : `${s.label} (${runs(g)})`];
  });
  if (parts.length === 1) return parts[0];
  return parts.map((p) => p.replace("חטיבת ביניים", 'חט"ב')).join(" + ");
}

/** @deprecated older range form – kept for callers that still pass a range. */
export function gradeRange(from: number, to: number): string {
  return gradeLabel(Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i));
}

// ---------------------------------------------------------------- status & defaults

/** Statuses where the work is still going on (the deadline matters). */
export const WORKING_STATUSES: LessonStatus[] = ["IDEA", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED"];

export const isLessonLate = (l: Pick<Lesson, "status" | "dueDate">, today: string) =>
  WORKING_STATUSES.includes(l.status) && !!l.dueDate && l.dueDate < today;

/** Defaults for fields that may be missing on older or partial documents. */
export function withLessonDefaults<T extends Partial<Lesson>>(l: T): T & Lesson {
  const grades =
    Array.isArray(l.grades) && l.grades.length
      ? cleanGrades(l.grades)
      : l.gradeFrom || l.gradeTo
        ? cleanGrades(Array.from({ length: (l.gradeTo ?? 12) - (l.gradeFrom ?? 1) + 1 }, (_, i) => (l.gradeFrom ?? 1) + i))
        : [];
  return {
    subject: "MULTI",
    location: "PARK_LAB",
    durationMin: 90,
    kind: "NEW",
    goals: null,
    summary: null,
    ownerIds: [],
    status: "IDEA",
    startDate: null,
    dueDate: null,
    activities: [],
    equipment: [],
    safety: [],
    managerNotes: null,
    version: 0,
    lastSubmittedAt: null,
    lastProofId: null,
    reminderSentAt: null,
    createdAt: 0,
    updatedAt: 0,
    title: "",
    ...l,
    grades,
  } as T & Lesson;
}

export function newItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}
