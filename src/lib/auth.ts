import { isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, usingEmulators } from "./firebase";

/**
 * Passwordless sign-in for instructors (and the manager): a sign-in link sent by email.
 *
 * Firebase sends only 5 such emails a day on the free plan. So we first ask Firebase to send the
 * link (instant). If that quota is used up, we store loginRequests/{email} and the mailer job
 * creates the link itself (Admin SDK) and emails it through our SMTP service (~10 minutes).
 */
const EMAIL_KEY = "tm:signInEmail";

/** Where the link brings the user back: the site root, without the "#/…" part. */
export const returnUrl = () => `${window.location.origin}${window.location.pathname}`;

export type LinkResult = "sent" | "queued";

export async function requestLoginLink(emailIn: string): Promise<LinkResult> {
  const email = emailIn.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("כתובת המייל לא תקינה");
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* private mode: the user will be asked for the email again */
  }
  try {
    await sendSignInLinkToEmail(auth, email, { url: returnUrl(), handleCodeInApp: true });
    return "sent";
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (!/quota|too-many-requests/.test(code)) throw err;
  }
  // Firebase's daily email quota is used up: the mailer sends the link instead.
  try {
    await setDoc(doc(db, "loginRequests", email), { email, createdAt: Date.now() });
  } catch {
    // Rules only accept emails of active staff. Don't reveal which emails exist.
  }
  return "queued";
}

/** True when the current address is a sign-in link coming back from the email. */
export const isLoginLink = () => isSignInWithEmailLink(auth, window.location.href);

/** The email saved on this device when the link was requested (null if opened elsewhere). */
export function savedLoginEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

/** Completes the sign-in and cleans the address bar (removes the one-time code). */
export async function finishLoginLink(email: string): Promise<void> {
  await signInWithEmailLink(auth, email.trim().toLowerCase(), window.location.href);
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* ignore */
  }
  window.history.replaceState(null, "", `${returnUrl()}#/`);
}

/**
 * Local demo only: the Auth emulator doesn't send emails, it keeps the links. Returns the newest
 * sign-in link for this email so the demo can show a "sign in" button.
 */
export async function emulatorLoginLink(email: string): Promise<string | null> {
  if (!usingEmulators) return null;
  const project = auth.app.options.projectId;
  const res = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${project}/oobCodes`);
  const { oobCodes = [] } = (await res.json()) as { oobCodes?: { email: string; requestType: string; oobLink: string }[] };
  const mine = oobCodes.filter((c) => c.email === email.trim().toLowerCase() && c.requestType === "EMAIL_SIGNIN");
  return mine.length ? mine[mine.length - 1].oobLink : null;
}
