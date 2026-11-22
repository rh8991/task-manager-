import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, usingEmulators } from "@/lib/firebase";
import { useSession } from "@/lib/data";
import { emulatorLoginLink, finishLoginLink, isLoginLink, requestLoginLink, savedLoginEmail } from "@/lib/auth";
import { str } from "@/lib/formdata";

type Msg = { text: string; error: boolean } | null;

/**
 * Sign in. Instructors (and the manager) get a sign-in link by email – no password.
 * The manager can also use email + password.
 */
export function Login() {
  const s = useSession();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [demoLink, setDemoLink] = useState<string | null>(null);

  if (!s.loading && s.role === "admin") return <Navigate to="/admin" replace />;
  if (!s.loading && s.role === "instructor") return <Navigate to="/me" replace />;

  async function sendLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = str(new FormData(e.currentTarget), "email");
    setBusy(true);
    setDemoLink(null);
    try {
      const r = await requestLoginLink(email);
      setMsg({
        text:
          r === "sent"
            ? `אם הכתובת ${email} רשומה במערכת, נשלח אליה עכשיו קישור כניסה. פותחים את המייל ולוחצים על הקישור.`
            : `אם הכתובת ${email} רשומה במערכת, יישלח אליה קישור כניסה תוך כ-10–15 דקות.`,
        error: false,
      });
      if (usingEmulators) setDemoLink(await emulatorLoginLink(email));
    } catch (err) {
      setMsg({ text: err instanceof Error && err.message.includes("לא תקינה") ? err.message : "לא הצלחנו לשלוח קישור. נסו שוב.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function passwordLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, str(fd, "email"), str(fd, "password"));
    } catch {
      setMsg({ text: "מייל או סיסמה שגויים", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const email = document.querySelector<HTMLInputElement>("#password-form input[name=email]")?.value.trim();
    if (!email) return setMsg({ text: "הזינו קודם את כתובת המייל", error: true });
    try {
      await sendPasswordResetEmail(auth, email);
    } catch {
      /* don't reveal whether the address exists */
    }
    setMsg({ text: "אם הכתובת רשומה, נשלח אליה מייל לאיפוס סיסמה", error: false });
  }

  return (
    <main className="container" style={{ maxWidth: 460, paddingTop: "4rem" }}>
      <div className="card">
        <h1>כניסה – מערכים, תכנית המדעים</h1>
        {msg && <div className={`flash${msg.error ? " error" : ""}`}>{msg.text}</div>}

        {s.user && !s.loading && !s.role && (
          <div className="flash error">
            החשבון <strong dir="ltr">{s.user.email}</strong> לא רשום כמדריך/ה או כמנהל. פנו למנהל התכנית.{" "}
            <button className="btn ghost sm" onClick={() => signOut(auth)}>יציאה</button>
          </div>
        )}

        <form onSubmit={sendLink} className="stack">
          <label>
            המייל שלך
            <input type="email" name="email" required dir="ltr" autoComplete="email" autoFocus placeholder="name@example.com" />
          </label>
          <button type="submit" className="btn" disabled={busy}>{busy ? "…" : "שלחו לי קישור כניסה"}</button>
          <p className="muted small" style={{ margin: 0 }}>בלי סיסמה: מקבלים מייל עם קישור, לוחצים – ונכנסים. במכשיר הזה תישארו מחוברים.</p>
        </form>

        {demoLink && (
          <p style={{ marginBottom: 0 }}>
            <a className="btn secondary" href={demoLink}>כניסה (הדגמה)</a>{" "}
            <span className="muted small">בהדגמה המקומית לא נשלחים מיילים – זה הקישור שהיה נשלח.</span>
          </p>
        )}

        <details style={{ marginTop: "1rem" }}>
          <summary className="small">כניסת מנהל עם סיסמה</summary>
          <form onSubmit={passwordLogin} className="stack" id="password-form">
            <label>מייל<input type="email" name="email" required dir="ltr" autoComplete="username" /></label>
            <label>סיסמה<input type="password" name="password" required autoComplete="current-password" /></label>
            <div className="row">
              <button type="submit" className="btn" disabled={busy}>{busy ? "…" : "כניסה"}</button>
              <button type="button" className="btn ghost sm" onClick={reset}>שכחתי סיסמה</button>
            </div>
          </form>
        </details>
      </div>
    </main>
  );
}

/**
 * Runs once when the app opens: if the address is a sign-in link from the email, completes the
 * sign-in (asking for the email when the link was opened on another device).
 */
export function LoginLinkHandler({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"idle" | "working" | "ask" | "error">(() => (isLoginLink() ? "working" : "idle"));
  const [error, setError] = useState<string | null>(null);

  const finish = async (email: string) => {
    setState("working");
    try {
      await finishLoginLink(email);
      setState("idle");
    } catch {
      setError("הקישור לא תקף או שכבר השתמשו בו. בקשו קישור חדש.");
      window.history.replaceState(null, "", `${window.location.pathname}#/login`);
      setState("error");
    }
  };

  useEffect(() => {
    if (state !== "working" || !isLoginLink()) return;
    const email = savedLoginEmail();
    if (email) void finish(email);
    else setState("ask");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "idle") return <>{children}</>;
  return (
    <main className="container" style={{ maxWidth: 460, paddingTop: "4rem" }}>
      <div className="card">
        <h1>כניסה</h1>
        {state === "working" && <p className="muted">מתחברים…</p>}
        {state === "error" && (
          <>
            <div className="flash error">{error}</div>
            <a className="btn" href="#/login" onClick={() => setState("idle")}>לדף הכניסה</a>
          </>
        )}
        {state === "ask" && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void finish(str(new FormData(e.currentTarget), "email"));
            }}
          >
            <p style={{ margin: 0 }}>פתחתם את הקישור במכשיר אחר. כדי להשלים את הכניסה, הקלידו שוב את המייל:</p>
            <input type="email" name="email" required dir="ltr" autoFocus />
            <button className="btn">כניסה</button>
          </form>
        )}
      </div>
    </main>
  );
}
