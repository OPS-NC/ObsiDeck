import path from "node:path";
import { VaultError } from "../security/errors";
import { resolveRelativeToNote } from "../security/paths";
import type { Vault, ResolvedEntry } from "../security/vault";
import type { VaultSnapshot } from "./tree";

/** Attachments that may be served to the browser, with their content type. */
export const ASSET_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

export const MAX_ASSET_BYTES = 50 * 1024 * 1024;

export function assetContentType(p: string): string | null {
  return ASSET_TYPES[path.extname(p).toLowerCase()] ?? null;
}

async function tryResolve(vault: Vault, candidate: string | null): Promise<ResolvedEntry | null> {
  if (!candidate) return null;
  try {
    return await vault.resolveExisting(candidate, "file");
  } catch (err) {
    if (err instanceof VaultError && (err.code === "NOT_FOUND" || err.code === "NOT_A_FILE")) return null;
    throw err;
  }
}

/**
 * Resolves an image reference the way Obsidian does: relative to the note,
 * then from the vault root, then by unique file name anywhere in the vault.
 */
export async function resolveAsset(
  vault: Vault,
  snapshot: () => Promise<VaultSnapshot>,
  target: string,
  fromNote: string | null,
): Promise<ResolvedEntry> {
  const cleaned = target.split("#")[0]?.split("|")[0]?.trim() ?? "";
  if (cleaned === "" || !assetContentType(cleaned)) {
    throw new VaultError("UNSUPPORTED_TYPE", "Unsupported attachment type");
  }

  const relative = await tryResolve(vault, resolveRelativeToNote(fromNote, cleaned));
  if (relative) return relative;

  const fromRoot = await tryResolve(vault, path.posix.normalize(cleaned));
  if (fromRoot) return fromRoot;

  const byName = (await snapshot()).attachments.get(path.posix.basename(cleaned).toLowerCase());
  if (byName && byName.length > 0) {
    const sorted = [...byName].sort((a, b) => a.length - b.length);
    const found = await tryResolve(vault, sorted[0] ?? null);
    if (found) return found;
  }
  throw new VaultError("NOT_FOUND", "Attachment not found");
}
