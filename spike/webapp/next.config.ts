import type { NextConfig } from "next";
import { readWebEnv } from "./src/env";

// Validated at config load through the same @myform/config web schema the
// real app uses (strict: credential keys cannot be configured even if the
// supervisor allowlist somehow passed one).
const env = readWebEnv();

const nextConfig: NextConfig = {
  // Same-origin proxy under test: browser → Next → internal NestJS API.
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${env.INTERNAL_API_URL}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
