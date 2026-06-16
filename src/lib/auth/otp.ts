import "server-only";
import { randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";

const OTP_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 10;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 min lock after max attempts
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_OTP_REQUESTS_PER_HOUR = 3;
const RESEND_COOLDOWN = 60 * 1000; // 60 seconds

type OtpRow = {
  email: string;
  code_hash: string;
  purpose: string;
  expires_at: string;
  attempts: number;
  created_at: string;
};

// Hash the OTP (salted by email) so plaintext codes are never stored.
function hashCode(code: string, email: string): string {
  return scryptSync(code, email, 32).toString("hex");
}

/** Check if email has exceeded OTP requests in the last hour */
async function checkRateLimit(email: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();
  const { count } = await supabaseAdmin
    .from("otp_tokens")
    .select("*", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", oneHourAgo);
  return (count ?? 0) >= MAX_OTP_REQUESTS_PER_HOUR;
}

export async function createOtp(email: string, purpose: string): Promise<string> {
  const rateLimited = await checkRateLimit(email);
  if (rateLimited) {
    throw new Error("Too many OTP requests. Please try again in 1 hour.");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + OTP_TTL).toISOString();

  // Delete existing OTPs for this email
  await supabaseAdmin.from("otp_tokens").delete().eq("email", email);

  // Insert new OTP
  const { error } = await supabaseAdmin.from("otp_tokens").insert({
    email,
    code_hash: hashCode(code, email),
    purpose,
    expires_at: expiresAt,
    attempts: 0,
  });
  if (error) throw new Error(`Create OTP failed: ${error.message}`);

  return code;
}

export async function getOtpCooldown(email: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("otp_tokens")
    .select("created_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return 0;
  const createdAt = new Date(data.created_at).getTime();
  const elapsed = Date.now() - createdAt;
  if (elapsed < RESEND_COOLDOWN) return Math.ceil((RESEND_COOLDOWN - elapsed) / 1000);
  return 0;
}

export async function verifyOtp(
  email: string,
  code: string,
  purpose: string,
): Promise<{ ok: boolean; error?: string; locked?: boolean; remaining?: number }> {
  const { data: row, error } = await supabaseAdmin
    .from("otp_tokens")
    .select("*")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !row) return { ok: false, error: "No code requested. Please request a new one." };

  if (row.purpose !== purpose) return { ok: false, error: "Invalid code." };

  if (new Date(row.expires_at) < new Date()) {
    await supabaseAdmin.from("otp_tokens").delete().eq("id", row.id);
    return { ok: false, error: "Code expired. Please request a new one." };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await supabaseAdmin.from("otp_tokens").delete().eq("id", row.id);
    return { ok: false, error: "Too many wrong attempts. Account locked for 15 minutes.", locked: true };
  }

  // Verify hash
  const a = Buffer.from(hashCode(code, email), "hex");
  const b = Buffer.from(row.code_hash, "hex");
  const match = a.length === b.length && timingSafeEqual(a, b);

  if (!match) {
    const newAttempts = row.attempts + 1;
    await supabaseAdmin.from("otp_tokens").update({ attempts: newAttempts }).eq("id", row.id);
    const remaining = MAX_ATTEMPTS - newAttempts;
    return { ok: false, error: `Incorrect code. ${remaining} attempt(s) remaining.`, remaining };
  }

  // Success — delete OTP
  await supabaseAdmin.from("otp_tokens").delete().eq("id", row.id);
  return { ok: true };
}
