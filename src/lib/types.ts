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

/** Another department (lab, maintenance…). Manager only: instructors never see teams. */
export type Team = { name: string; contactName?: string | null; contactEmail?: string | null; notes?: string | null; createdAt: number };

/** Public part of a worker (shown on the shared board). */
export type Worker = { name: string; teamId: string | null; active: boolean; createdAt: number };

/** Private part of a worker: only the manager (and the mailer) can read it. */
export type WorkerPrivate = { email: string; token?: string };

/**
 * members/{email}: who may sign in as an instructor (email-link sign-in). The manager creates it
 * together with the worker. Rules use it to know which worker a signed-in email belongs to.
 */
export type Member = { workerId: string; active: boolean };

/** workerLinks/{token}: lets a personal link find its worker without exposing other tokens. */
export type WorkerLink = { workerId: string };

export type Project = {
  name: string;
  description: string | null;
  dueDate: string | null;
  active: boolean;
  createdAt: number;
};

/** A review (checkpoint) on the way to a task's due date. The manager sets and checks them. */
export type Review = {
  id: string;
  date: string; // YYYY-MM-DD
  note: string | null; // what is checked, e.g. "draft ready"
  done: boolean;
  doneAt: number | null;
};

export type Task = {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  projectId: string | null;
  assigneeId: string | null;
  /** Lesson this task belongs to (null = a general science-program task). */
  lessonId?: string | null;
  /** Department (team) the task is for, even without a specific worker. */
  teamId?: string | null;
  completedAt: number | null;
  lastComment: string | null;
  lastProofId: string | null;
  reminderSentAt: number | null;
  /** Review dates on the way to the due date (missing on tasks created before this feature). */
  reviews?: Review[];
  /** Review ids that already got a "review tomorrow" email (written by the mailer). */
  remindedReviewIds?: string[];
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
  /** Lesson the item is ordered for. */
  lessonId?: string | null;
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
  /** Lesson the meeting is about (null = general). */
  lessonId?: string | null;
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
  | { type: "test" }
  | { type: "lesson-submitted"; lessonId: string; submissionId: string; proofId?: string }
  | { type: "lesson-decision"; lessonId: string; submissionId: string }
  | { type: "lesson-assigned"; lessonId: string; workerIds: string[] }
  | { type: "instructor-welcome"; workerId: string };

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

// ---------------------------------------------------------------- lessons (מערכים)

export const LESSON_STATUSES = ["IDEA", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "ACTIVE", "ARCHIVED"] as const;
export const SUBJECTS = ["CHEMISTRY", "PHYSICS", "BIOLOGY", "MULTI"] as const;
export const LESSON_LOCATIONS = ["PARK_LAB", "MUSEUM", "OTHER"] as const;
export const LESSON_KINDS = ["NEW", "RENOVATION"] as const;
export const ACTIVITY_KINDS = ["DEMO", "HANDS_ON", "PRESENTATION", "DIGITAL", "COMPETITION", "DISCUSSION"] as const;
export const ITEM_FOR = ["INSTRUCTOR", "PER_GROUP", "PER_STUDENT"] as const;

export type LessonStatus = (typeof LESSON_STATUSES)[number];
export type Subject = (typeof SUBJECTS)[number];
export type LessonLocation = (typeof LESSON_LOCATIONS)[number];
export type LessonKind = (typeof LESSON_KINDS)[number];
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type ItemFor = (typeof ITEM_FOR)[number];

/** One part of the lesson: a demo, a hands-on activity, a presentation… */
export type LessonActivity = { id: string; kind: ActivityKind; title: string };

/** One line of the lesson's equipment list (what the lab prepares before each session). */
export type LessonItem = {
  id: string;
  name: string;
  quantity: string; // free text: "2", "2-3", "500 מ\"ל"
  for: ItemFor;
  food: boolean;
  allergens: string[]; // codes from ALLERGENS (src/lib/allergens.ts)
  allergenOther: string | null; // free text when "OTHER" is chosen
  noKnownAllergens: boolean; // explicitly confirmed for food items
  hazards: string[]; // codes from HAZARDS
  toOrder: boolean;
  notes: string | null;
};

export type Lesson = {
  title: string;
  subject: Subject;
  /** Grades the lesson is for: 1 = א … 12 = יב (elementary per grade; middle / high as whole stages). */
  grades: number[];
  /** Older lessons stored a range instead of `grades`. */
  gradeFrom?: number;
  gradeTo?: number;
  location: LessonLocation;
  durationMin: number;
  kind: LessonKind;
  goals: string | null;
  summary: string | null;
  ownerIds: string[]; // instructors working on it
  status: LessonStatus;
  startDate: string | null;
  dueDate: string | null; // final deadline
  reviews?: Review[];
  remindedReviewIds?: string[];
  activities: LessonActivity[];
  equipment: LessonItem[];
  safety: string[]; // codes from SAFETY
  managerNotes: string | null; // last notes when changes were requested
  version: number; // number of the last submitted version (0 = never)
  lastSubmittedAt: number | null;
  lastProofId: string | null;
  reminderSentAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type LessonSubmission = {
  lessonId: string;
  version: number;
  fileId: string | null;
  fileName: string | null;
  fileSize: number | null;
  note: string | null;
  submittedBy: string | null; // worker id, null = manager
  submittedAt: number;
  emailStatus: "pending" | "sent" | "failed";
  emailAt: number | null;
  emailError: string | null;
  decision: "APPROVED" | "CHANGES_REQUESTED" | null;
  decisionNotes: string | null;
  decidedAt: number | null;
  /** Status report written by the instructor when sending. */
  report?: { done: string | null; next: string | null; blockers: string | null } | null;
  proofId: string | null;
};

/** lessonFiles/{fileId}: the uploaded file; its bytes are in lessonFiles/{fileId}/chunks/{n}. */
export type LessonFile = {
  lessonId: string;
  name: string;
  size: number;
  mimeType: string;
  chunkCount: number;
  uploadedBy: string | null;
  proofId: string | null;
  createdAt: number;
  deleted?: boolean; // older versions: bytes removed to save space
};
