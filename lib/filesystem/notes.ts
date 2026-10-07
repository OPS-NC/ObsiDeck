import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { VaultError, isErrnoException } from "../security/errors";
import { isInsideRoot, isMarkdownPath, normalizeRelativePath, validateEntryName } from "../security/paths";
import { lexists, type Vault } from "../security/vault";
import { KeyedMutex, atomicWriteFile } from "./atomic";
import type { NoteResponse, SaveResponse } from "../types";

export const MAX_NOTE_BYTES = 10 * 1024 * 1024;
const TRASH_FOLDER = ".trash";

const writeLock = new KeyedMutex();

export function contentVersion(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 32);
}

function assertMarkdown(relative: string): void {
  if (!isMarkdownPath(relative)) {
    throw new VaultError("UNSUPPORTED_TYPE", "Only Markdown (.md) notes can be opened or edited");
  }
}

function assertSize(content: string): void {
  if (Buffer.byteLength(content, "utf8") > MAX_NOTE_BYTES) {
    throw new VaultError("TOO_LARGE", "Note is too large");
  }
}

export async function readNote(vault: Vault, input: unknown): Promise<NoteResponse> {
  const resolved = await vault.resolveExisting(input, "file");
  assertMarkdown(resolved.relative);
  if (resolved.stats.size > MAX_NOTE_BYTES) {
    throw new VaultError("TOO_LARGE", "Note is too large to be opened");
  }
  const content = await fs.readFile(resolved.real, "utf8");
  return {
    path: resolved.relative,
    content,
    version: contentVersion(content),
    mtime: resolved.stats.mtimeMs,
  };
}

export async function createNote(vault: Vault, input: unknown, content = ""): Promise<SaveResponse> {
  const { relative, target } = await vault.resolveNew(input);
  assertMarkdown(relative);
  validateEntryName(path.posix.basename(relative, ".md"));
  assertSize(content);
  try {
    await fs.writeFile(target, content, { encoding: "utf8", flag: "wx" });
  } catch (err) {
    if (isErrnoException(err) && err.code === "EEXIST") {
      throw new VaultError("ALREADY_EXISTS", "A note with this name already exists");
    }
    throw err;
  }
  const stats = await fs.stat(target);
  return { path: relative, version: contentVersion(content), mtime: stats.mtimeMs };
}

/**
 * Saves a note. When `baseVersion` is given and the file on disk no longer
 * matches it (modified by Obsidian, another tab…), a CONFLICT is raised
 * instead of silently overwriting.
 */
export async function writeNote(
  vault: Vault,
  input: unknown,
  content: string,
  baseVersion?: string,
): Promise<SaveResponse> {
  assertSize(content);
  // Lock on the canonical path computed synchronously, so writes run in call order.
  const key = normalizeRelativePath(input);
  return writeLock.run(key, async () => {
    const resolved = await vault.resolveExisting(key, "file");
    assertMarkdown(resolved.relative);
    if (baseVersion !== undefined) {
      const current = await fs.readFile(resolved.real, "utf8");
      const currentVersion = contentVersion(current);
      if (currentVersion !== baseVersion) {
        throw new VaultError("CONFLICT", "The note was modified on disk", { currentVersion });
      }
    }
    await atomicWriteFile(resolved.real, content);
    const stats = await fs.stat(resolved.real);
    return { path: resolved.relative, version: contentVersion(content), mtime: stats.mtimeMs };
  });
}

export async function createFolder(vault: Vault, input: unknown): Promise<{ path: string }> {
  const { relative, target } = await vault.resolveNew(input);
  validateEntryName(path.posix.basename(relative));
  try {
    await fs.mkdir(target);
  } catch (err) {
    if (isErrnoException(err) && err.code === "EEXIST") {
      throw new VaultError("ALREADY_EXISTS", "A folder with this name already exists");
    }
    throw err;
  }
  return { path: relative };
}

export async function renameEntry(vault: Vault, from: unknown, to: unknown): Promise<{ from: string; to: string }> {
  const source = await vault.resolveExisting(from);
  const isFile = source.stats.isFile();

  // Renaming a symlink would only move the link: keep it simple and refuse.
  const sourceLstat = await fs.lstat(source.entry);
  if (sourceLstat.isSymbolicLink()) {
    throw new VaultError("FORBIDDEN", "Symbolic links cannot be renamed from ObsiDeck");
  }

  let destination: { relative: string; target: string };
  try {
    destination = await vault.resolveNew(to);
  } catch (err) {
    // Case-only rename on a case-insensitive filesystem: same inode.
    if (err instanceof VaultError && err.code === "ALREADY_EXISTS") {
      const existing = await vault.resolveExisting(to);
      const same = existing.stats.ino === source.stats.ino && existing.stats.dev === source.stats.dev;
      if (!same || existing.relative === source.relative) throw err;
      destination = { relative: existing.relative, target: existing.entry };
    } else {
      throw err;
    }
  }

  const name = path.posix.basename(destination.relative);
  if (isFile) {
    if (isMarkdownPath(source.relative) !== isMarkdownPath(destination.relative)) {
      throw new VaultError("INVALID_NAME", "A note must keep its .md extension");
    }
    validateEntryName(isMarkdownPath(name) ? name.slice(0, -3) : name);
  } else {
    validateEntryName(name);
    if (isInsideRoot(source.real, destination.target)) {
      throw new VaultError("INVALID_PATH", "A folder cannot be moved inside itself");
    }
  }

  await fs.rename(source.entry, destination.target);
  return { from: source.relative, to: destination.relative };
}

/**
 * Deletion moves the entry to the vault's `.trash` folder (same convention as
 * Obsidian's "Move to Obsidian trash"), so nothing is ever lost by a misclick.
 */
export async function trashEntry(vault: Vault, input: unknown): Promise<{ path: string; trashedAs: string }> {
  const resolved = await vault.resolveExisting(input);
  const trashDir = path.join(vault.root, TRASH_FOLDER);
  await fs.mkdir(trashDir, { recursive: true });

  const ext = path.extname(resolved.entry);
  const base = path.basename(resolved.entry, ext);
  let candidate = path.join(trashDir, base + ext);
  for (let i = 1; await lexists(candidate); i++) {
    candidate = path.join(trashDir, `${base} ${i}${ext}`);
  }
  await fs.rename(resolved.entry, candidate);
  return { path: resolved.relative, trashedAs: path.basename(candidate) };
}
