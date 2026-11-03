import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "./db";

/**
 * Sends email over SMTP, so any provider works (Gmail, Outlook, Brevo, Resend, SendGrid...).
 * Workers can use any personal address. If SMTP is not configured, emails are written to the
 * server log instead (useful for local development), and still recorded in EmailLog.
 */
let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return (transporter = null);
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    pool: true,
    maxConnections: 3,
  });
  return transporter;
}

export type Email = { to: string; subject: string; html: string; text: string; kind: string };

export async function sendEmail(email: Email): Promise<boolean> {
  const t = getTransporter();
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || "tasks@example.com";

  if (!t) {
    console.log(`[email:not-sent] to=${email.to} subject="${email.subject}"\n${email.text}\n`);
    await db.emailLog.create({ data: { to: email.to, subject: email.subject, kind: email.kind, status: "LOGGED" } });
    return true;
  }

  try {
    await t.sendMail({ from, to: email.to, subject: email.subject, html: email.html, text: email.text });
    await db.emailLog.create({ data: { to: email.to, subject: email.subject, kind: email.kind, status: "SENT" } });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email:failed] to=${email.to}: ${message}`);
    await db.emailLog.create({
      data: { to: email.to, subject: email.subject, kind: email.kind, status: "FAILED", error: message.slice(0, 500) },
    });
    return false;
  }
}

/** Sends several emails, a few at a time, and returns how many succeeded. */
export async function sendMany(emails: Email[]): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  for (let i = 0; i < emails.length; i += 3) {
    const results = await Promise.all(emails.slice(i, i + 3).map(sendEmail));
    sent += results.filter(Boolean).length;
  }
  return { sent, failed: emails.length - sent };
}

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}
