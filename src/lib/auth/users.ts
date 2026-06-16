import "server-only";
import { randomBytes } from "node:crypto";
import { one, run } from "@/lib/db";
import { hashPassword } from "./password";

export type User = {
  id: string;
  email: string;
  mobile: string | null;
  name: string | null;
  verified: number;
};

type UserRow = User & { passwordHash: string; createdAt: number };

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  return one<UserRow>("SELECT * FROM users WHERE email=?", [email]);
}

export async function createUser(input: {
  email: string;
  password: string;
  mobile?: string;
  name?: string;
}): Promise<string> {
  const id = randomBytes(12).toString("hex");
  await run(
    `INSERT INTO users(id, email, mobile, name, passwordHash, verified, createdAt)
     VALUES(?,?,?,?,?,1,?)`,
    [id, input.email, input.mobile ?? null, input.name ?? null, hashPassword(input.password), Date.now()],
  );
  return id;
}

export async function resetUnverifiedUser(input: {
  email: string;
  password: string;
  mobile?: string;
  name?: string;
}): Promise<void> {
  await run("UPDATE users SET passwordHash=?, mobile=?, name=? WHERE email=? AND verified=0", [
    hashPassword(input.password),
    input.mobile ?? null,
    input.name ?? null,
    input.email,
  ]);
}

export async function markVerified(email: string): Promise<void> {
  await run("UPDATE users SET verified=1 WHERE email=?", [email]);
}

export async function updatePassword(email: string, newPassword: string): Promise<void> {
  await run("UPDATE users SET passwordHash=?, verified=1 WHERE email=?", [hashPassword(newPassword), email]);
}

export function publicUser(u: UserRow | User): User {
  return { id: u.id, email: u.email, mobile: u.mobile, name: u.name, verified: u.verified };
}
