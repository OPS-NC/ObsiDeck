import path from "node:path";
import { VaultError } from "./errors";

const MAX_PATH_LENGTH = 1024;
const MAX_SEGMENT_BYTES = 255;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
// Characters Obsidian refuses in note names, plus link-breaking ones.
const FORBIDDEN_NAME_CHARS = /[\\/:*?"<>|[\]#^]/;

/**
 * Validates a client-supplied vault-relative path and returns its canonical
 * form ("a/b/c.md"). This is a purely lexical check; callers must still
 * resolve the real path on disk (see Vault) to defeat symlink escapes.
 *
 * Rejected: non-strings, empty paths, absolute paths, backslashes, control
 * characters, "." / ".." segments, empty segments and hidden (dot) entries.
 */
export function normalizeRelativePath(input: unknown): string {
  if (typeof input !== "string") {
    throw new VaultError("INVALID_PATH", "Path must be a string");
  }
  if (input.length === 0 || input.length > MAX_PATH_LENGTH) {
    throw new VaultError("INVALID_PATH", "Path is empty or too long");
  }
  if (CONTROL_CHARS.test(input) || input.includes("\\")) {
    throw new VaultError("INVALID_PATH", "Path contains forbidden characters");
  }
  if (input.startsWith("/") || /^[A-Za-z]:/.test(input)) {
    throw new VaultError("INVALID_PATH", "Absolute paths are not allowed");
  }

  const segments = input.split("/");
  for (const segment of segments) {
    if (segment === "") {
      throw new VaultError("INVALID_PATH", "Path contains an empty segment");
    }
    if (segment === "." || segment === "..") {
      throw new VaultError("INVALID_PATH", "Relative segments are not allowed");
    }
    if (segment.startsWith(".")) {
      throw new VaultError("FORBIDDEN", "Hidden files and folders are not accessible");
    }
    if (Buffer.byteLength(segment, "utf8") > MAX_SEGMENT_BYTES) {
      throw new VaultError("INVALID_PATH", "Path segment is too long");
    }
  }
  return segments.join("/");
}

/** Validates a single file/folder name chosen by the user (create/rename). */
export function validateEntryName(name: string): string {
  if (name.length === 0 || name.trim() !== name) {
    throw new VaultError("INVALID_NAME", "Name cannot be empty or start/end with spaces");
  }
  if (name === "." || name === ".." || name.startsWith(".")) {
    throw new VaultError("INVALID_NAME", "Name cannot start with a dot");
  }
  if (CONTROL_CHARS.test(name) || FORBIDDEN_NAME_CHARS.test(name)) {
    throw new VaultError("INVALID_NAME", 'Name cannot contain any of \\ / : * ? " < > | [ ] # ^');
  }
  if (Buffer.byteLength(name, "utf8") > MAX_SEGMENT_BYTES) {
    throw new VaultError("INVALID_NAME", "Name is too long");
  }
  return name;
}

/** True when `candidate` (absolute, already resolved) is `root` or inside it. */
export function isInsideRoot(root: string, candidate: string): boolean {
  if (candidate === root) return true;
  const rel = path.relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Converts an absolute path under root to a vault-relative POSIX path. */
export function toVaultRelative(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}

/**
 * Resolves a link target written inside a note (e.g. "../img/a.png") against
 * the note's folder. Returns null when the result would leave the vault.
 */
export function resolveRelativeToNote(notePath: string | null, target: string): string | null {
  // A leading "/" means "from the vault root", never from the host root.
  const base = notePath && !target.startsWith("/") ? path.posix.dirname(notePath) : ".";
  const joined = path.posix.normalize(path.posix.join(base, target));
  if (joined === "." || joined.startsWith("../") || joined === ".." || joined.startsWith("/")) {
    return null;
  }
  return joined;
}

export const MARKDOWN_EXTENSION = ".md";

export function isMarkdownPath(p: string): boolean {
  return p.toLowerCase().endsWith(MARKDOWN_EXTENSION);
}
