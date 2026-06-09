import "server-only";
import { randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { one, run } from "@/lib/db";

const OTP_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

type OtpRow = { email: string; codeHash: string; purpose: string; expiresAt: number; attempts: number };

// Hash the OTP (salted by email) so plaintext codes are never stored.
function hashCode(code: string, email: string): string {
  return scryptSync(code, email, 32).toString("hex");
}

export async function createOtp(email: string, purpose: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await run(
    `INSERT INTO otps(email, codeHash, purpose, expiresAt, attempts)
     VALUES(?,?,?,?,0)
     ON CONFLICT(email) DO UPDATE SET
       codeHash=excluded.codeHash, purpose=excluded.purpose,
       expiresAt=excluded.expiresAt, attempts=0`,
    [email, hashCode(code, email), purpose, Date.now() + OTP_TTL],
  );
  return code;
}

export async function verifyOtp(
  email: string,
  code: string,
  purpose: string,
): Promise<{ ok: boolean; error?: string }> {
  const row = await one<OtpRow>("SELECT * FROM otps WHERE email=?", [email]);
  if (!row) return { ok: false, error: "No code requested. Please request a new one." };
  if (row.purpose !== purpose) return { ok: false, error: "Invalid code." };
  if (Date.now() > row.expiresAt) {
    await run("DELETE FROM otps WHERE email=?", [email]);
    return { ok: false, error: "Code expired. Please request a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await run("DELETE FROM otps WHERE email=?", [email]);
    return { ok: false, error: "Too many attempts. Please request a new code." };
  }
  const a = Buffer.from(hashCode(code, email), "hex");
  const b = Buffer.from(row.codeHash, "hex");
  const match = a.length === b.length && timingSafeEqual(a, b);
  if (!match) {
    await run("UPDATE otps SET attempts=attempts+1 WHERE email=?", [email]);
    return { ok: false, error: "Incorrect code." };
  }
  await run("DELETE FROM otps WHERE email=?", [email]);
  return { ok: true };
}
