import { redirect } from "next/navigation";

/** Small helpers for reading FormData in server actions. */

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}

export function optInt(fd: FormData, key: string): number | null {
  const n = Number.parseInt(str(fd, key), 10);
  return Number.isFinite(n) ? n : null;
}

export function oneOf<T extends string>(fd: FormData, key: string, allowed: Record<T, unknown>): T | null {
  const v = str(fd, key);
  return v in allowed ? (v as T) : null;
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Redirect back with a message shown at the top of the page. */
export function back(path: string, msg: string, isError = false): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${isError ? "error" : "msg"}=${encodeURIComponent(msg)}`);
}

/** Only allow redirecting to local paths (from a hidden "back" field). */
export function safePath(v: string, fallback: string): string {
  return v.startsWith("/") && !v.startsWith("//") ? v.split("?")[0] : fallback;
}
