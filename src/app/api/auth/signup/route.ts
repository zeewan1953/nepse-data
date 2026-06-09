import { getUserByEmail, createUser, resetUnverifiedUser } from "@/lib/auth/users";
import { createOtp } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/auth/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const mobile = body.mobile ? String(body.mobile).trim() : undefined;
    const name = body.name ? String(body.name).trim() : undefined;

    if (!EMAIL_RE.test(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
    if (password.length < 8) return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });

    const existing = await getUserByEmail(email);
    if (existing?.verified) {
      return Response.json({ error: "This email is already registered. Please log in." }, { status: 409 });
    }
    if (existing) await resetUnverifiedUser({ email, password, mobile, name });
    else await createUser({ email, password, mobile, name });

    const code = await createOtp(email, "verify");
    const { devCode } = await sendOtpEmail(email, code);
    return Response.json({ needOtp: true, email, devCode });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Signup failed" }, { status: 500 });
  }
}
