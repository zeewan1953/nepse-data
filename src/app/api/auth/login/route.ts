import { getUserByEmail, markVerified, publicUser } from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/password";
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

    // Auto-verify on login (in case of legacy unverified accounts)
    if (!user.verified) await markVerified(email);

    await createSession(user.id);
    return Response.json({ ok: true, user: publicUser(user) });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Login failed" }, { status: 500 });
  }
}
