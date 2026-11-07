import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  // WASM mp3 decoder used server-side for voice metrics; load it from node_modules instead of bundling.
  serverExternalPackages: ["mpg123-decoder"],
  // Allow embedding the /embed pages in an iframe (e.g. a Dynamics 365 web resource).
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
