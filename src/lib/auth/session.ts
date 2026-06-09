import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import type { User } from "./users";

const COOKIE = "darisir_session";
const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  getDb()
    .prepare("INSERT INTO sessions(token, userId, expiresAt) VALUES(?,?,?)")
    .run(token, userId, Date.now() + TTL);
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
  const db = getDb();
  const s = db.prepare("SELECT * FROM sessions WHERE token=?").get(token) as
    | { token: string; userId: string; expiresAt: number }
    | undefined;
  if (!s || Date.now() > s.expiresAt) {
    if (s) db.prepare("DELETE FROM sessions WHERE token=?").run(token);
    return null;
  }
  const u = db
    .prepare("SELECT id, email, mobile, name, verified FROM users WHERE id=?")
    .get(s.userId) as User | undefined;
  return u ?? null;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token=?").run(token);
  jar.delete(COOKIE);
}
