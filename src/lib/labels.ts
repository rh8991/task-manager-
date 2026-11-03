import type { EquipmentStatus, MeetingStatus, Priority, TaskStatus } from "@prisma/client";

export const TASK_STATUS: Record<TaskStatus, string> = {
  TODO: "לביצוע",
  IN_PROGRESS: "בתהליך",
  BLOCKED: "תקוע",
  DONE: "הושלם",
};

export const PRIORITY: Record<Priority, string> = {
  LOW: "נמוכה",
  MEDIUM: "בינונית",
  HIGH: "גבוהה",
  URGENT: "דחופה",
};

export const EQUIPMENT_STATUS: Record<EquipmentStatus, string> = {
  PENDING: "ממתין לאישור",
  APPROVED: "אושר – להזמנה",
  REJECTED: "נדחה",
  ORDERED: "הוזמן",
  RECEIVED: "התקבל",
};

export const MEETING_STATUS: Record<MeetingStatus, string> = {
  OPEN: "נדרשת פגישה",
  SCHEDULED: "נקבעה",
  DONE: "התקיימה",
  CANCELLED: "בוטלה",
};

export const WEEKDAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** Badge tone per status, used for CSS classes. */
export const TONE: Record<string, "gray" | "blue" | "red" | "green" | "amber" | "purple"> = {
  TODO: "gray",
  IN_PROGRESS: "blue",
  BLOCKED: "red",
  DONE: "green",
  LOW: "gray",
  MEDIUM: "blue",
  HIGH: "amber",
  URGENT: "red",
  PENDING: "amber",
  APPROVED: "purple",
  REJECTED: "gray",
  ORDERED: "blue",
  RECEIVED: "green",
  OPEN: "amber",
  SCHEDULED: "blue",
  CANCELLED: "gray",
};
