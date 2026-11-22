import { Link, Navigate } from "react-router";
import { byId, useCollection, useDocument, useSession } from "@/lib/data";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { groupTasks, type ReportTask } from "@/lib/report";
import { TASK_STATUSES, type Lesson, type Task, type Worker } from "@/lib/types";
import { oneOf, optStr, str } from "@/lib/formdata";
import { updateMyTask } from "@/lib/workerActions";
import { UserError } from "@/lib/actions";
import { Badge, Options } from "@/components/ui";
import { useAct } from "@/components/Flash";
import { ActForm } from "@/components/ActForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ReviewList } from "@/components/Reviews";
import { MyLessons } from "@/components/MyLessons";

/** #/me – the signed-in instructor's page: their lessons and their tasks. */
export function InstructorHome() {
  const s = useSession();
  const me = useDocument<Worker>(s.workerId ? `workers/${s.workerId}` : null);
  if (s.role === "admin") return <Navigate to="/admin" replace />;
  if (!s.workerId) return null;
  const who = { workerId: s.workerId, workerName: me.data?.name ?? "" };
  return (
    <>
      <MyLessons who={who} />
      <MyTasks who={who} />
    </>
  );
}

function MyTasks({ who }: { who: { workerId: string; workerName: string } }) {
  const act = useAct();
  const tasks = useCollection<Task>("tasks", { where: [["assigneeId", "==", who.workerId], ["status", "in", ["TODO", "IN_PROGRESS", "BLOCKED"]]] });
  const done = useCollection<Task>("tasks", {
    where: [["assigneeId", "==", who.workerId], ["status", "==", "DONE"]],
    orderBy: ["completedAt", "desc"],
    limit: 5,
  });
  const lessons = useCollection<Lesson>("lessons");
  const lessonMap = byId(lessons.data);
  const taskMap = byId(tasks.data);

  const groups = groupTasks(
    tasks.data.map<ReportTask>((t) => ({
      id: t.id,
      title: t.title,
      projectName: t.lessonId ? (lessonMap.get(t.lessonId)?.title ?? null) : null,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
    })),
    todayLocal(),
  );
  const sections: [string, ReportTask[], boolean][] = [
    ["באיחור", groups.overdue, true],
    ["להיום", groups.dueToday, false],
    ["השבוע הקרוב", groups.thisWeek, false],
    ["בהמשך", groups.later, false],
    ["ללא תאריך יעד", groups.noDate, false],
  ];

  const onUpdate = act(async (fd: FormData) => {
    const task = taskMap.get(str(fd, "taskId"));
    const status = oneOf(fd, "status", TASK_STATUSES);
    if (!task || !status) throw new UserError("המשימה לא נמצאה");
    const changed = await updateMyTask(who, task, status, optStr(fd, "comment"));
    if (!changed) return "לא בוצע שינוי";
    return status === "DONE" && status !== task.status ? "כל הכבוד! המשימה סומנה כהושלמה" : "העדכון נשמר";
  });

  return (
    <section style={{ marginTop: "1.5rem" }}>
      <h2>המשימות שלי ({tasks.data.length})</h2>
      {tasks.loading && <p className="muted">טוען…</p>}
      {!tasks.loading && tasks.data.length === 0 && <div className="card empty">אין לך משימות פתוחות כרגע.</div>}
      {sections.map(([title, list, late]) =>
        list.length ? (
          <div key={title} style={{ marginBottom: "1rem" }}>
            <h3 className={late ? "danger-text" : ""}>{title} ({list.length})</h3>
            <div className="task-list">
              {list.map((rt) => {
                const t = taskMap.get(rt.id)!;
                return (
                  <div key={t.id} className={`task-item${late ? " overdue" : ""}`}>
                    <div className="spread">
                      <Link to={`/task/${t.id}`} className="task-link"><strong>{t.title}</strong></Link>
                      <div className="row">
                        <Badge value={t.priority} label={`עדיפות ${PRIORITY[t.priority]}`} />
                        <Badge value={t.status} label={TASK_STATUS[t.status]} />
                      </div>
                    </div>
                    <div className="muted small">
                      {rt.projectName && <>מערך: <Link to={`/lesson/${t.lessonId}`}>{rt.projectName}</Link> · </>}
                      תאריך יעד: {t.dueDate ? formatDate(t.dueDate) : "לא נקבע"}
                    </div>
                    {t.description && <p className="pre" style={{ margin: ".4rem 0" }}>{t.description}</p>}
                    <ReviewList reviews={t.reviews} compact />
                    {t.lastComment && <div className="muted small">עדכון אחרון: “{t.lastComment}” ({formatDateTime(t.updatedAt)})</div>}
                    <ActForm action={onUpdate} className="row" style={{ marginTop: ".5rem" }}>
                      <input type="hidden" name="taskId" value={t.id} />
                      <select name="status" defaultValue={t.status} style={{ width: "auto" }} aria-label="סטטוס">
                        <Options map={TASK_STATUS} />
                      </select>
                      <input name="comment" maxLength={1000} placeholder="הערה (לא חובה)" style={{ flex: 1, minWidth: 160 }} />
                      <SubmitButton className="btn sm">עדכון</SubmitButton>
                    </ActForm>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null,
      )}
      {done.data.length > 0 && (
        <details className="card">
          <summary>הושלמו לאחרונה ({done.data.length})</summary>
          <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
            {done.data.map((t) => <li key={t.id}>{t.title} <span className="muted small">· {formatDateTime(t.completedAt)}</span></li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
