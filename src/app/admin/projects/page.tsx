import Link from "next/link";
import { db } from "@/lib/db";
import { dateKey, formatDate } from "@/lib/dates";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createProject, deleteProject, updateProject } from "../actions";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { msg, error } = await searchParams;
  const projects = await db.project.findMany({
    include: { tasks: { select: { status: true } }, _count: { select: { equipment: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });

  return (
    <>
      <h1>פרויקטים</h1>
      <Flash msg={msg} error={error} />

      <details className="card" open={projects.length === 0 || undefined}>
        <summary>+ פרויקט חדש</summary>
        <form action={createProject} className="stack">
          <div className="fields">
            <label>
              שם הפרויקט
              <input name="name" required />
            </label>
            <label>
              תאריך יעד
              <input type="date" name="dueDate" />
            </label>
          </div>
          <label>
            תיאור
            <textarea name="description" />
          </label>
          <div><SubmitButton>יצירת פרויקט</SubmitButton></div>
        </form>
      </details>

      {projects.length === 0 && <p className="empty">עוד אין פרויקטים.</p>}

      <div className="grid grid-2">
        {projects.map((p) => {
          const total = p.tasks.length;
          const doneCount = p.tasks.filter((t) => t.status === "DONE").length;
          const pct = total ? Math.round((doneCount / total) * 100) : 0;
          return (
            <section key={p.id} className="card" style={p.active ? undefined : { opacity: 0.7 }}>
              <div className="spread">
                <h2 style={{ margin: 0 }}>{p.name}</h2>
                {!p.active && <span className="badge gray">בארכיון</span>}
              </div>
              {p.description && <p className="pre muted">{p.description}</p>}
              <div className="small muted">
                {doneCount}/{total} משימות הושלמו{p.dueDate && ` · יעד: ${formatDate(p.dueDate)}`} · {p._count.equipment} בקשות ציוד
              </div>
              <div style={{ background: "var(--gray-bg)", borderRadius: 99, height: 8, margin: ".5rem 0 .75rem" }}>
                <div style={{ width: `${pct}%`, background: "var(--brand)", height: "100%", borderRadius: 99 }} />
              </div>
              <div className="row">
                <Link href={`/admin/tasks?project=${p.id}&status=all`} className="btn secondary sm">למשימות הפרויקט</Link>
              </div>
              <details style={{ marginTop: ".75rem" }}>
                <summary>עריכה</summary>
                <form action={updateProject} className="stack">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="fields">
                    <label>
                      שם
                      <input name="name" required defaultValue={p.name} />
                    </label>
                    <label>
                      תאריך יעד
                      <input type="date" name="dueDate" defaultValue={dateKey(p.dueDate) ?? ""} />
                    </label>
                  </div>
                  <label>
                    תיאור
                    <textarea name="description" defaultValue={p.description ?? ""} />
                  </label>
                  <label className="check">
                    <input type="checkbox" name="active" defaultChecked={p.active} /> פרויקט פעיל
                  </label>
                  <div className="row">
                    <SubmitButton>שמירה</SubmitButton>
                  </div>
                </form>
                <form action={deleteProject} style={{ marginTop: ".5rem" }}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton className="btn danger sm" confirm="למחוק את הפרויקט? המשימות שלו יישארו ללא פרויקט.">
                    מחיקת פרויקט
                  </SubmitButton>
                </form>
              </details>
            </section>
          );
        })}
      </div>
    </>
  );
}
