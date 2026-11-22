import { HashRouter, Route, Routes } from "react-router";
import { FlashProvider } from "@/components/Flash";
import { AdminLayout } from "@/components/AdminLayout";
import { HomeRedirect, OldPersonalLink, StaffLayout } from "@/components/StaffLayout";
import { firebaseConfigured } from "@/lib/firebase";
import { Login, LoginLinkHandler } from "@/pages/Login";
import { InstructorHome } from "@/pages/InstructorHome";
import { TaskView } from "@/pages/TaskView";
import { AllergenCheck, LessonPrint, LessonView, LessonsBoard } from "@/pages/LessonPages";
import { LessonsPage } from "@/pages/admin/Lessons";
import { LessonDetail } from "@/pages/admin/LessonDetail";
import { Overview } from "@/pages/admin/Overview";
import { TasksPage } from "@/pages/admin/Tasks";
import { TaskDetail } from "@/pages/admin/TaskDetail";
import { InstructorsPage } from "@/pages/admin/Instructors";
import { TeamsPage } from "@/pages/admin/Teams";
import { EquipmentPage } from "@/pages/admin/Equipment";
import { MeetingsPage } from "@/pages/admin/Meetings";
import { ReportsPage } from "@/pages/admin/Reports";

/**
 * Hash routes (#/me, #/admin/…) so the static site works on GitHub Pages without server-side
 * routing. Everything needs signing in: the manager (#/admin) or an instructor (#/me).
 */
export function App() {
  if (!firebaseConfigured) {
    return (
      <main className="container" style={{ maxWidth: 560, paddingTop: "4rem" }}>
        <div className="card">
          <h1>המערכת עוד לא מחוברת ל-Firebase</h1>
          <p>חסרים פרטי פרויקט ה-Firebase (משתני VITE_FIREBASE_*). ראו docs/SETUP.md.</p>
        </div>
      </main>
    );
  }
  return (
    <FlashProvider>
      <LoginLinkHandler>
        <HashRouter>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/w/:token" element={<OldPersonalLink />} />
            <Route element={<StaffLayout />}>
              <Route path="/me" element={<InstructorHome />} />
              <Route path="/task/:id" element={<TaskView />} />
              <Route path="/lessons" element={<LessonsBoard />} />
              <Route path="/lesson/:id" element={<LessonView />} />
              <Route path="/allergens" element={<AllergenCheck />} />
            </Route>
            <Route path="/lesson/:id/print" element={<LessonPrint />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Overview />} />
              <Route path="lessons" element={<LessonsPage />} />
              <Route path="lessons/:id" element={<LessonDetail />} />
              <Route path="instructors" element={<InstructorsPage />} />
              <Route path="teams" element={<TeamsPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="tasks/:id" element={<TaskDetail />} />
              <Route path="equipment" element={<EquipmentPage />} />
              <Route path="meetings" element={<MeetingsPage />} />
              <Route path="reports" element={<ReportsPage />} />
            </Route>
            <Route path="*" element={<main className="container"><h1>הדף לא נמצא</h1><a href="#/">לדף הבית</a></main>} />
          </Routes>
        </HashRouter>
      </LoginLinkHandler>
    </FlashProvider>
  );
}
