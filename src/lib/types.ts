/**
 * Firestore document shapes. Shared by the web app (src/) and the mailer (scripts/).
 * Dates without time ("due dates") are "YYYY-MM-DD" strings; timestamps are epoch milliseconds.
 */

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const EQUIPMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED", "ORDERED", "RECEIVED"] as const;
export const MEETING_STATUSES = ["OPEN", "SCHEDULED", "DONE", "CANCELLED"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** Every document read from Firestore carries its id. */
export type WithId<T> = T & { id: string };

export type Team = { name: string; createdAt: number };

/** Public part of a worker (shown on the shared board). */
export type Worker = { name: string; teamId: string | null; active: boolean; createdAt: number };

/** Private part of a worker: only the manager (and the mailer) can read it. */
export type WorkerPrivate = { email: string; token: string };

/** workerLinks/{token}: lets a personal link find its worker without exposing other tokens. */
export type WorkerLink = { workerId: string };

export type Project = {
  name: string;
  description: string | null;
  dueDate: string | null;
  active: boolean;
  createdAt: number;
};

export type Task = {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  projectId: string | null;
  assigneeId: string | null;
  completedAt: number | null;
  lastComment: string | null;
  lastProofId: string | null;
  reminderSentAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type TaskUpdate = {
  taskId: string;
  workerId: string | null; // null = the manager
  oldStatus: TaskStatus | null;
  newStatus: TaskStatus | null;
  comment: string | null;
  proofId: string | null;
  createdAt: number;
};

export type EquipmentRequest = {
  item: string;
  quantity: number;
  link: string | null;
  estCost: number | null;
  notes: string | null;
  neededBy: string | null;
  status: EquipmentStatus;
  managerNote: string | null;
  requesterId: string | null;
  projectId: string | null;
  proofId: string | null;
  approvedAt: number | null;
  orderedAt: number | null;
  receivedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type MeetingRequest = {
  topic: string;
  notes: string | null;
  neededBy: string | null;
  status: MeetingStatus;
  withTeamId: string | null;
  requesterId: string | null;
  proofId: string | null;
  createdAt: number;
  updatedAt: number;
};

/** proofs/{id}: written together with a worker's change to prove they hold the personal link. */
export type Proof = { token: string; workerId: string; createdAt: number };

export type OutboxItem =
  | { type: "task-assigned"; taskId: string; reassigned: boolean }
  | { type: "manager-notice"; subject: string; lines: string[]; path: string; proofId?: string }
  | { type: "report"; workerIds: string[] | null; note: string | null }
  | { type: "test" };

export type OutboxDoc = OutboxItem & {
  status: "pending" | "sending" | "sent" | "failed";
  createdAt: number;
  processedAt?: number | null;
  result?: string | null;
};

export type Settings = {
  managerName: string;
  managerEmail: string | null;
  notifyManager: boolean;
  reportEnabled: boolean;
  reportDay: number; // 0 = Sunday
  reportHour: number; // Israel time
  scheduleUpdatedAt: number;
  lastReportAt: number | null;
  remindersEnabled: boolean;
  lastReminderDate: string | null;
};

export const DEFAULT_SETTINGS: Settings = {
  managerName: "מנהל",
  managerEmail: null,
  notifyManager: true,
  reportEnabled: false,
  reportDay: 0,
  reportHour: 8,
  scheduleUpdatedAt: 0,
  lastReportAt: null,
  remindersEnabled: true,
  lastReminderDate: null,
};

export type EmailLog = {
  to: string;
  subject: string;
  kind: string;
  status: "SENT" | "FAILED" | "LOGGED";
  error: string | null;
  createdAt: number;
};
