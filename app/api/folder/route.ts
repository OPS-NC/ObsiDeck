import { NextResponse } from "next/server";
import { getContext } from "@/lib/server/context";
import { assertSameOrigin, queryParam, readJson, withErrors } from "@/lib/server/http";
import { createFolderSchema } from "@/lib/server/schemas";
import { createFolder, trashEntry } from "@/lib/filesystem/notes";

export const dynamic = "force-dynamic";

/** POST /api/folder { path } — creates a folder (parent must exist). */
export const POST = withErrors(async (req) => {
  const { path } = await readJson(req, createFolderSchema);
  const ctx = await getContext();
  const created = await createFolder(ctx.vault, path);
  ctx.invalidate();
  console.log(`[obsideck] created folder "${created.path}"`);
  return NextResponse.json(created, { status: 201 });
});

/** DELETE /api/folder?path=… — moves a folder and its content to .trash. */
export const DELETE = withErrors(async (req) => {
  assertSameOrigin(req);
  const ctx = await getContext();
  await ctx.vault.resolveExisting(queryParam(req, "path"), "directory");
  const result = await trashEntry(ctx.vault, queryParam(req, "path"));
  ctx.invalidate();
  ctx.search.clear();
  console.log(`[obsideck] trashed folder "${result.path}"`);
  return NextResponse.json(result);
});
