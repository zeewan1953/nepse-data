import { getUserByEmail, createUser, publicUser } from "@/lib/auth/users";
import { createSession } from "@/lib/auth/session";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Google JWT Verification (no external library) ──────────────────────────

interface GooglePayload {
  iss: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  aud: string;
  exp: number;
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str + "===".slice((str.length + 3) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64urlDecodeStr(str: string): string {
  return new TextDecoder().decode(base64urlDecode(str));
}

async function verifyGoogleJwt(token: string): Promise<GooglePayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(base64urlDecodeStr(parts[0]));
    const payload = JSON.parse(base64urlDecodeStr(parts[1])) as GooglePayload;

    // Check issuer
    if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) {
      return null;
    }

    // Check expiry
    if (payload.exp * 1000 < Date.now()) return null;

    // Check client ID audience
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && payload.aud !== clientId) return null;

    // Fetch Google's public keys
    const keysRes = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    const { keys } = await keysRes.json();

    // Find matching key
    const jwk = keys.find((k: any) => k.kid === header.kid);
    if (!jwk) return null;

    // Verify signature using Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const signature = base64urlDecode(parts[2]);
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature.buffer as ArrayBuffer,
      data,
    );

    if (!valid) return null;
    if (!payload.email_verified) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── API Handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const credential = String(body.credential ?? "");

    if (!credential) {
      return Response.json({ error: "Missing Google credential." }, { status: 400 });
    }

    // Verify the Google JWT
    const googleUser = await verifyGoogleJwt(credential);
    if (!googleUser) {
      return Response.json({ error: "Invalid Google credential." }, { status: 401 });
    }

    const email = googleUser.email.trim().toLowerCase();
    const name = googleUser.name || email.split("@")[0];

    // Find or create user
    let user = await getUserByEmail(email);
    if (!user) {
      // Create user with a random password (Google users don't need passwords)
      const randomPass = randomBytes(16).toString("hex");
      await createUser({ email, password: randomPass, name });
      user = await getUserByEmail(email);
    }

    if (!user) {
      return Response.json({ error: "Failed to create account." }, { status: 500 });
    }

    // Create session (3-device limit enforced automatically)
    await createSession(user.id);
    return Response.json({ ok: true, user: publicUser(user) });
  } catch (e) {
    return Response.json({ error: (e as Error)?.message ?? "Google login failed" }, { status: 500 });
  }
}
