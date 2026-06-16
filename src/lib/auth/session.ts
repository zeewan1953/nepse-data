import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import type { User } from "./users";

const COOKIE = "darisir_session";
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();

  const { error } = await supabaseAdmin.from("sessions").insert({
    token,
    user_id: userId,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`Create session failed: ${error.message}`);

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  // Find valid session
  const { data: session, error: sessionErr } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("token", token)
    .single();

  if (sessionErr || !session) return null;

  // Check expiry
  if (new Date(session.expires_at) < new Date()) {
    // Expired — clean up
    await supabaseAdmin.from("sessions").delete().eq("token", token);
    return null;
  }

  // Fetch user
  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("id, email, mobile, name, is_active")
    .eq("id", session.user_id)
    .single();

  if (userErr || !user) return null;

  return {
    id: user.id,
    email: user.email,
    mobile: user.mobile ?? null,
    name: user.name ?? null,
    verified: user.is_active ? 1 : 0,
  };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await supabaseAdmin.from("sessions").delete().eq("token", token);
  }
  jar.delete(COOKIE);
}
