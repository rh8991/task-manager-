"use client";

import { useState } from "react";

export function CopyButton({ text, label = "העתקת קישור" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("העתיקו את הקישור:", text);
        }
      }}
    >
      {done ? "הועתק ✓" : label}
    </button>
  );
}
