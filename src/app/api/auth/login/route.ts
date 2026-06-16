import { getUserByEmail, publicUser } from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/password";
import { createOtp } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/auth/mailer";
import { createSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    const user = await getUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // Unverified account: send a fresh OTP and ask the client to verify.
    if (!user.verified) {
      const code = await createOtp(email, "verify");
      await sendOtpEmail(email, code);
      return Response.json({ needOtp: true, email });
    }

    await createSession(user.id);
    return Response.json({ ok: true, user: publicUser(user) });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Login failed" }, { status: 500 });
  }
}
