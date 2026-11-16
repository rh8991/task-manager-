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

export const SUBJECT: Record<Subject, string> = { CHEMISTRY: "כימיה", PHYSICS: "פיזיקה", BIOLOGY: "ביולוגיה", MULTI: "רב-תחומי" };
export const LOCATION: Record<LessonLocation, string> = { PARK_LAB: "מעבדה בפארק", MUSEUM: "מוזיאון", OTHER: "אחר" };
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

export function gradeRange(from: number, to: number): string {
  const f = GRADES[from - 1] ?? "?";
  const t = GRADES[to - 1] ?? "?";
  return from === to ? `כיתה ${f}` : `כיתות ${f}–${t}`;
}

/** Statuses where the work is still going on (the deadline matters). */
export const WORKING_STATUSES: LessonStatus[] = ["IDEA", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED"];

export const isLessonLate = (l: Pick<Lesson, "status" | "dueDate">, today: string) =>
  WORKING_STATUSES.includes(l.status) && !!l.dueDate && l.dueDate < today;

/** Defaults for fields that may be missing on older or partial documents. */
export function withLessonDefaults<T extends Partial<Lesson>>(l: T): T & Lesson {
  return {
    subject: "MULTI",
    gradeFrom: 1,
    gradeTo: 12,
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
  } as T & Lesson;
}

export function newItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}
