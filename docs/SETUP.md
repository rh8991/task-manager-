# Setup: GitHub Pages + Firebase

Last updated: 2026-11-15. Everything here is free: Firebase Spark plan, GitHub Pages, GitHub Actions on a public repo, and Brevo's free plan.

The app now runs on **GitHub Pages + Firebase**. The previous Neon/Vercel setup isn't used any more; you can delete the Neon project "task-manager" whenever you like.

You'll need about 30 minutes, and all of it can be done in Chrome.

---

## 1. Create the Firebase project
1. Go to **console.firebase.google.com**, then **Create a project**. A name like `task-manager` is fine. Google Analytics isn't needed.
2. Stay on the free **Spark** plan. Don't add a card.

## 2. Turn on Firestore (the database)
1. In the left menu, open **Build → Firestore Database → Create database**.
2. Pick a location, for example **eur3 (Europe)** or **europe-west**. It can't be changed later.
3. Choose **production mode**. The deploy workflow installs the real security rules (step 8).

## 3. Turn on manager sign-in
1. Open **Build → Authentication → Get started**, then **Sign-in method → Email/Password → Enable → Save**.
2. Under **Users → Add user**, enter the manager's email and a strong password.
3. Under **Settings → Authorized domains → Add domain**, add `rh8991.github.io`. This is needed for the "forgot password" email link.

## 4. Copy the web config into GitHub (variables)
1. In Firebase, open **Project settings** (gear icon) → **Your apps** → the **</>** (Web) button. Register the app; no hosting is needed.
2. Firebase shows a `firebaseConfig` with `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` and `appId`. These values are **public by design**: the security rules protect the data.
3. In GitHub, open the repo `rh8991/task-manager-`, then **Settings → Secrets and variables → Actions → Variables tab → New repository variable**. Add each one:

| Variable | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |
| `APP_URL` | `https://rh8991.github.io/task-manager-/` |

## 5. Service-account key (GitHub secret)
This key lets the mailer job and the rules deployment act on your Firebase project. **Keep it private.**
1. In Firebase, open **Project settings → Service accounts → Generate new private key**. A `.json` file downloads.
2. In GitHub, open **Settings → Secrets and variables → Actions → Secrets tab → New repository secret**:
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: open the `.json` file in a text editor and paste **its whole contents**.
3. Then delete the downloaded file from your computer.

## 6. Email and manager secrets (GitHub secrets)
Add these as **secrets** on the same page. The Brevo values come from Brevo's **SMTP & API → SMTP** page.

| Secret | Value |
|---|---|
| `ADMIN_EMAILS` | The manager's email from step 3 (several can be comma-separated) |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Brevo SMTP **Login** (`…@smtp-brevo.com`) |
| `SMTP_PASS` | Brevo SMTP **key** |
| `EMAIL_FROM` | `ניהול משימות <your-verified-sender@address>` |

Brevo still needs the steps from before: verify your phone, and add and confirm the sender address.

## 7. Turn on GitHub Pages
Go to **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.

## 8. Merge to main
Merge the pull request for this work into `main`. GitHub Actions then:
- builds and publishes the site to **https://rh8991.github.io/task-manager-/** (workflow **deploy**)
- deploys the security rules to Firestore (same workflow)
- starts the **mailer**, which runs every 10 minutes from then on

Watch progress under the repo's **Actions** tab; each run should show a green tick. If the **firestore-rules** step fails with a permissions error, open Firebase **Firestore → Rules**, paste in the contents of `firestore.rules` from the repo, and click **Publish**.

## 9. First use
1. Open the site, then **ניהול** (manage), and sign in with the manager account.
   - If it says **"אין הרשאת מנהל"** (no manager access), wait up to 10 minutes, or open **Actions → mailer → Run workflow**, then refresh the page.
2. **עובדים וצוותים** (workers and teams): add your teams, then your workers with their emails.
3. **דוחות והגדרות** (reports and settings): enter your name and email, save, then press **שליחת מייל בדיקה** (send test email). It arrives within about 10–15 minutes. To send it right away, use **Actions → mailer → Run workflow**.
4. Choose whether to turn on the weekly report, and pick the day and hour.
5. Create tasks. Each worker gets an email with their personal link.

---

## Good to know
- **Email timing:** emails go out within about 10–15 minutes. GitHub sometimes starts scheduled runs late at busy times.
- **Keeping the mailer running:** GitHub pauses scheduled workflows in a repo with **no activity for 60 days**. It emails you first; click **Enable workflow** in the Actions tab to resume. Any commit also resets the 60-day clock.
- **Privacy:** anyone with the site address can see the shared board (names, task titles, equipment, meetings). Workers' emails and personal links are visible only to the manager.
- **A leaked personal link:** use **קישור חדש** (new link) on the Workers page; the old link stops working at once.
- **Changing managers:** edit the `ADMIN_EMAILS` secret. The mailer updates access on its next run.
- **Never** paste the service-account key, SMTP key or passwords into chat, code or issues: only into GitHub secrets.

## To continue in a new Claude Code session
Open a session on `rh8991/task-manager-` and say:
> Continue from docs/SETUP.md (GitHub Pages + Firebase version). I'm at step ___.
