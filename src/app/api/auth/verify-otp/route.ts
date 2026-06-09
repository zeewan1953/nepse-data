import { getUserByEmail, markVerified, publicUser } from "@/lib/auth/users";
import { verifyOtp } from "@/lib/auth/otp";
import { createSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim();

    const res = await verifyOtp(email, code, "verify");
    if (!res.ok) return Response.json({ error: res.error }, { status: 400 });

    await markVerified(email);
    const user = await getUserByEmail(email);
    if (!user) return Response.json({ error: "User not found." }, { status: 404 });

    await createSession(user.id);
    return Response.json({ ok: true, user: publicUser(user) });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Verification failed" }, { status: 500 });
  }
}
