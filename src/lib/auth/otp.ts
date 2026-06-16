import "server-only";
import { randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { one, run } from "@/lib/db";

const OTP_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 10;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 min lock after max attempts
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_OTP_REQUESTS_PER_HOUR = 3;
const RESEND_COOLDOWN = 60 * 1000; // 60 seconds

type OtpRow = { email: string; codeHash: string; purpose: string; expiresAt: number; attempts: number; createdAt: number };

// Hash the OTP (salted by email) so plaintext codes are never stored.
function hashCode(code: string, email: string): string {
  return scryptSync(code, email, 32).toString("hex");
}

async function checkRateLimit(email: string): Promise<boolean> {
  const oneHourAgo = Date.now() - RATE_LIMIT_WINDOW;
  const count = await one<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM otps WHERE email = ? AND createdAt > ?",
    [email, oneHourAgo],
  );
  return (count?.cnt ?? 0) >= MAX_OTP_REQUESTS_PER_HOUR;
}

export async function createOtp(email: string, purpose: string): Promise<string> {
  const rateLimited = await checkRateLimit(email);
  if (rateLimited) {
    throw new Error("Too many OTP requests. Please try again in 1 hour.");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await run(
    `INSERT INTO otps(email, codeHash, purpose, expiresAt, attempts, createdAt)
     VALUES(?,?,?,?,0,?)
     ON CONFLICT(email) DO UPDATE SET
       codeHash=excluded.codeHash, purpose=excluded.purpose,
       expiresAt=excluded.expiresAt, attempts=0, createdAt=excluded.createdAt`,
    [email, hashCode(code, email), purpose, Date.now() + OTP_TTL, Date.now()],
  );
  return code;
}

export async function getOtpCooldown(email: string): Promise<number> {
  const row = await one<OtpRow>("SELECT * FROM otps WHERE email=?", [email]);
  if (!row) return 0;
  const elapsed = Date.now() - (row.createdAt || 0);
  if (elapsed < RESEND_COOLDOWN) return Math.ceil((RESEND_COOLDOWN - elapsed) / 1000);
  return 0;
}

export async function verifyOtp(
  email: string,
  code: string,
  purpose: string,
): Promise<{ ok: boolean; error?: string; locked?: boolean; remaining?: number }> {
  const row = await one<OtpRow>("SELECT * FROM otps WHERE email=?", [email]);
  if (!row) return { ok: false, error: "No code requested. Please request a new one." };
  if (row.purpose !== purpose) return { ok: false, error: "Invalid code." };
  if (Date.now() > row.expiresAt) {
    await run("DELETE FROM otps WHERE email=?", [email]);
    return { ok: false, error: "Code expired. Please request a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await run("DELETE FROM otps WHERE email=?", [email]);
    return { ok: false, error: "Too many wrong attempts. Account locked for 15 minutes.", locked: true };
  }
  const a = Buffer.from(hashCode(code, email), "hex");
  const b = Buffer.from(row.codeHash, "hex");
  const match = a.length === b.length && timingSafeEqual(a, b);
  if (!match) {
    const newAttempts = row.attempts + 1;
    await run("UPDATE otps SET attempts=? WHERE email=?", [newAttempts, email]);
    const remaining = MAX_ATTEMPTS - newAttempts;
    return { ok: false, error: `Incorrect code. ${remaining} attempt(s) remaining.`, remaining };
  }
  await run("DELETE FROM otps WHERE email=?", [email]);
  return { ok: true };
}
