import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.log("No TURSO_DATABASE_URL found, falling back to local SQLite...");
}

export const db = createClient({
  url: url || "file:data/darisir.db",
  authToken: authToken,
});
