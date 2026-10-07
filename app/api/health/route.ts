import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import { getContext } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/** GET /api/health — liveness + vault accessibility (used by Docker healthcheck). */
export async function GET() {
  try {
    const ctx = await getContext();
    await fs.access(ctx.vault.root, constants.R_OK | constants.W_OK);
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "error", error: "Vault is not accessible" }, { status: 503 });
  }
}
