import Link from "next/link";
import type { EquipmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { EQUIPMENT_STATUS } from "@/lib/labels";
import { Badge, Flash, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createEquipment, deleteEquipment, setEquipmentStatus } from "../actions";

const NEXT_STEP: Partial<Record<EquipmentStatus, { status: EquipmentStatus; label: string }[]>> = {
  PENDING: [
    { status: "APPROVED", label: "אישור" },
    { status: "REJECTED", label: "דחייה" },
  ],
  APPROVED: [{ status: "ORDERED", label: "סימון כהוזמן" }],
  ORDERED: [{ status: "RECEIVED", label: "סימון כהתקבל" }],
  REJECTED: [{ status: "PENDING", label: "החזרה להמתנה" }],
};

const FILTERS: { key: string; label: string; statuses: EquipmentStatus[] }[] = [
  { key: "active", label: "פתוחות", statuses: ["PENDING", "APPROVED", "ORDERED"] },
  { key: "PENDING", label: "ממתין לאישור", statuses: ["PENDING"] },
  { key: "APPROVED", label: "להזמנה", statuses: ["APPROVED"] },
  { key: "ORDERED", label: "הוזמן", statuses: ["ORDERED"] },
  { key: "closed", label: "התקבל / נדחה", statuses: ["RECEIVED", "REJECTED"] },
];

function money(n: number) {
  return `₪${n.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string; f?: string }> }) {
  const { msg, error, f = "active" } = await searchParams;
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[0];

  const [items, counts, workers, projects] = await Promise.all([
    db.equipmentRequest.findMany({
      where: { status: { in: filter.statuses } },
      include: { requester: true, project: true },
      orderBy: [{ neededBy: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    db.equipmentRequest.groupBy({ by: ["status"], _count: true, _sum: { estCost: true } }),
    db.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.project.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const c = (s: EquipmentStatus) => counts.find((x) => x.status === s);

  return (
    <>
      <h1>הזמנות ציוד</h1>
      <Flash msg={msg} error={error} />

      <div className="stats">
        <Stat num={c("PENDING")?._count ?? 0} label="ממתין לאישור" alert={(c("PENDING")?._count ?? 0) > 0} />
        <Stat num={c("APPROVED")?._count ?? 0} label="אושר – צריך להזמין" />
        <Stat num={money(Number(c("APPROVED")?._sum.estCost ?? 0))} label="עלות משוערת להזמנה" />
        <Stat num={c("ORDERED")?._count ?? 0} label="הוזמן, טרם התקבל" />
      </div>

      <details className="card">
        <summary>+ הוספת פריט להזמנה</summary>
        <form action={createEquipment} className="stack">
          <div className="fields">
            <label>פריט<input name="item" required /></label>
            <label>כמות<input name="quantity" type="number" min={1} defaultValue={1} /></label>
            <label>עלות משוערת (₪)<input name="estCost" type="number" min={0} step="0.01" /></label>
            <label>נדרש עד<input name="neededBy" type="date" /></label>
            <label>
              עבור עובד/ת
              <select name="requesterId" defaultValue="">
                <option value="">— מנהל —</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label>
              פרויקט
              <select name="projectId" defaultValue="">
                <option value="">— ללא —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <label>קישור לפריט / ספק<input name="link" type="url" dir="ltr" placeholder="https://" /></label>
          <label>הערות<textarea name="notes" /></label>
          <div className="row">
            <SubmitButton>הוספה</SubmitButton>
            <span className="muted small">פריט שהמנהל מוסיף נכנס ישר לרשימת &quot;להזמנה&quot;.</span>
          </div>
        </form>
      </details>

      <div className="row" style={{ marginBottom: ".75rem" }}>
        {FILTERS.map((x) => (
          <Link key={x.key} href={`/admin/equipment?f=${x.key}`} className={`btn sm ${x.key === filter.key ? "" : "ghost"}`}>
            {x.label}
          </Link>
        ))}
      </div>

      <section className="card">
        {items.length === 0 ? (
          <p className="empty">אין פריטים בקטגוריה הזו</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>פריט</th><th>כמות</th><th>עלות</th><th>מבקש/ת</th><th>פרויקט</th><th>נדרש עד</th><th>סטטוס</th><th>פעולות</th></tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.item}</strong>
                      {e.link && <> · <a href={e.link} target="_blank" rel="noopener noreferrer" className="small">קישור</a></>}
                      {e.notes && <div className="muted small pre">{e.notes}</div>}
                      {e.managerNote && <div className="small pre">הערת מנהל: {e.managerNote}</div>}
                    </td>
                    <td>{e.quantity}</td>
                    <td className="nowrap">{e.estCost ? money(Number(e.estCost)) : "—"}</td>
                    <td>{e.requester?.name ?? <span className="muted">מנהל</span>}</td>
                    <td className="muted">{e.project?.name ?? "—"}</td>
                    <td className="nowrap">{formatDate(e.neededBy) || "—"}</td>
                    <td>
                      <Badge value={e.status} label={EQUIPMENT_STATUS[e.status]} />
                      <div className="muted small">
                        {e.status === "ORDERED" && e.orderedAt && `הוזמן ${formatDate(e.orderedAt)}`}
                        {e.status === "RECEIVED" && e.receivedAt && `התקבל ${formatDate(e.receivedAt)}`}
                      </div>
                    </td>
                    <td>
                      <div className="row">
                        {(NEXT_STEP[e.status] ?? []).map((step) => (
                          <form key={step.status} action={setEquipmentStatus}>
                            <input type="hidden" name="id" value={e.id} />
                            <input type="hidden" name="status" value={step.status} />
                            <SubmitButton className={`btn sm ${step.status === "REJECTED" ? "danger" : ""}`}>{step.label}</SubmitButton>
                          </form>
                        ))}
                        <details>
                          <summary className="small">עוד</summary>
                          <form action={setEquipmentStatus} className="stack" style={{ minWidth: 200 }}>
                            <input type="hidden" name="id" value={e.id} />
                            <select name="status" defaultValue={e.status}>
                              {Object.entries(EQUIPMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            <input name="managerNote" defaultValue={e.managerNote ?? ""} placeholder="הערת מנהל (גלויה לעובד/ת)" />
                            <SubmitButton className="btn sm">שמירה</SubmitButton>
                          </form>
                          <form action={deleteEquipment} style={{ marginTop: ".4rem" }}>
                            <input type="hidden" name="id" value={e.id} />
                            <SubmitButton className="btn danger sm" confirm="למחוק את הבקשה?">מחיקה</SubmitButton>
                          </form>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
