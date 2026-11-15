import { parseDateInput } from "./dates";

/** Small helpers for reading <form> values. */
export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
};
export const optStr = (fd: FormData, key: string) => str(fd, key) || null;
export const optInt = (fd: FormData, key: string) => {
  const n = Number.parseInt(str(fd, key), 10);
  return Number.isFinite(n) ? n : null;
};
export const optNum = (fd: FormData, key: string) => {
  const n = Number.parseFloat(str(fd, key));
  return Number.isFinite(n) ? n : null;
};
export const optDate = (fd: FormData, key: string) => parseDateInput(fd.get(key));
export const checked = (fd: FormData, key: string) => fd.get(key) === "on";
export function oneOf<T extends string>(fd: FormData, key: string, allowed: readonly T[]): T | null {
  const v = str(fd, key);
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}
/** Only keep http(s) links. */
export const optUrl = (fd: FormData, key: string) => {
  const v = str(fd, key);
  return /^https?:\/\//i.test(v) ? v : null;
};
