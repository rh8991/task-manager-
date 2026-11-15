import { useEffect } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAdmin } from "@/lib/data";
import { FlashBox, useFlash } from "./Flash";

const LINKS = [
  { to: "/admin", label: "סקירה", end: true },
  { to: "/admin/tasks", label: "משימות" },
  { to: "/admin/projects", label: "פרויקטים" },
  { to: "/admin/workers", label: "עובדים וצוותים" },
  { to: "/admin/equipment", label: "הזמנות ציוד" },
  { to: "/admin/meetings", label: "פגישות" },
  { to: "/admin/reports", label: "דוחות והגדרות" },
];

/** Manager area: requires a Firebase sign-in whose uid is in admins/. */
export function AdminLayout() {
  const { user, isAdmin, loading } = useAdmin();
  const { clear } = useFlash();
  const location = useLocation();
  useEffect(() => clear(), [location.pathname, clear]);

  if (loading) return <main className="container"><p className="muted">טוען…</p></main>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <main className="container" style={{ maxWidth: 560, paddingTop: "4rem" }}>
        <div className="card">
          <h1>אין הרשאת מנהל</h1>
          <p>
            החשבון <strong dir="ltr">{user.email}</strong> מחובר, אבל עדיין לא מוגדר כמנהל.
          </p>
          <p className="muted small">
            ההרשאה נוספת אוטומטית תוך כ-10 דקות אם הכתובת מופיעה ב-ADMIN_EMAILS בהגדרות GitHub (ראו docs/SETUP.md). אחר כך רעננו את הדף.
          </p>
          <button className="btn ghost" onClick={() => signOut(auth)}>יציאה</button>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/admin" className="brand">פאנל ניהול</Link>
          <nav className="nav">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? "active" : "")}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="row">
            <Link to="/" className="btn ghost sm">לוח משותף</Link>
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
