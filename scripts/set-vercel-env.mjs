// scripts/set-vercel-env.mjs — Set Supabase env vars on Vercel
import { execSync } from "node:child_process";
import fs from "node:fs";

const envFile = ".env.local";
if (!fs.existsSync(envFile)) {
  console.error("No .env.local found");
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx < 0) continue;
  env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
}

const vars = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", value: env.NEXT_PUBLIC_SUPABASE_URL, secret: false },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, secret: false },
  { name: "SUPABASE_SERVICE_ROLE_KEY", value: env.SUPABASE_SERVICE_ROLE_KEY, secret: true },
  { name: "JWT_SECRET", value: env.JWT_SECRET, secret: true },
];

for (const v of vars) {
  if (!v.value || v.value.includes("PASTE")) {
    console.log(`⏭️  Skipping ${v.name} (placeholder)`);
    continue;
  }
  console.log(`Setting ${v.name}...`);
  try {
    execSync(`npx vercel env rm ${v.name} production -y 2>NUL`, { stdio: "pipe" });
  } catch {}
  const cmd = `npx vercel env add ${v.name} production${v.secret ? " --secret" : ""}`;
  try {
    execSync(cmd, { input: `${v.value}\nY\n`, stdio: "pipe" });
    console.log(`  ✅ ${v.name} set`);
  } catch (e) {
    console.error(`  ❌ Failed: ${e.message}`);
  }
}

console.log("\n✅ Done! Deploy with: vercel --prod --yes");
