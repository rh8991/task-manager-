# Setup status & next steps

Last updated: 2026-11-04. Work branch: `claude/great-wright-3qfhuq` (not merged into `main` yet).

## Done

- **App built (v1):** Hebrew RTL task manager. Includes tasks, projects, workers and teams, email notifications, manager-triggered and weekly email reports, equipment ordering, and meeting tracking. See `README.md` and `docs/PLAN.md`.
- **Database:** Neon Postgres project `task-manager` (`purple-grass-53608385`) in the org *Technoda - science program*, region Frankfurt, Postgres 17. It is empty; the tables are created automatically on the first Vercel deploy (`prisma migrate deploy` runs during `npm run build`).
  - The connection strings are in `.env.example` with the password left out. Get the full strings from the Neon console's **Connect** button.
  - Cloud-session secrets `NEON_API_KEY` and `NEON_DB_PASSWORD` are set in the Claude Code environment.
- **Brevo account:** created (free plan, 300 emails/day).
- `claude/gifted-hawking-e8ahjg` is superseded (its Neon config was copied into this branch), so it can be deleted.

## Next steps

### 1. Finish Brevo
1. Verify your phone (the banner at the top of Brevo, then **Verify now**). Brevo won't send anything until this is done.
2. **Settings → Senders, Domains & Dedicated IPs → Senders → Add a sender** (name: `ניהול משימות`). Confirm the code Brevo emails to that address.
3. **Settings → SMTP & API → SMTP tab**: note the **Login** (`…@smtp-brevo.com`), then **Generate a new SMTP key**. Copy it right away; Brevo only shows it once. Keep it private.

### 2. Merge into main
Ask Claude to "open a PR" from `claude/great-wright-3qfhuq`, then merge it on GitHub.

### 3. Deploy on Vercel
Go to vercel.com, then **Add New Project**, and choose `rh8991/task-manager-`. Add these environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (with password) |
| `DATABASE_URL_UNPOOLED` | Neon **direct** connection string (with password) |
| `ADMIN_PASSWORD` | Manager password you choose |
| `SESSION_SECRET` | Long random string (32+ characters) |
| `CRON_SECRET` | Another long random string |
| `APP_URL` | Your Vercel address, e.g. `https://task-manager.vercel.app` |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Brevo SMTP **Login** (`…@smtp-brevo.com`) |
| `SMTP_PASS` | Brevo SMTP **key** |
| `EMAIL_FROM` | `ניהול משימות <your-verified-sender@address>` |

Then click **Deploy**.

### 4. Weekly report at the exact hour (recommended)
In GitHub, open the repo's **Settings → Secrets and variables → Actions** and add `APP_URL` and `CRON_SECRET`, with the same values as in Vercel.

### 5. First use
1. Open `<APP_URL>/login` and sign in with `ADMIN_PASSWORD`.
2. **עובדים וצוותים** (workers and teams): add your teams, then your workers and their emails.
3. **דוחות והגדרות** (reports and settings): enter your name and email, save, then press **שליחת מייל בדיקה** (send test email).
4. Choose whether to turn on the weekly report, and pick the day and hour.
5. Create the first tasks. Each worker gets an email with their personal link.

## To continue in a new Claude Code session

Open a session on `rh8991/task-manager-` and say:

> Continue from docs/SETUP.md on branch claude/great-wright-3qfhuq. I'm at step ___.

Never paste passwords or keys into the chat. Put them in Vercel or in the Claude environment settings.
