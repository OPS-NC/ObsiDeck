import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { getContext } from "@/lib/server/context";
import { queryParam, withErrors } from "@/lib/server/http";
import { MAX_ASSET_BYTES, assetContentType, resolveAsset } from "@/lib/filesystem/assets";
import { normalizeRelativePath } from "@/lib/security/paths";
import { VaultError } from "@/lib/security/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/asset?path=img.png&from=Folder/Note.md — serves an image
 * attachment referenced by a note. Only whitelisted image types are served.
 */
export const GET = withErrors(async (req) => {
  const target = queryParam(req, "path");
  if (!target || target.length > 1024) throw new VaultError("INVALID_PATH", "Missing path");
  const fromRaw = queryParam(req, "from");
  const from = fromRaw ? normalizeRelativePath(fromRaw) : null;

  const ctx = await getContext();
  const asset = await resolveAsset(ctx.vault, () => ctx.snapshot(), target, from);
  const type = assetContentType(asset.real);
  if (!type) throw new VaultError("UNSUPPORTED_TYPE", "Unsupported attachment type");
  if (asset.stats.size > MAX_ASSET_BYTES) throw new VaultError("TOO_LARGE", "Attachment is too large");

  const etag = `"${asset.stats.size.toString(16)}-${Math.floor(asset.stats.mtimeMs).toString(16)}"`;
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "private, max-age=60, must-revalidate",
    ETag: etag,
    // SVGs may embed scripts: never let them execute on our origin.
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  };
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  headers["Content-Length"] = String(asset.stats.size);
  const stream = Readable.toWeb(createReadStream(asset.real)) as ReadableStream<Uint8Array>;
  return new Response(stream, { headers });
});
