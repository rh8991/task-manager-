# Task Manager (ניהול משימות)

A Hebrew, right-to-left task manager for a team of workers (tested with 30+; there is no limit) and a manager. It runs entirely on **free services**:

- **GitHub Pages** hosts the website (static files).
- **Firebase** (free Spark plan) stores the data in **Firestore** and handles the manager's sign-in (**Firebase Auth**).
- **GitHub Actions** runs a small **mailer** every 10 minutes that sends the emails through an SMTP service such as Brevo.

Workers **don't log in**. Each one has a private personal link, included in every email, where they see their tasks, update a status, and ask for equipment or a meeting. The manager signs in with email and password.

## Features

| Area | What it does |
|------|--------------|
| **Tasks** | The manager creates tasks with an assignee, project, priority and due date. Statuses are To do / In progress / Blocked / Done, with a history of every change and comment. |
| **Lessons (מערכים)** | For the science program: every lesson plan with its status (idea → in progress → sent for review → returned / approved → active), the instructors working on it, start date, **final deadline** and review dates. The manager sees all of it at `#/admin/lessons`; everyone sees the lessons board at `#/lessons`. |
| **Lesson file → manager's email** | The instructor uploads the lesson file (PDF / Word / PowerPoint, up to 8 MB) from their personal page and sends it for review. The manager gets it **as an email attachment** (forward it from Outlook), the lesson becomes "sent for review", and the page shows whether the email went out. She approves or returns it with notes; the instructors get an email. Every version is kept (the newest 3 with their files). |
| **Equipment, allergens, hazards** | Each lesson has an equipment list (for the instructor / per group / per child) with **allergens** (gluten, peanuts, nuts, sesame, milk, eggs, soy, fish, shellfish, mustard, celery, sulfites, **latex**, other) and **hazards** (corrosive, flammable, oxidizer, toxic, hot, sharp, pressure, electric, biological). Food items must have allergen info before a lesson can be sent. Safety requirements are suggested from the hazards. **Printable equipment checklist** for the lab (`#/lesson/<id>/print`) and an **allergy checker** (`#/allergens`): which lessons contain the selected allergens. |
| **Departments** | Teams act as departments (instructors, lab, maintenance). Tasks can belong to a department and/or a lesson, or be general science-program tasks (e.g. filming videos for park exhibits). "Order" on a lesson's equipment item creates an equipment request for the lab. |
| **Review dates** | Checkpoints on the way to a task's due date, each with a date and what is checked (e.g. "first draft"). The manager adds them when creating or editing a task and marks each one "done". Workers see them on their page; the board shows each task's next review; the manager's overview lists reviews due this week and overdue ones. The worker gets an email reminder the day before a review. |
| **Task view** | Click any task on the shared board (or on a worker's page) to open its page: details, assignee, project, due date, the review timeline and the history of updates. |
| **Notifications** | Email to the worker when they get a task (or one is moved to them), and a reminder the day before a task is due. Optional emails to the manager when a worker updates a task or asks for equipment or a meeting. |
| **Email report** | Each worker gets their own report: open tasks grouped as overdue / today / this week / later, plus their equipment and meeting requests. The manager sends it on demand (to everyone or selected workers, with an optional note), or it goes out **weekly** at a day and hour the manager picks. |
| **Shared board** | Who is working on what, overdue and blocked counts, equipment to order, and meetings needed between teams. It updates live, can be filtered by team, and has a TV mode. |
| **Workers** | Add one at a time, or paste a whole list (`name, email, team` per line, or columns from a spreadsheet). Each worker gets a private personal link. |
| **Equipment** | A worker asks for an item, and the manager approves or rejects it, then marks it ordered and received. "Approved" is the list of items still to order, with an estimated total cost. |
| **Meetings** | Records that a meeting is needed, with which team and by when. Booking happens outside the system. |

Emails are sent by the mailer job, so they arrive **within about 10–15 minutes**, not instantly.

## How it works

```
GitHub Pages: React app (Vite, HashRouter)  ──Firebase SDK──▶  Firestore + Firebase Auth
   manager: signs in (#/admin)                                   ▲
   worker:  personal link (#/w/<token>)                          │ Admin SDK
GitHub Actions "mailer" (every 10 min) ──────────────────────────┘ ──SMTP──▶ Brevo ──▶ inboxes
```

There is no server, so **`firestore.rules` is the security layer**:

- The shared board (names, task titles, statuses, equipment, meetings) can be read by anyone with the site address.
- Workers' **emails and personal-link tokens are private**: only the signed-in manager can read them.
- Only managers can create or edit tasks, projects and workers. A manager is a Firebase Auth user listed in the `ADMIN_EMAILS` secret; the mailer keeps the `admins` collection in sync with it.
- A worker's change (status, equipment or meeting request) is accepted only when it is sent together with a fresh "proof" containing that worker's secret token. The rules check it, and the proof can't be read back, so tokens never become public. A worker can change only the status and comment of their own tasks.
- The app queues emails in an `outbox` collection; the mailer sends them with the service-account key, which lives only in GitHub secrets.

`tests/rules/` checks these rules on the Firestore emulator. It covers what must be allowed and what must be blocked: other workers' tasks, fake or replayed tokens, edits beyond the status, reading private data, and making yourself an admin.

## Project layout

```
src/pages/            Dashboard, WorkerPage, Login, admin/* (overview, tasks, projects, workers, equipment, meetings, reports)
src/lib/actions.ts    manager writes (Firestore batches; queue outbox emails)
src/lib/workerActions.ts  worker writes with the token "proof"
src/lib/email-templates.ts, report.ts, schedule.ts, dates.ts, labels.ts   shared with the mailer
scripts/mailer.ts     the email job (GitHub Actions)
scripts/seed-emulator.ts  demo data for local development
firestore.rules       security rules (deployed by the deploy workflow)
.github/workflows/    deploy (Pages + rules), mailer (every 10 min), ci
```

## Try it on your own computer (no Firebase account needed)

Everything runs locally with demo data (30 workers). Nothing is emailed for real.

**Install once** (Windows, macOS or Linux):
1. **Node.js 22 LTS**: https://nodejs.org (the "LTS" button).
2. **Java 21**: https://adoptium.net (Temurin 21). The local Firebase database needs it.
3. **Git**: https://git-scm.com.

**Then, in a terminal** (on Windows: PowerShell):
```bash
git clone https://github.com/rh8991/task-manager-.git
cd task-manager-
git checkout claude/great-wright-3qfhuq   # until it's merged into main
npm install
npm run demo
```
Wait for the box that says **Open: http://localhost:5173**, then open that address:
- **Manager:** click **ניהול** (manage) → `manager@example.com` / `manager123`
- **A worker's view:** Workers page → **פתיחה** (open) next to any worker
- **Emails:** the mailer runs every minute; each email is printed in the terminal and listed in the email log on the Reports page

Stop with **Ctrl+C**. Each `npm run demo` starts fresh.

The first run downloads the Firebase emulator (about 1–2 minutes). On Windows, if the firewall asks about Java or Node, click **Allow**.

### For developers
```bash
npm run emulators          # terminal 1: local Firestore + Auth (keeps data while running)
npm run seed               # terminal 2: demo data
npm run mailer:emulator    # grant manager access + process queued emails (run again any time)
npm run dev:emulator       # http://localhost:5173
```
Checks: `npm run typecheck`, `npm test` (unit), `npm run test:rules` (security rules on the emulator), `npm run build`.

## Deploy

Follow **[docs/SETUP.md](docs/SETUP.md)**. In short: create a Firebase project (free), add its web config as GitHub variables and a service-account key plus SMTP settings as GitHub secrets, turn on Pages, and merge to `main`. The site is published at `https://<user>.github.io/<repo>/`.
