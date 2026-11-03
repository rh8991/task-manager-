import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "@/components/AdminNav";
import { logout } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/admin" className="brand">
            פאנל ניהול
          </Link>
          <AdminNav />
          <div className="row">
            <Link href="/" className="btn ghost sm">
              לוח משותף
            </Link>
            <form action={logout}>
              <button className="btn ghost sm">יציאה</button>
            </form>
          </div>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
