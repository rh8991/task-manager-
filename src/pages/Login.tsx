import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAdmin } from "@/lib/data";
import { str } from "@/lib/formdata";

export function Login() {
  const { user, loading } = useAdmin();
  const navigate = useNavigate();
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  if (!loading && user) return <Navigate to="/admin" replace />;

  const [busy, setBusy] = useState(false);

  // A plain submit handler (not a form action) so a typo doesn't clear the email field.
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, str(fd, "email"), str(fd, "password"));
      navigate("/admin");
    } catch {
      setMsg({ text: "מייל או סיסמה שגויים", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function reset(email: string) {
    if (!email) return setMsg({ text: "הזינו קודם את כתובת המייל", error: true });
    try {
      await sendPasswordResetEmail(auth, email);
    } catch {
      /* don't reveal whether the address exists */
    }
    setMsg({ text: "אם הכתובת רשומה, נשלח אליה מייל לאיפוס סיסמה", error: false });
  }

  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: "4rem" }}>
      <div className="card">
        <h1>כניסת מנהל</h1>
        {msg && <div className={`flash${msg.error ? " error" : ""}`}>{msg.text}</div>}
        <form onSubmit={login} className="stack" id="login-form">
          <label>
            מייל
            <input type="email" name="email" required dir="ltr" autoComplete="username" autoFocus />
          </label>
          <label>
            סיסמה
            <input type="password" name="password" required autoComplete="current-password" />
          </label>
          <button type="submit" className="btn" disabled={busy}>{busy ? "…" : "כניסה"}</button>
        </form>
        <p className="small" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              const el = document.querySelector<HTMLInputElement>("#login-form input[name=email]");
              reset(el?.value.trim() ?? "");
            }}
          >
            שכחתי סיסמה
          </button>
        </p>
        <p className="muted small" style={{ marginBottom: 0 }}>
          עובדים לא צריכים להתחבר – כל עובד מקבל קישור אישי במייל. <a href="#/">ללוח המשותף</a>
        </p>
      </div>
    </main>
  );
}
