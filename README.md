# Task Manager (ניהול משימות)

A Hebrew, right-to-left task management web app for a team of about 30 workers and one manager.

- **Workers don't log in.** Each worker gets a private personal link (included in every email). From it they can see their tasks, update a task's status, and ask for equipment or a meeting.
- **Email is the main channel.** Emails go to any address (Gmail, Outlook, Walla, a company domain…).
- **The manager panel** sits behind one password.

## Features

| Area | What it does |
|------|--------------|
| **Tasks** | The manager creates tasks with an assignee, project, priority and due date. Statuses are To do / In progress / Blocked / Done, and every change and comment is kept in the task's history. |
| **Notifications** | Email to the worker when they get a task (or one is moved to them), and a reminder the day before a task is due. Optional emails to the manager when a worker updates a task or asks for equipment or a meeting. |
| **Email report** | Each worker gets their own report: open tasks grouped as overdue / today / this week / later, plus their equipment requests and meeting needs. The manager sends it with **"שליחת דוח"** (send report), either to everyone or to selected workers, and can add a personal note. It can also go out automatically **every week** on a day and hour the manager picks. |
| **Shared dashboard** | `/` shows who is working on what, counts of overdue, blocked and in-progress tasks, what equipment needs to be ordered, and the meetings needed between teams. It can be filtered by team, and has a TV/wall mode (`?tv=1`, refreshes every 2 minutes). |
| **Equipment** | A worker asks for an item. The manager approves or rejects it, then marks it ordered and received. "Approved" is the list of items still to order, with an estimated total cost. |
| **Meetings** | Records that a meeting is needed, with which team, and by when. Booking happens outside the system; the manager marks it scheduled or done. |
| **Email log** | Every email sent, failed, or only logged is listed on the Reports page. |

## Tech

Next.js 16 (App Router, server actions), TypeScript, PostgreSQL with Prisma, and Nodemailer for SMTP. There are no client-side frameworks beyond React and no CSS framework.

```
src/app/page.tsx              shared dashboard
src/app/w/[token]/            worker personal page (+ actions)
src/app/admin/                manager panel (+ actions.ts with all mutations)
src/app/api/cron/route.ts     weekly report + due reminders (called hourly)
src/lib/notify.ts             builds and sends emails
src/lib/email-templates.ts    Hebrew RTL email HTML
src/lib/schedule.ts           "is the weekly report due?" logic (unit-tested)
prisma/schema.prisma          data model
```

## Run locally

Requires Node 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env          # fill DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET
npx prisma migrate dev        # create tables
npm run db:seed               # optional demo data (wipes the DB!)
npm run dev                   # http://localhost:3000
```

Without `SMTP_HOST`, emails are printed to the server console and marked "not sent" in the email log.

Checks: `npm run typecheck` and `npm test`.

## Deploy to the cloud (free tier is enough for 30 workers)

1. **Database:** create a free Postgres database on [Neon](https://neon.tech) and copy its connection string.
2. **Email:** pick an SMTP provider. [Brevo](https://brevo.com) is free for 300 emails a day. Gmail also works with an App Password. Verify your sender address or domain with the provider so emails don't land in spam.
3. **Hosting:** import this GitHub repo into [Vercel](https://vercel.com). Add the environment variables from `.env.example`. Set `APP_URL` to the Vercel address, and set `SESSION_SECRET` and `CRON_SECRET` to long random strings. Each deploy runs the database migrations automatically.
4. **Scheduler (weekly report and reminders):**
   - `vercel.json` already calls `/api/cron` once a day. That is enough for due-date reminders.
   - To send the weekly report at the **exact hour** the manager chose, also enable the included GitHub Action (`.github/workflows/cron.yml`). It runs every hour: in GitHub, open Settings → Secrets → Actions and add `APP_URL` and `CRON_SECRET`.
   - Any other cron service (for example cron-job.org) works too: `GET $APP_URL/api/cron` with the header `Authorization: Bearer $CRON_SECRET`. Calling it more often is harmless, because each job runs at most once per slot.
5. Open `/login`, then:
   - Add teams and workers.
   - Set your name and email under **דוחות והגדרות** (reports and settings).
   - Press **שליחת מייל בדיקה** (send test email) to confirm email works.

Other hosts that run Node.js (Render, Railway, Fly.io, a VPS) work too: `npm run build && npm start`.

## Security notes

- A worker's personal link works like a password. Anyone who has it can update that worker's tasks. If a link leaks, use **קישור חדש** (new link) on the Workers page; the old link stops working right away.
- The dashboard is public by default (it is not indexed by search engines). Set `DASHBOARD_PRIVATE=true` to show it only through links from emails, or to a logged-in manager.
- Every manager action checks the signed admin cookie on the server.
