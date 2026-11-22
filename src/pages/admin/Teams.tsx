import { Link } from "react-router";
import { useCollection } from "@/lib/data";
import { deleteTeam, saveTeam } from "@/lib/actions";
import type { MeetingRequest, Task, Team } from "@/lib/types";
import { optStr, str } from "@/lib/formdata";
import { ActForm } from "@/components/ActForm";
import { SubmitButton } from "@/components/SubmitButton";
import { useAct } from "@/components/Flash";
import { OPEN_TASKS } from "@/lib/queries";

/**
 * Other teams (מעבדה, אחזקה…). Manager only: the work with other teams goes through the manager
 * (equipment orders with the lab, meetings, department tasks). Instructors never see this.
 */
export function TeamsPage() {
  const act = useAct();
  const teams = useCollection<Team>("teams");
  const meetings = useCollection<MeetingRequest>("meetings", { where: ["status", "in", ["OPEN", "SCHEDULED"]] });
  const tasks = useCollection<Task>("tasks", OPEN_TASKS);
  const list = [...teams.data].sort((a, b) => a.name.localeCompare(b.name, "he"));
  const read = (fd: FormData) => ({
    name: str(fd, "name"),
    contactName: optStr(fd, "contactName"),
    contactEmail: optStr(fd, "contactEmail"),
    notes: optStr(fd, "notes"),
  });

  const onCreate = act(async (fd: FormData) => {
    await saveTeam(null, read(fd));
    return `הצוות "${str(fd, "name")}" נוסף`;
  });
  const onUpdate = act((fd: FormData) => saveTeam(str(fd, "id"), read(fd)), "נשמר");
  const onDelete = act(async (t: { id: string; name: string }) => {
    if (!window.confirm(`למחוק את צוות ${t.name}?`)) return;
    await deleteTeam(t.id);
    return "הצוות נמחק";
  });

  return (
    <>
      <h1>צוותים</h1>
      <p className="muted" style={{ marginTop: "-.5rem" }}>
        הצוותים שהמנהל עובד מולם – למשל מעבדה (ציוד) ואחזקה (טיפול טכני ולוגיסטי). רק המנהל רואה אותם.
      </p>

      <details className="card" open={(!teams.loading && list.length === 0) || undefined}>
        <summary>+ צוות חדש</summary>
        <ActForm action={onCreate} className="stack">
          <div className="fields">
            <label>שם הצוות<input name="name" required placeholder="למשל: מעבדה" /></label>
            <label>איש/אשת קשר<input name="contactName" /></label>
            <label>מייל<input name="contactEmail" type="email" dir="ltr" /></label>
          </div>
          <label>הערות<textarea name="notes" placeholder="למשל: מזמינים ציוד עד יום ג׳ לשבוע הבא" /></label>
          <div><SubmitButton>הוספה</SubmitButton></div>
        </ActForm>
      </details>

      <div className="grid grid-2">
        {list.map((t) => {
          const m = meetings.data.filter((x) => x.withTeamId === t.id);
          const k = tasks.data.filter((x) => x.teamId === t.id);
          return (
            <section key={t.id} className="card">
              <h2 style={{ marginBottom: ".2rem" }}>{t.name}</h2>
              <div className="small muted">
                {t.contactName && <>{t.contactName} · </>}
                {t.contactEmail && <a href={`mailto:${t.contactEmail}`} dir="ltr">{t.contactEmail}</a>}
              </div>
              {t.notes && <p className="pre small">{t.notes}</p>}
              <div className="small" style={{ margin: ".5rem 0" }}>
                <Link to="/admin/meetings">{m.length} פגישות פתוחות</Link> · <Link to={`/admin/tasks?team=${t.id}`}>{k.length} משימות פתוחות</Link>
              </div>
              <details>
                <summary className="small">עריכה</summary>
                <ActForm action={onUpdate} keepValues className="stack" key={`${t.name}|${t.contactName}|${t.contactEmail}|${t.notes}`}>
                  <input type="hidden" name="id" value={t.id} />
                  <label>שם<input name="name" required defaultValue={t.name} /></label>
                  <label>איש/אשת קשר<input name="contactName" defaultValue={t.contactName ?? ""} /></label>
                  <label>מייל<input name="contactEmail" type="email" dir="ltr" defaultValue={t.contactEmail ?? ""} /></label>
                  <label>הערות<textarea name="notes" defaultValue={t.notes ?? ""} /></label>
                  <div className="row">
                    <SubmitButton className="btn sm">שמירה</SubmitButton>
                    <button type="button" className="btn danger sm" onClick={() => onDelete(t)}>מחיקה</button>
                  </div>
                </ActForm>
              </details>
            </section>
          );
        })}
      </div>
    </>
  );
}
