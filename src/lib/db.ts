import "server-only";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error(
      "Turso database URL is required in production. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.",
    );
  }
  console.log("No TURSO_DATABASE_URL found, falling back to local SQLite...");
}

export const db = createClient({
  url: url || "file:data/darisir.db",
  authToken,
});
