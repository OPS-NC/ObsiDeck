import { NextResponse } from "next/server";
import { getContext } from "@/lib/server/context";
import { readJson, withErrors } from "@/lib/server/http";
import { renameSchema } from "@/lib/server/schemas";
import { renameEntry } from "@/lib/filesystem/notes";

export const dynamic = "force-dynamic";

/** PUT /api/rename { from, to } — renames or moves a note or folder. */
export const PUT = withErrors(async (req) => {
  const { from, to } = await readJson(req, renameSchema);
  const ctx = await getContext();
  const result = await renameEntry(ctx.vault, from, to);
  ctx.invalidate();
  ctx.search.clear();
  console.log(`[obsideck] renamed "${result.from}" -> "${result.to}"`);
  return NextResponse.json(result);
});
