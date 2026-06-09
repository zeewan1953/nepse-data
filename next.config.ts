import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @rumess/nepse-api loads .wasm and .json data files from disk and must not
  // be bundled by Next — keep it external so it runs as a normal Node module.
  serverExternalPackages: ["@rumess/nepse-api", "@libsql/client", "nodemailer"],
  // Pin the workspace root to this app (a stray lockfile in the parent dir
  // otherwise makes Next infer the wrong root).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
