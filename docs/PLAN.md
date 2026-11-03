# Task Manager: Solution Options & Plan

Status: **draft for review**. No code yet. Pick an option and answer the open questions (section 7), then build starts.

---

## 1. Requirements (as understood)

| # | Requirement | Who uses it |
|---|-------------|-------------|
| R1 | Each worker gets a **personal report by email** listing their tasks | Worker |
| R2 | A **shared dashboard** that everyone can see (team or company-wide task status) | Everyone |
| R3 | **Manager control panel**: create projects, create and assign tasks, follow progress | Manager |
| R4 | **Due dates and status updates** on tasks (with history) | Worker, Manager |
| R5 | **Equipment ordering**: request items and track them through to "received" | Worker, Manager, Purchaser |
| R6 | **Meeting requests** with other teams (who, topic, when) | Worker, Manager |
| R7 | **Notifications** so a worker knows when they get a task (and about other changes) | Worker |

---

## 2. Solution options

### Option A: No-code on your existing office suite
Use **Microsoft 365** (Planner + Lists + Power Automate + Teams + Outlook) or **Google Workspace** (Sheets + AppSheet + Apps Script + Gmail/Calendar).

- **Good:** fastest (days), no hosting, everyone already has accounts, calendar and email built in.
- **Bad:** flows get fragile as rules grow, limited dashboards and permissions, hard to customize the equipment and meeting workflows, tied to one vendor's licensing.
- **Fits:** small team (<20), needs it next week, little custom logic.

### Option B: Configure an off-the-shelf work-management SaaS
**ClickUp, Monday.com, Jira Work Management, Asana**, set up with forms for equipment and meeting requests and automations for email digests.

- **Good:** fast (1–2 weeks of setup), mature dashboards, mobile apps, notifications included.
- **Bad:** per-seat monthly cost, equipment ordering and cross-team meeting requests are "bent" into task boards, data lives in a third party, the personal digest format is limited.
- **Fits:** budget for licences, and the processes look a lot like standard project management.

### Option C: Custom web app (recommended)
A web app built for exactly these workflows, signing in through your company's Google or Microsoft accounts and using their mail and calendar APIs.

- **Good:** each module (tasks, equipment, meetings) works the way your team works, full control of email reports and dashboards, no per-seat fees, your data stays in your database, can grow (approvals, budgets, reports).
- **Bad:** takes longest (MVP in about 3–4 weeks for one developer), needs hosting and maintenance.
- **Fits:** the equipment and meeting workflows matter, you want it branded and long-lived, and you are willing to own the code.

### Option D: Hybrid
A custom app for the parts that are unique (equipment ordering, meeting requests, digest emails) that **syncs tasks with an existing tool** (Jira, ClickUp or Planner) through its API.

- **Good:** reuses a tool people may already know.
- **Bad:** two systems, sync edge cases, often more complex than A or C alone.

### Comparison

| | A: No-code | B: SaaS | C: Custom | D: Hybrid |
|---|---|---|---|---|
| Time to first use | Days | 1–2 weeks | 3–4 weeks (MVP) | 4–6 weeks |
| Running cost | Included in suite | $8–25 per user/month | Hosting ~$20–50/month | Both |
| Fit for equipment and meetings | Weak | Medium | Strong | Strong |
| Custom email reports | Medium | Weak–Medium | Strong | Strong |
| Long-term flexibility | Low | Medium | High | Medium |

**Recommendation: Option C**, connected to whichever email and calendar suite you already use. The rest of this document plans Option C.

---

## 3. Architecture (Option C)

```
 ┌──────────────┐     ┌───────────────────────────┐     ┌──────────────┐
 │  Browser /   │────▶│  Web app (Next.js, TS)    │────▶│ PostgreSQL   │
 │  mobile PWA  │◀────│  UI + API routes          │◀────│              │
 └──────────────┘     └──────────┬────────────────┘     └──────────────┘
                                 │ enqueue jobs
                      ┌──────────▼────────────┐
                      │ Background worker     │  daily/weekly digests,
                      │ (pg-boss job queue)   │  due-date reminders,
                      └──────────┬────────────┘  notification fan-out
                                 │
          ┌──────────────────────┼─────────────────────────┐
          ▼                      ▼                         ▼
   Email (SMTP / Resend)   Google / Microsoft         Optional: Slack /
   React Email templates   Calendar API (free/busy,   Teams webhooks,
                           create meeting invites)     Web Push
```

**Proposed stack**
- **Frontend and backend:** Next.js (App Router) + TypeScript, Tailwind + shadcn/ui
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** Auth.js with Google or Microsoft SSO, plus role-based access (worker / manager / purchaser / admin)
- **Jobs:** pg-boss (runs on the same Postgres, so no Redis needed) for scheduled digests and reminders
- **Email:** React Email templates, sent through SMTP or Resend
- **Calendar:** Google Calendar or Microsoft Graph API for meeting scheduling
- **Deploy:** Docker Compose (app + worker + Postgres) on any VPS, or Vercel + managed Postgres
- **Tests:** Vitest (unit), Playwright (end-to-end)

*Alternative stack:* Django + HTMX. Django's built-in admin gives a working manager panel almost for free. It is a good choice if the team prefers Python.

---

## 4. Data model (first draft)

```
User            id, name, email, role, teamId, notificationPrefs
Team            id, name, managerId
Project         id, name, description, ownerId, teamId, status, startDate, dueDate
Task            id, projectId, title, description, assigneeId, createdById,
                status [todo | in_progress | blocked | review | done],
                priority [low | medium | high | urgent], dueDate, completedAt
TaskUpdate      id, taskId, authorId, oldStatus, newStatus, comment, createdAt   ← status history
EquipmentRequest id, requesterId, projectId?, taskId?, itemName, quantity, link,
                estCost, vendor, neededBy, approverId,
                status [requested | approved | rejected | ordered | shipped | received],
                orderRef, receivedAt
MeetingRequest  id, requesterId, fromTeamId, topic, agenda, durationMin,
                windowStart, windowEnd, linkedProjectId?,
                status [requested | proposed | scheduled | declined | done],
                scheduledAt, calendarEventId
MeetingInvitee  meetingRequestId, teamId?, userId?, response
Notification    id, userId, type, entityType, entityId, message, readAt, createdAt
AuditLog        id, actorId, action, entityType, entityId, diff, createdAt
```

---

## 5. Modules and screens

### 5.1 Worker
- **My Tasks:** list or Kanban, filter by project, status and due date. One-click status change with an optional comment.
- **Task detail:** description, due date, status history, comments, linked equipment requests.
- **Request equipment** form (can be linked to a task or project).
- **Request meeting** form: pick teams or people, topic, duration, preferred date range.
- **Notification bell** with unread count. Notification settings: email immediately / daily digest / off, per type.

### 5.2 Manager control panel
- **Overview:** tasks per status, overdue tasks, workload per worker, project progress bars.
- **Projects:** create, edit and archive projects; see each project's tasks and timeline.
- **Tasks:** create, assign, reassign, bulk-edit, set due dates and priority.
- **Equipment queue:** approve or reject, mark ordered/shipped/received, total cost per project.
- **Meeting requests:** see incoming requests for the team, accept or propose a time, which creates a calendar invite.
- **Team:** members and roles.

### 5.3 Shared dashboard (read-only for everyone)
- Board per team or project: what is in progress, what is done this week, what is overdue.
- "What needs to be ordered": equipment requests by status.
- Upcoming cross-team meetings.
- Optional TV/wall-display mode (auto-refresh, full screen).

### 5.4 Email reports
- **Personal digest** (default: daily at 08:00, configurable to weekly): your open tasks grouped by *Overdue / Due today / Due this week / Later*, new assignments since the last digest, pending equipment, upcoming meetings, and a link to each item.
- **Manager digest** (weekly): team progress, overdue items, equipment waiting for approval.

### 5.5 Notifications
Triggers (each one creates an in-app notification and, depending on the user's settings, an email):

| Event | Notified |
|-------|----------|
| Task assigned or reassigned to you | Assignee |
| Task due in 24h / overdue | Assignee (+ manager when overdue) |
| Status changed / comment on your task | Task creator, assignee |
| Equipment request approved, rejected, ordered or received | Requester |
| New equipment request | Approver / purchaser |
| Meeting requested with your team | Team manager / invitees |
| Meeting scheduled or changed | All invitees |

Channels: in-app (always), email (immediate or bundled into the digest), and optionally Slack/Teams webhooks or browser push in a later phase.

---

## 6. Delivery phases

| Phase | Scope | Rough effort |
|-------|-------|--------------|
| **0. Setup** | Repo scaffold, CI, Docker Compose, DB schema, SSO login, roles, seed data | 2–3 days |
| **1. MVP: tasks** | Projects, tasks, status and due dates, status history, My Tasks, manager task management, in-app notifications, assignment email | 1.5–2 weeks |
| **2. Reports** | Daily/weekly personal digest, due/overdue reminders, shared dashboard, manager overview | 1 week |
| **3. Equipment** | Request form, approval flow, order tracking, "to order" dashboard, notifications | 1 week |
| **4. Meetings** | Request form, team inbox, calendar free/busy lookup, create invite via Google/Microsoft API | 1–1.5 weeks |
| **5. Polish** | Slack/Teams/push, CSV/PDF export, audit log UI, mobile PWA, accessibility review | ongoing |

Each phase ends with something usable that can be deployed.

---

## 7. Open questions (please answer before build starts)

1. **Which option?** A, B, C or D (recommended: C).
2. **Email and calendar provider:** Google Workspace, Microsoft 365, or something else? This decides SSO, the mail sender and the calendar integration.
3. **Size:** roughly how many workers, managers and teams?
4. **Hosting:** cloud (Vercel/VPS) or an internal company server?
5. **Equipment approvals:** who approves (team manager? a purchaser? a budget threshold?), and do you need costs and budgets per project?
6. **Meetings:** should the system book the slot automatically from people's calendars, or just collect the request and let a manager confirm?
7. **Dashboard visibility:** can everyone see every team, or only their own?
8. **Language and direction:** English only, or another language as well (for example Hebrew or Arabic, which need right-to-left layout)?
9. **Digest timing:** daily, weekly, or user-selectable? What time zone?
