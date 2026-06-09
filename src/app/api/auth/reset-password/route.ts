import { getUserByEmail, updatePassword, publicUser } from "@/lib/auth/users";
import { verifyOtp } from "@/lib/auth/otp";
import { createSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim();
    const password = String(body.password ?? "");

    if (password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    const res = verifyOtp(email, code, "reset");
    if (!res.ok) return Response.json({ error: res.error }, { status: 400 });

    const user = getUserByEmail(email);
    if (!user) return Response.json({ error: "User not found." }, { status: 404 });

    updatePassword(email, password);
    await createSession(user.id);
    return Response.json({ ok: true, user: publicUser(user) });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Reset failed" }, { status: 500 });
  }
}
