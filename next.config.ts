import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @rumess/nepse-api loads .wasm and .json data files from disk and must not
  // be bundled by Next — keep it external so it runs as a normal Node module.
  serverExternalPackages: ["@rumess/nepse-api", "@libsql/client", "nodemailer"],
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
