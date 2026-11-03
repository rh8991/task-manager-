"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "סקירה" },
  { href: "/admin/tasks", label: "משימות" },
  { href: "/admin/projects", label: "פרויקטים" },
  { href: "/admin/workers", label: "עובדים וצוותים" },
  { href: "/admin/equipment", label: "הזמנות ציוד" },
  { href: "/admin/meetings", label: "פגישות" },
  { href: "/admin/reports", label: "דוחות והגדרות" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
