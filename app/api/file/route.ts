import { NextResponse } from "next/server";
import { getContext } from "@/lib/server/context";
import { assertSameOrigin, noStore, queryParam, readJson, withErrors } from "@/lib/server/http";
import { createNoteSchema, saveNoteSchema } from "@/lib/server/schemas";
import { createNote, readNote, trashEntry, writeNote } from "@/lib/filesystem/notes";

export const dynamic = "force-dynamic";

/** GET /api/file?path=Folder/Note.md — reads a note. */
export const GET = withErrors(async (req) => {
  const ctx = await getContext();
  const note = await readNote(ctx.vault, queryParam(req, "path"));
  return NextResponse.json(note, { headers: noStore });
});

/** POST /api/file { path, content? } — creates a new note (fails if it exists). */
export const POST = withErrors(async (req) => {
  const { path, content } = await readJson(req, createNoteSchema);
  const ctx = await getContext();
  const created = await createNote(ctx.vault, path, content ?? "");
  ctx.invalidate();
  console.log(`[obsideck] created note "${created.path}"`);
  return NextResponse.json(created, { status: 201 });
});

/** PUT /api/file { path, content, baseVersion? } — atomically saves a note. */
export const PUT = withErrors(async (req) => {
  const { path, content, baseVersion } = await readJson(req, saveNoteSchema);
  const ctx = await getContext();
  const saved = await writeNote(ctx.vault, path, content, baseVersion);
  ctx.search.invalidate(saved.path);
  return NextResponse.json(saved);
});

/** DELETE /api/file?path=… — moves a note to the vault .trash folder. */
export const DELETE = withErrors(async (req) => {
  assertSameOrigin(req);
  const ctx = await getContext();
  await ctx.vault.resolveExisting(queryParam(req, "path"), "file");
  const result = await trashEntry(ctx.vault, queryParam(req, "path"));
  ctx.invalidate();
  console.log(`[obsideck] trashed note "${result.path}"`);
  return NextResponse.json(result);
});
