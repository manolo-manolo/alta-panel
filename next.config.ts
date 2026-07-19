import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` uses Node built-ins and must not be bundled by the server compiler.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
