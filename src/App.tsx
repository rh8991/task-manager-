import { HashRouter, Route, Routes } from "react-router";
import { FlashProvider } from "@/components/Flash";
import { AdminLayout } from "@/components/AdminLayout";
import { firebaseConfigured } from "@/lib/firebase";
import { Dashboard } from "@/pages/Dashboard";
import { Login } from "@/pages/Login";
import { WorkerPage } from "@/pages/WorkerPage";
import { TaskView } from "@/pages/TaskView";
import { AllergenCheck, LessonPrint, LessonView, LessonsBoard } from "@/pages/LessonPages";
import { LessonsPage } from "@/pages/admin/Lessons";
import { LessonDetail } from "@/pages/admin/LessonDetail";
import { Overview } from "@/pages/admin/Overview";
import { TasksPage } from "@/pages/admin/Tasks";
import { TaskDetail } from "@/pages/admin/TaskDetail";
import { ProjectsPage } from "@/pages/admin/Projects";
import { WorkersPage } from "@/pages/admin/Workers";
import { EquipmentPage } from "@/pages/admin/Equipment";
import { MeetingsPage } from "@/pages/admin/Meetings";
import { ReportsPage } from "@/pages/admin/Reports";

/**
 * Hash routes (#/admin, #/w/<token>) so the static site works on GitHub Pages without
 * server-side routing, and the personal token in the URL is never sent to any server.
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
      <HashRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/w/:token" element={<WorkerPage />} />
          <Route path="/task/:id" element={<TaskView />} />
          <Route path="/lessons" element={<LessonsBoard />} />
          <Route path="/lesson/:id" element={<LessonView />} />
          <Route path="/lesson/:id/print" element={<LessonPrint />} />
          <Route path="/allergens" element={<AllergenCheck />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Overview />} />
            <Route path="lessons" element={<LessonsPage />} />
            <Route path="lessons/:id" element={<LessonDetail />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="tasks/:id" element={<TaskDetail />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="workers" element={<WorkersPage />} />
            <Route path="equipment" element={<EquipmentPage />} />
            <Route path="meetings" element={<MeetingsPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>
          <Route path="*" element={<main className="container"><h1>הדף לא נמצא</h1><a href="#/">ללוח המשותף</a></main>} />
        </Routes>
      </HashRouter>
    </FlashProvider>
  );
}
