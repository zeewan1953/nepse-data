export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Safe diagnostic: reports whether Turso env vars are visible to the running
// server — WITHOUT exposing their values.
export async function GET() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  return Response.json({
    tursoUrlSet: Boolean(url),
    tursoUrlPrefix: url ? url.slice(0, 20) : null,
    tursoTokenSet: Boolean(token),
    tursoTokenLength: token ? token.length : 0,
    usingTurso: Boolean(url),
  });
}
