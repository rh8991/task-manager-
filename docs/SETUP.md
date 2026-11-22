# Setup: GitHub Pages + Firebase

Last updated: 2026-11-22. Everything here is free: Firebase Spark plan, GitHub Pages, GitHub Actions on a public repo, and Brevo's free plan.

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

## 3. Turn on sign-in (manager + instructors)
1. Open **Build → Authentication → Get started**, then **Sign-in method → Email/Password → Enable**, and also turn on **Email link (passwordless sign-in)** → **Save**. Instructors sign in with a link sent to their email (no password).
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
1. Open the site and choose **"כניסת מנהל עם סיסמה"** (manager sign-in with password), with the manager account from step 3.
   - If it says **"אין הרשאת מנהל"** (no manager access), wait up to 10 minutes, or open **Actions → mailer → Run workflow**, then refresh the page.
2. **צוותים** (teams): add the teams you work with, e.g. **מעבדה** (lab) and **אחזקה** (maintenance), with a contact person. Only the manager sees teams.
3. **מדריכים** (instructors): add your instructors (one at a time, or paste "name, email" lines). Each one gets a welcome email with a sign-in link.
4. **דוחות והגדרות** (reports and settings): enter your name and email, save, then press **שליחת מייל בדיקה** (send test email). Lesson files and status reports arrive at this address.
5. **מערכים** (lessons): create lessons – place (Science Park / Science Museum), ages (elementary by grade, middle school, high school), final deadline, review dates, and the instructors working on each.

## Who sees what
| | Manager | Instructor (מדריך/ה) |
|---|---|---|
| Lessons: status, who works on each, dates | sees and edits everything | sees all lessons; on their own lessons: sets "idea" / "in progress", edits the equipment list, parts and safety |
| Send the lesson file for review | can upload too | uploads the file + a status report (done / next / blockers) → emailed to the manager with the file attached |
| Approve / return with notes, create / delete lessons and instructors | ✓ | – (instructors can't delete anything) |
| Teams, equipment orders, meetings with teams | ✓ | – (they can send a "request to the manager", which shows up in the lesson's meetings) |
| Tasks | all | only their own (status + comment) |

Nothing is visible without signing in.

**Sign-in links and the free plan:** Firebase itself sends only **5 sign-in emails a day** on the free plan. When that runs out, the site asks the mailer to send the link through Brevo instead; it arrives within about 10–15 minutes. Instructors stay signed in on their device, so this is rarely needed.

## Science program: lessons (מערכים)
1. On **מערכים** (manager panel), click **+ מערך חדש** (new lesson). The assigned instructors get an email.
2. In the lesson page, add the parts of the lesson, the **equipment list** (or paste it: one item per line), mark **allergens** and **hazards**, and the review dates.
3. Instructors work on it from **המערכים שלי** (my lessons), and **send the file for review** with a status report. You get the file attached to an email, then approve it or return it with notes in the lesson page.
4. Order equipment for a lesson with **בקשת הזמנה** (order request) next to items marked "צריך להזמין" (to order). Record meetings with the lab or other teams under **פגישות נדרשות על המערך** (meetings needed for the lesson).
5. The lab prints the equipment checklist from the lesson page. Before a group arrives, check allergies at **בודק אלרגיות** (allergy checker).

Lesson files are stored in the free Firestore database (Firebase Storage needs a paid plan): up to 8 MB per file, and the newest 3 versions of each lesson keep their file.

## How to check it's working
1. **מדריכים** (instructors): each one is listed with their email and the lessons they work on.
2. **Sign in as an instructor:** in a private window, type an instructor's email, then open the link from the email. You should see **המערכים שלי** (my lessons) and the lessons board – and no teams, equipment orders or meetings.
3. **Send a lesson for review** as that instructor (any PDF). Within about 10–15 minutes you get an email with the file attached and the status report. The lesson page shows "✓ נשלח למייל" (sent by email).
4. **GitHub → Actions → mailer:** each run shows a green tick; quiet runs say `nothing to do`.
5. **Brevo → Transactional → Logs:** every email shows as delivered.
6. **Firebase console → Firestore → Usage:** daily reads stay far below the free limit of 50,000.

## Good to know
- **Email timing:** emails go out within about 10–15 minutes. GitHub sometimes starts scheduled runs late at busy times.
- **Keeping the mailer running:** GitHub pauses scheduled workflows in a repo with **no activity for 60 days**. It emails you first; click **Enable workflow** in the Actions tab to resume. Any commit also resets the 60-day clock.
- **Privacy:** nothing is visible without signing in. Instructors see lessons and the instructors' names; teams, equipment orders, meetings, emails and lesson files are visible only to the manager.
- **An instructor leaves:** on **מדריכים**, untick "פעיל/ה" (active) or delete them. They can't sign in any more.
- **Changing managers:** edit the `ADMIN_EMAILS` secret. The mailer updates access on its next run.
- **Never** paste the service-account key, SMTP key or passwords into chat, code or issues: only into GitHub secrets.

## To continue in a new Claude Code session
Open a session on `rh8991/task-manager-` and say:
> Continue from docs/SETUP.md (GitHub Pages + Firebase version). I'm at step ___.
