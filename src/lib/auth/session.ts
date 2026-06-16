import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { one, run } from "@/lib/db";
import type { User } from "./users";

const COOKIE = "darisir_session";
const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await run("INSERT INTO sessions(token, userId, expiresAt) VALUES(?,?,?)", [
    token,
    userId,
    Date.now() + TTL,
  ]);
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
