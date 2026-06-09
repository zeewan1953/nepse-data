import { getUserByEmail } from "@/lib/auth/users";
import { createOtp } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/auth/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const email = String((await req.json()).email ?? "").trim().toLowerCase();
    const user = await getUserByEmail(email);
    if (!user) {
      return Response.json(
        { error: "No account found with this email. Please sign up first." },
        { status: 404 },
      );
    }
    const code = await createOtp(email, "reset");
    const { devCode } = await sendOtpEmail(email, code);
    return Response.json({ needReset: true, email, devCode });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Request failed" }, { status: 500 });
  }
}
