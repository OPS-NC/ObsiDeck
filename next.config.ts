import { execSync } from "node:child_process";
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

// Shown in the sidebar footer. CI passes both as Docker build args; local builds read git.
function gitCommit(): string {
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const buildVersion = process.env.OBSIDECK_BUILD_VERSION || "dev";
const buildCommit = (process.env.OBSIDECK_BUILD_COMMIT || gitCommit()).slice(0, 7);

const nextConfig: NextConfig = {
  basePath,
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
    NEXT_PUBLIC_BUILD_COMMIT: buildCommit,
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
