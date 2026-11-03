import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Manager access is a single shared password (ADMIN_PASSWORD).
 * After login we store a signed, expiring cookie. Workers never log in.
 */
const COOKIE = "tm_admin";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (at least 16 characters)");
  return s;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  // Compare HMACs so the comparison is constant-time regardless of length.
  return safeEqual(sign(`pw:${input}`), sign(`pw:${expected}`));
}

export async function createAdminSession(): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payload = `admin.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function destroyAdminSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const i = raw.lastIndexOf(".");
  if (i < 0) return false;
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  if (!safeEqual(sig, sign(payload))) return false;
  const exp = Number(payload.split(".")[1]);
  return Number.isFinite(exp) && exp > Date.now() / 1000;
}

/** Call at the top of every manager page and server action. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/login");
}

export function newWorkerToken(): string {
  return randomBytes(18).toString("base64url");
}
