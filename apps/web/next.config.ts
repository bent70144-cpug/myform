import type { NextConfig } from "next";
import { readWebEnv } from "./src/env";

// Validated at config load: a bad or missing value fails the build/startup
// with every offending key listed, never a partial configuration. The
// value comes through the web allowlist (no credentials can reach here).
const env = readWebEnv();

const nextConfig: NextConfig = {
  // Same-origin proxy: the browser reaches the API through the Next.js
  // server, keeping cookies first-party. Server components call the
  // INTERNAL_API_URL directly instead of going through this rewrite.
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${env.INTERNAL_API_URL}/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        // Creator text and API responses are never cached until an
        // explicit purge story exists (spec guardrail).
        source: "/v1/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
