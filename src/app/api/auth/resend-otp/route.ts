import { getUserByEmail } from "@/lib/auth/users";
import { createOtp } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/auth/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const email = String((await req.json()).email ?? "").trim().toLowerCase();
    const user = getUserByEmail(email);
    // Always respond ok (don't reveal whether the email exists).
    if (!user) return Response.json({ ok: true });
    const code = createOtp(email, "verify");
    const { devCode } = await sendOtpEmail(email, code);
    return Response.json({ ok: true, devCode });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Resend failed" }, { status: 500 });
  }
}
