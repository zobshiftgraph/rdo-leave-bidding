import type { Context, Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env, User } from "./types";

const encoder = new TextEncoder();

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User };
};

export async function hashPassword(password: string, salt?: string) {
  const usedSalt = salt ?? crypto.randomUUID();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(usedSalt), iterations: 8000, hash: "SHA-256" },
    key,
    256,
  );
  const hash = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { hash, salt: usedSalt };
}

export async function verifyPassword(password: string, hash: string, salt: string) {
  const next = await hashPassword(password, salt);
  return next.hash === hash;
}

export function randomPassword(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => chars[b % chars.length]).join("");
}

export function sessionCookieOptions(url: URL) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "Lax" as const,
    secure: url.protocol === "https:",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export async function createSession(c: Context<AppEnv>, userId: number) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await c.env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").bind(token, userId, expires).run();
  setCookie(c, "session", token, sessionCookieOptions(new URL(c.req.url)));
}

export async function clearSession(c: Context<AppEnv>) {
  const token = getCookie(c, "session");
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  deleteCookie(c, "session", { path: "/" });
}

const USER_COLUMNS = `id, name, username, email, phone, role, seniority, employee_number, active, must_change_password`;

export async function userFromSession(db: D1Database, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.${USER_COLUMNS}
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1`,
    )
    .bind(token)
    .first<User>();
  return row ?? null;
}

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const user = await userFromSession(c.env.DB, getCookie(c, "session"));
  if (!user) return c.json({ error: "Please log in." }, 401);
  c.set("user", user);
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Admin access required." }, 403);
  await next();
}

export function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    seniority: user.seniority,
    employee_number: user.employee_number,
    must_change_password: Boolean(user.must_change_password),
  };
}
