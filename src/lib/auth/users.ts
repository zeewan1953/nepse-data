import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { hashPassword } from "./password";

export type User = {
  id: string;
  email: string;
  mobile: string | null;
  name: string | null;
  verified: number;
};

type UserRow = User & { passwordHash: string; createdAt: string };

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !data) return undefined;
  return {
    id: data.id,
    email: data.email,
    mobile: data.mobile ?? null,
    name: data.name ?? null,
    verified: data.is_active ? 1 : 0,
    passwordHash: data.password_hash,
    createdAt: data.created_at,
  };
}

export async function createUser(input: {
  email: string;
  password: string;
  mobile?: string;
  name?: string;
}): Promise<string> {
  const id = randomBytes(16).toString("hex");
  const { error } = await supabaseAdmin.from("users").insert({
    id,
    email: input.email,
    mobile: input.mobile ?? null,
    name: input.name ?? null,
    password_hash: hashPassword(input.password),
    is_active: false,
  });
  if (error) throw new Error(`Create user failed: ${error.message}`);
  return id;
}

export async function resetUnverifiedUser(input: {
  email: string;
  password: string;
  mobile?: string;
  name?: string;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("users")
    .update({
      password_hash: hashPassword(input.password),
      mobile: input.mobile ?? null,
      name: input.name ?? null,
    })
    .eq("email", input.email)
    .eq("is_active", false);
  if (error) throw new Error(`Reset user failed: ${error.message}`);
}

export async function markVerified(email: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ is_active: true })
    .eq("email", email);
  if (error) throw new Error(`Mark verified failed: ${error.message}`);
}

export async function updatePassword(email: string, newPassword: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ password_hash: hashPassword(newPassword), is_active: true })
    .eq("email", email);
  if (error) throw new Error(`Update password failed: ${error.message}`);
}

export function publicUser(u: UserRow | User): User {
  return { id: u.id, email: u.email, mobile: u.mobile, name: u.name, verified: u.verified };
}
