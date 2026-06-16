import { getUserByEmail } from "@/lib/auth/users";
import { createOtp, getOtpCooldown } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/auth/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();

    // Check cooldown
    const cooldown = await getOtpCooldown(email);
    if (cooldown > 0) {
      return Response.json({ ok: true, cooldown });
    }

    const user = await getUserByEmail(email);
    // Always respond ok (don't reveal whether the email exists).
    if (!user) return Response.json({ ok: true });
    const code = await createOtp(email, "verify");
    await sendOtpEmail(email, code);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Resend failed" }, { status: 500 });
  }
}
