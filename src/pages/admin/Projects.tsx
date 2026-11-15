import { Link } from "react-router";
import { ActForm } from "@/components/ActForm";
import { useCollection } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { deleteProject, saveProject } from "@/lib/actions";
import type { EquipmentRequest, Project, Task } from "@/lib/types";
import { checked, optDate, optStr, str } from "@/lib/formdata";
import { useAct } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export function ProjectsPage() {
  const act = useAct();
  const projects = useCollection<Project>("projects");
  const tasks = useCollection<Task>("tasks");
  const equipment = useCollection<EquipmentRequest>("equipment");
  const list = [...projects.data].sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt - a.createdAt);

  const onCreate = act(async (fd: FormData) => {
    const name = str(fd, "name");
    await saveProject(null, { name, description: optStr(fd, "description"), dueDate: optDate(fd, "dueDate") });
    return `הפרויקט "${name}" נוצר`;
  });
  const onUpdate = act(
    (fd: FormData) =>
      saveProject(str(fd, "id"), {
        name: str(fd, "name"),
        description: optStr(fd, "description"),
        dueDate: optDate(fd, "dueDate"),
        active: checked(fd, "active"),
      }),
    "הפרויקט עודכן",
  );
  const onDelete = act(async (id: string) => {
    if (!window.confirm("למחוק את הפרויקט? המשימות שלו יישארו ללא פרויקט.")) return;
    await deleteProject(id);
    return "הפרויקט נמחק. המשימות שלו נשארו ללא פרויקט.";
  });

  return (
    <>
      <h1>פרויקטים</h1>

      <details className="card" open={(!projects.loading && list.length === 0) || undefined}>
        <summary>+ פרויקט חדש</summary>
        <ActForm action={onCreate} className="stack">
          <div className="fields">
            <label>שם הפרויקט<input name="name" required /></label>
            <label>תאריך יעד<input type="date" name="dueDate" /></label>
          </div>
          <label>תיאור<textarea name="description" /></label>
          <div><SubmitButton>יצירת פרויקט</SubmitButton></div>
        </ActForm>
      </details>

      {!projects.loading && list.length === 0 && <p className="empty">עוד אין פרויקטים.</p>}

      <div className="grid grid-2">
        {list.map((p) => {
          const mine = tasks.data.filter((t) => t.projectId === p.id);
          const doneCount = mine.filter((t) => t.status === "DONE").length;
          const pct = mine.length ? Math.round((doneCount / mine.length) * 100) : 0;
          return (
            <section key={p.id} className="card" style={p.active ? undefined : { opacity: 0.7 }}>
              <div className="spread">
                <h2 style={{ margin: 0 }}>{p.name}</h2>
                {!p.active && <span className="badge gray">בארכיון</span>}
              </div>
              {p.description && <p className="pre muted">{p.description}</p>}
              <div className="small muted">
                {doneCount}/{mine.length} משימות הושלמו{p.dueDate && ` · יעד: ${formatDate(p.dueDate)}`} ·{" "}
                {equipment.data.filter((e) => e.projectId === p.id).length} בקשות ציוד
              </div>
              <div style={{ background: "var(--gray-bg)", borderRadius: 99, height: 8, margin: ".5rem 0 .75rem" }}>
                <div style={{ width: `${pct}%`, background: "var(--brand)", height: "100%", borderRadius: 99 }} />
              </div>
              <div className="row">
                <Link to={`/admin/tasks?project=${p.id}&status=all`} className="btn secondary sm">למשימות הפרויקט</Link>
              </div>
              <details style={{ marginTop: ".75rem" }}>
                <summary>עריכה</summary>
                <ActForm action={onUpdate} className="stack" keepValues>
                  <input type="hidden" name="id" value={p.id} />
                  <div className="fields">
                    <label>שם<input name="name" required defaultValue={p.name} /></label>
                    <label>תאריך יעד<input type="date" name="dueDate" defaultValue={p.dueDate ?? ""} /></label>
                  </div>
                  <label>תיאור<textarea name="description" defaultValue={p.description ?? ""} /></label>
                  <label className="check"><input type="checkbox" name="active" defaultChecked={p.active} /> פרויקט פעיל</label>
                  <div className="row"><SubmitButton>שמירה</SubmitButton></div>
                </ActForm>
                <button className="btn danger sm" style={{ marginTop: ".5rem" }} onClick={() => onDelete(p.id)}>מחיקת פרויקט</button>
              </details>
            </section>
          );
        })}
      </div>
    </>
  );
}
