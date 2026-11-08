import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  agentRules: false,
  logging: { incomingRequests: false },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  distDir: process.env.AEGIS_NEXT_DIST_DIR ?? ".next",
};
export default nextConfig;
