import { createContext, useCallback, useContext, useState } from "react";
import { UserError } from "@/lib/actions";

/** Success / error message shown at the top of the page (replaces the old ?msg= redirects). */
type FlashMsg = { text: string; error: boolean } | null;
type Ctx = { flash: FlashMsg; show: (text: string, error?: boolean) => void; clear: () => void };

const FlashContext = createContext<Ctx>({ flash: null, show: () => {}, clear: () => {} });

export function FlashProvider({ children }: { children: React.ReactNode }) {
  const [flash, setFlash] = useState<FlashMsg>(null);
  const show = useCallback((text: string, error = false) => {
    setFlash({ text, error });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const clear = useCallback(() => setFlash(null), []);
  return <FlashContext.Provider value={{ flash, show, clear }}>{children}</FlashContext.Provider>;
}

export function FlashBox() {
  const { flash } = useContext(FlashContext);
  if (!flash) return null;
  return <div className={`flash${flash.error ? " error" : ""}`}>{flash.text}</div>;
}

export function errorText(e: unknown): string {
  if (e instanceof UserError) return e.message;
  const code = (e as { code?: string })?.code;
  if (code === "permission-denied") return "אין הרשאה לפעולה הזו. ייתכן שהקישור או ההתחברות כבר לא בתוקף.";
  if (code === "unavailable") return "אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.";
  return `שגיאה: ${e instanceof Error ? e.message : String(e)}`;
}

/**
 * Wraps an action for a <form action> or button: shows `success` (or the returned string) when
 * it works, and a readable error when it fails.
 */
export function useAct() {
  const { show } = useContext(FlashContext);
  return useCallback(
    <A extends unknown[]>(fn: (...args: A) => Promise<string | void | boolean>, success?: string) =>
      async (...args: A) => {
        try {
          const r = await fn(...args);
          const msg = typeof r === "string" ? r : success;
          if (msg) show(msg);
        } catch (e) {
          show(errorText(e), true);
        }
      },
    [show],
  );
}

export function useFlash() {
  return useContext(FlashContext);
}
