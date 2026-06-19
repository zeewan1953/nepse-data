import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

export async function POST(req: NextRequest) {
  try {
    const { credential } = await req.json();
    if (!credential) return NextResponse.json({ ok: false, error: "Missing credential" }, { status: 400 });

    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });

    const { email, name, picture, sub: googleId } = payload;
    if (!email) return NextResponse.json({ ok: false, error: "Email not available" }, { status: 401 });

    // Return user info (client stores in localStorage)
    return NextResponse.json({
      ok: true,
      user: {
        name: name ?? email.split("@")[0],
        email,
        picture: picture ?? null,
        googleId,
        loggedInAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error("Google auth error:", err.message);
    return NextResponse.json(
      { ok: false, error: "Google verification failed: " + (err.message ?? "Unknown error") },
      { status: 401 }
    );
  }
}
