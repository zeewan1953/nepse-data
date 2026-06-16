import { NextResponse } from "next/server";
import { getUserByEmail, createUser, publicUser } from "@/lib/auth/users";
import { createSession } from "@/lib/auth/session";
import { randomBytes } from "node:crypto";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const EXPECTED_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

interface GooglePayload {
  email: string;
  name?: string;
  picture?: string;
  sub: string;
  aud: string;
  iss: string;
  exp: number;
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function verifyGoogleJwt(token: string): Promise<GooglePayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as GooglePayload;

    if (!EXPECTED_ISSUERS.includes(payload.iss)) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (clientId && payload.aud !== clientId) return null;

    const certsRes = await fetch(GOOGLE_CERTS_URL);
    const certs = await certsRes.json();
    const jwk = (certs.keys as any[]).find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const cryptoKey = await crypto.subtle.importKey(
      "jwk", jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false, ["verify"]
    );

    const signature = base64UrlDecode(parts[2]);
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", cryptoKey,
      signature.buffer as ArrayBuffer, data
    );

    return valid ? payload : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idToken = url.searchParams.get("id_token");

  if (!idToken) {
    return NextResponse.redirect(new URL("/login?error=missing_token", req.url));
  }

  const payload = await verifyGoogleJwt(idToken);
  if (!payload || !payload.email) {
    return NextResponse.redirect(new URL("/login?error=invalid_token", req.url));
  }

  let user = await getUserByEmail(payload.email);
  if (!user) {
    await createUser({
      email: payload.email,
      password: randomBytes(16).toString("hex"),
      name: payload.name || "",
      mobile: "",
    });
    user = await getUserByEmail(payload.email);
  }

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=user_create_failed", req.url));
  }

  await createSession(user.id);
  return NextResponse.redirect(new URL("/", req.url));
}
