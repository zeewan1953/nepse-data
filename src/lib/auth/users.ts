import "server-only";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { hashPassword } from "./password";

export type User = {
  id: string;
  email: string;
  mobile: string | null;
  name: string | null;
  verified: number;
};

type UserRow = User & { passwordHash: string; createdAt: number };

export function getUserByEmail(email: string): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE email=?").get(email) as UserRow | undefined;
}

export function createUser(input: {
  email: string;
  password: string;
  mobile?: string;
  name?: string;
}): string {
  const id = randomBytes(12).toString("hex");
  getDb()
    .prepare(
      `INSERT INTO users(id, email, mobile, name, passwordHash, verified, createdAt)
       VALUES(?,?,?,?,?,0,?)`,
    )
    .run(id, input.email, input.mobile ?? null, input.name ?? null, hashPassword(input.password), Date.now());
  return id;
}

// Replace the password/profile of an existing unverified user (re-signup).
export function resetUnverifiedUser(input: {
  email: string;
  password: string;
  mobile?: string;
  name?: string;
}): void {
  getDb()
    .prepare("UPDATE users SET passwordHash=?, mobile=?, name=? WHERE email=? AND verified=0")
    .run(hashPassword(input.password), input.mobile ?? null, input.name ?? null, input.email);
}

export function markVerified(email: string): void {
  getDb().prepare("UPDATE users SET verified=1 WHERE email=?").run(email);
}

// Reset a user's password (after OTP verification) and mark them verified.
export function updatePassword(email: string, newPassword: string): void {
  getDb()
    .prepare("UPDATE users SET passwordHash=?, verified=1 WHERE email=?")
    .run(hashPassword(newPassword), email);
}

export function publicUser(u: UserRow | User): User {
  return { id: u.id, email: u.email, mobile: u.mobile, name: u.name, verified: u.verified };
}
