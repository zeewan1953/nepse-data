import { createClient } from "@libsql/client";

const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
const url =
  tursoUrl ||
  (process.env.NODE_ENV === "production" || process.env.VERCEL === "1"
    ? undefined
    : "file:data/darisir.db");
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error(
    "Turso database URL is required in production. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.",
  );
}

export const db = createClient({
  url,
  authToken,
});
