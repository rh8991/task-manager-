import { useEffect } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useDocument, useSession } from "@/lib/data";
import type { Worker } from "@/lib/types";
import { FlashBox, useFlash } from "./Flash";

/**
 * Pages for signed-in staff: instructors (מדריכים) and the manager. Instructors see only their
 * lessons, the lessons board and the allergy checker – no teams, equipment orders or meetings.
 */
export function StaffLayout() {
  const s = useSession();
  const me = useDocument<Worker>(s.workerId ? `workers/${s.workerId}` : null);
  const { clear } = useFlash();
  const location = useLocation();
  useEffect(() => clear(), [location.pathname, clear]);

  if (s.loading) return <main className="container"><p className="muted">טוען…</p></main>;
  if (!s.user || !s.role) return <Navigate to="/login" replace />;

  const links =
    s.role === "admin"
      ? [{ to: "/lessons", label: "לוח מערכים" }, { to: "/allergens", label: "בודק אלרגיות" }]
      : [
          { to: "/me", label: "המערכים והמשימות שלי" },
          { to: "/lessons", label: "לוח מערכים" },
          { to: "/allergens", label: "בודק אלרגיות" },
        ];

  return (
    <>
      <header className="topbar no-print">
        <div className="topbar-inner">
          <span className="brand">{s.role === "instructor" ? `שלום ${me.data?.name ?? ""} 👋` : "תכנית המדעים"}</span>
          <nav className="nav">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "active" : "")}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="row">
            {s.role === "admin" && <Link to="/admin" className="btn ghost sm">פאנל ניהול</Link>}
            <button className="btn ghost sm" onClick={() => signOut(auth)}>יציאה</button>
          </div>
        </div>
      </header>
      <main className="container">
        <FlashBox />
        <Outlet />
      </main>
    </>
  );
}

/** "/" – sends each user to their home page. */
export function HomeRedirect() {
  const s = useSession();
  if (s.loading) return <main className="container"><p className="muted">טוען…</p></main>;
  if (s.role === "admin") return <Navigate to="/admin" replace />;
  if (s.role === "instructor") return <Navigate to="/me" replace />;
  return <Navigate to="/login" replace />;
}

/** Old personal links (#/w/<token>) from before sign-in existed. */
export function OldPersonalLink() {
  return (
    <main className="container" style={{ maxWidth: 460, paddingTop: "4rem" }}>
      <div className="card">
        <h1>נכנסים עכשיו עם המייל</h1>
        <p>הקישורים האישיים הישנים כבר לא בשימוש. מקלידים את המייל ומקבלים קישור כניסה.</p>
        <Link to="/login" className="btn">לדף הכניסה</Link>
      </div>
    </main>
  );
}
