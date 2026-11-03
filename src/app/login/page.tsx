import { redirect } from "next/navigation";
import { checkPassword, createAdminSession, isAdmin } from "@/lib/auth";
import { back } from "@/lib/form";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

async function login(fd: FormData) {
  "use server";
  const pw = fd.get("password");
  if (typeof pw !== "string" || !checkPassword(pw)) back("/login", "סיסמה שגויה", true);
  await createAdminSession();
  redirect("/admin");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdmin()) redirect("/admin");
  const { error } = await searchParams;
  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: "4rem" }}>
      <div className="card">
        <h1>כניסת מנהל</h1>
        <Flash error={error} />
        <form action={login} className="stack">
          <label>
            סיסמה
            <input type="password" name="password" required autoFocus autoComplete="current-password" />
          </label>
          <SubmitButton>כניסה</SubmitButton>
        </form>
        <p className="muted small" style={{ marginBottom: 0 }}>
          עובדים לא צריכים להתחבר – כל עובד מקבל קישור אישי במייל. <a href="/">ללוח המשותף</a>
        </p>
      </div>
    </main>
  );
}
