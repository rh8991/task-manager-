import { Link, useSearchParams } from "react-router";
import { byId, useCollection } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { EQUIPMENT_STATUS } from "@/lib/labels";
import { createEquipment, deleteEquipment, setEquipmentStatus } from "@/lib/actions";
import { EQUIPMENT_STATUSES, type EquipmentRequest, type EquipmentStatus, type Project, type Worker } from "@/lib/types";
import { oneOf, optDate, optInt, optNum, optStr, optUrl, str } from "@/lib/formdata";
import { Badge, Stat } from "@/components/ui";
import { useAct } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

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

const money = (n: number) => `₪${n.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;

export function EquipmentPage() {
  const act = useAct();
  const [sp] = useSearchParams();
  const filter = FILTERS.find((x) => x.key === (sp.get("f") ?? "active")) ?? FILTERS[0];
  const equipment = useCollection<EquipmentRequest>("equipment");
  const workers = useCollection<Worker>("workers");
  const projects = useCollection<Project>("projects");
  const workerMap = byId(workers.data);
  const projectMap = byId(projects.data);

  const items = equipment.data
    .filter((e) => filter.statuses.includes(e.status))
    .sort((a, b) => (a.neededBy ?? "9999").localeCompare(b.neededBy ?? "9999") || a.createdAt - b.createdAt);
  const inStatus = (s: EquipmentStatus) => equipment.data.filter((e) => e.status === s);
  const toOrderCost = inStatus("APPROVED").reduce((sum, e) => sum + (e.estCost ?? 0) * 1, 0);

  const onCreate = act(
    (fd: FormData) =>
      createEquipment({
        item: str(fd, "item"),
        quantity: Math.max(1, optInt(fd, "quantity") ?? 1),
        link: optUrl(fd, "link"),
        estCost: optNum(fd, "estCost"),
        notes: optStr(fd, "notes"),
        neededBy: optDate(fd, "neededBy"),
        projectId: optStr(fd, "projectId"),
        requesterId: optStr(fd, "requesterId"),
      }),
    "הפריט נוסף לרשימת ההזמנות",
  );
  const onStep = act((id: string, status: EquipmentStatus) => setEquipmentStatus(id, status), "הסטטוס עודכן");
  const onEdit = act(async (fd: FormData) => {
    const status = oneOf(fd, "status", EQUIPMENT_STATUSES);
    if (status) await setEquipmentStatus(str(fd, "id"), status, optStr(fd, "managerNote"));
  }, "הסטטוס עודכן");
  const onDelete = act(async (id: string) => {
    if (!window.confirm("למחוק את הבקשה?")) return;
    await deleteEquipment(id);
    return "הבקשה נמחקה";
  });

  return (
    <>
      <h1>הזמנות ציוד</h1>

      <div className="stats">
        <Stat num={inStatus("PENDING").length} label="ממתין לאישור" alert={inStatus("PENDING").length > 0} />
        <Stat num={inStatus("APPROVED").length} label="אושר – צריך להזמין" />
        <Stat num={money(toOrderCost)} label="עלות משוערת להזמנה" />
        <Stat num={inStatus("ORDERED").length} label="הוזמן, טרם התקבל" />
      </div>

      <details className="card">
        <summary>+ הוספת פריט להזמנה</summary>
        <form action={onCreate} className="stack">
          <div className="fields">
            <label>פריט<input name="item" required /></label>
            <label>כמות<input name="quantity" type="number" min={1} defaultValue={1} /></label>
            <label>עלות משוערת (₪)<input name="estCost" type="number" min={0} step="0.01" /></label>
            <label>נדרש עד<input name="neededBy" type="date" /></label>
            <label>
              עבור עובד/ת
              <select name="requesterId" defaultValue="">
                <option value="">— מנהל —</option>
                {workers.data.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label>
              פרויקט
              <select name="projectId" defaultValue="">
                <option value="">— ללא —</option>
                {projects.data.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
          <Link key={x.key} to={`/admin/equipment?f=${x.key}`} className={`btn sm ${x.key === filter.key ? "" : "ghost"}`}>{x.label}</Link>
        ))}
      </div>

      <section className="card">
        {equipment.loading ? (
          <p className="muted">טוען…</p>
        ) : items.length === 0 ? (
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
                    <td className="nowrap">{e.estCost ? money(e.estCost) : "—"}</td>
                    <td>{(e.requesterId && workerMap.get(e.requesterId)?.name) ?? <span className="muted">מנהל</span>}</td>
                    <td className="muted">{(e.projectId && projectMap.get(e.projectId)?.name) ?? "—"}</td>
                    <td className="nowrap">{formatDate(e.neededBy) || "—"}</td>
                    <td>
                      <Badge value={e.status} label={EQUIPMENT_STATUS[e.status]} />
                      <div className="muted small">
                        {e.status === "ORDERED" && e.orderedAt && `הוזמן ${new Date(e.orderedAt).toLocaleDateString("he-IL")}`}
                        {e.status === "RECEIVED" && e.receivedAt && `התקבל ${new Date(e.receivedAt).toLocaleDateString("he-IL")}`}
                      </div>
                    </td>
                    <td>
                      <div className="row">
                        {(NEXT_STEP[e.status] ?? []).map((step) => (
                          <button key={step.status} className={`btn sm ${step.status === "REJECTED" ? "danger" : ""}`} onClick={() => onStep(e.id, step.status)}>
                            {step.label}
                          </button>
                        ))}
                        <details>
                          <summary className="small">עוד</summary>
                          <form action={onEdit} className="stack" style={{ minWidth: 200 }} key={`${e.status}|${e.managerNote}`}>
                            <input type="hidden" name="id" value={e.id} />
                            <select name="status" defaultValue={e.status}>
                              {Object.entries(EQUIPMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            <input name="managerNote" defaultValue={e.managerNote ?? ""} placeholder="הערת מנהל (גלויה לעובד/ת)" />
                            <SubmitButton className="btn sm">שמירה</SubmitButton>
                          </form>
                          <button className="btn danger sm" style={{ marginTop: ".4rem" }} onClick={() => onDelete(e.id)}>מחיקה</button>
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
