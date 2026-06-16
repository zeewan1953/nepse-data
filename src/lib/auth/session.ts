import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { one, run, execute } from "@/lib/db";
import type { User } from "./users";

const COOKIE = "darisir_session";
const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_DEVICES = 3;

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();

  await run("INSERT INTO sessions(token, userId, expiresAt, createdAt) VALUES(?,?,?,?)", [
    token,
    userId,
    now + TTL,
    now,
  ]);

  // Enforce max 3 devices: delete oldest sessions beyond the limit
  const result = await execute(
    "SELECT token FROM sessions WHERE userId=? AND expiresAt > ? ORDER BY createdAt DESC",
    [userId, now],
  );
  const allTokens = result.rows.map((r) => String(r.token));
  if (allTokens.length > MAX_DEVICES) {
    const toDelete = allTokens.slice(MAX_DEVICES);
    for (const t of toDelete) {
      await run("DELETE FROM sessions WHERE token=?", [t]);
    }
  }

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(TTL / 1000),
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const s = await one<{ token: string; userId: string; expiresAt: number }>(
    "SELECT * FROM sessions WHERE token=?",
    [token],
  );
  if (!s || Date.now() > s.expiresAt) {
    if (s) await run("DELETE FROM sessions WHERE token=?", [token]);
    return null;
  }
  const u = await one<User>("SELECT id, email, mobile, name, verified FROM users WHERE id=?", [s.userId]);
  return u ?? null;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await run("DELETE FROM sessions WHERE token=?", [token]);
  jar.delete(COOKIE);
}

/** Returns how many active sessions a user currently has */
export async function getActiveSessionCount(userId: string): Promise<number> {
  const result = await execute(
    "SELECT COUNT(*) as cnt FROM sessions WHERE userId=? AND expiresAt > ?",
    [userId, Date.now()],
  );
  return Number(result.rows[0]?.cnt ?? 0);
}
