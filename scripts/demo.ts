/**
 * Try the whole app on your own computer with one command:  npm run demo
 *
 * Runs inside `firebase emulators:exec` (local Firestore + Auth, no Firebase account needed),
 * loads demo data (30 workers), grants manager access, starts the website, and runs the mailer
 * every minute so the email log fills up. Emails are NOT really sent: they are printed here.
 * Works on Windows, macOS and Linux. Stop with Ctrl+C. Nothing is saved after you stop.
 */
import { spawn, spawnSync } from "node:child_process";

const env = {
  ...process.env,
  GCLOUD_PROJECT: "demo-task-manager",
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099",
  ADMIN_EMAILS: "manager@example.com",
  APP_URL: "http://localhost:5173/",
  // Make sure the mailer only logs emails, even if SMTP settings exist on this machine.
  SMTP_HOST: "",
};

const tsx = (script: string) => spawnSync("npx", ["tsx", script], { env, stdio: "inherit", shell: true });

console.log("\n=== Loading demo data (30 workers) ===");
if (tsx("scripts/seed-emulator.ts").status !== 0) process.exit(1);

console.log("\n=== Granting manager access ===");
tsx("scripts/mailer.ts");

// Run the mailer every minute, like GitHub Actions does every 10 minutes in production.
const timer = setInterval(() => {
  const r = spawnSync("npx", ["tsx", "scripts/mailer.ts"], { env, shell: true, encoding: "utf8" });
  const lines = `${r.stdout}`.split("\n").filter((l) => /outbox|report|reminders|email:/.test(l));
  if (lines.length) console.log(`\n[mailer] ${lines.join("\n[mailer] ")}`);
}, 60_000);

console.log(`
=================================================================
  Open:     http://localhost:5173
  Manager:  "כניסת מנהל עם סיסמה" → manager@example.com / manager123
  Instructor: type dana@example.com → "שלחו לי קישור כניסה" → "כניסה (הדגמה)"
            (use another browser / private window to be manager and instructor at once)
  Emails:   the mailer runs every minute; see the email log on the Reports page
            (marked "לא נשלח (אין SMTP)" – nothing is really emailed in the demo)
  Stop:     Ctrl+C
=================================================================
`);

const vite = spawn("npx", ["vite", "--mode", "emulator", "--port", "5173", "--strictPort"], { env, stdio: "inherit", shell: true });
const stop = () => {
  clearInterval(timer);
  vite.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.on("exit", stop);
