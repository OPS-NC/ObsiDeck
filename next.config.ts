import type { NextConfig } from "next";

// basePath is inlined into the client bundles at build time: changing
// OBSIDECK_BASE_PATH requires a rebuild (see Dockerfile build arg).
function normalizeBasePath(raw: string | undefined): string {
  const value = (raw ?? "/obsideck").trim();
  if (value === "" || value === "/") return "";
  if (!/^\/[A-Za-z0-9._~\-/]+$/.test(value)) {
    throw new Error(`Invalid OBSIDECK_BASE_PATH: ${value}`);
  }
  return value.replace(/\/+$/, "");
}

const basePath = normalizeBasePath(process.env.OBSIDECK_BASE_PATH);

const nextConfig: NextConfig = {
  basePath,
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
