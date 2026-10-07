import fs from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import { VaultError, isErrnoException } from "./errors";
import { isInsideRoot, normalizeRelativePath, toVaultRelative } from "./paths";

export interface ResolvedEntry {
  /** Canonical vault-relative path. */
  relative: string;
  /** The entry itself (parent folder resolved, last segment untouched). Use for rename/delete. */
  entry: string;
  /** Fully resolved real path (symlinks followed). Use for read/write. */
  real: string;
  stats: Stats;
}

export interface NewEntry {
  relative: string;
  /** Absolute target path whose parent is a real directory inside the vault. */
  target: string;
}

type Kind = "file" | "directory" | "any";

/**
 * The only gateway from a client-supplied path to the filesystem.
 * Every method validates the path lexically, then resolves real paths and
 * checks they stay under the vault root, so symlinks cannot escape it.
 */
export class Vault {
  private constructor(readonly root: string) {}

  static async open(rootPath: string): Promise<Vault> {
    if (!path.isAbsolute(rootPath)) {
      throw new Error("OBSIDIAN_VAULT_PATH must be an absolute path");
    }
    const real = await fs.realpath(rootPath);
    const stats = await fs.stat(real);
    if (!stats.isDirectory()) {
      throw new Error("OBSIDIAN_VAULT_PATH is not a directory");
    }
    return new Vault(real);
  }

  get name(): string {
    return path.basename(this.root);
  }

  relative(absolute: string): string {
    return toVaultRelative(this.root, absolute);
  }

  private assertInside(absolute: string): void {
    if (!isInsideRoot(this.root, absolute)) {
      throw new VaultError("FORBIDDEN", "Path resolves outside of the vault");
    }
  }

  private async realParent(relative: string): Promise<string> {
    const lexicalParent = path.dirname(path.join(this.root, relative));
    let parent: string;
    try {
      parent = await fs.realpath(lexicalParent);
    } catch (err) {
      if (isErrnoException(err) && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
        throw new VaultError("NOT_FOUND", "Parent folder does not exist");
      }
      throw err;
    }
    this.assertInside(parent);
    const stats = await fs.stat(parent);
    if (!stats.isDirectory()) {
      throw new VaultError("NOT_A_DIRECTORY", "Parent is not a folder");
    }
    return parent;
  }

  /** Resolves an existing entry. Throws NOT_FOUND / FORBIDDEN / kind mismatch. */
  async resolveExisting(input: unknown, kind: Kind = "any"): Promise<ResolvedEntry> {
    const relative = normalizeRelativePath(input);
    const parent = await this.realParent(relative);
    const entry = path.join(parent, path.basename(relative));
    this.assertInside(entry);

    let real: string;
    try {
      real = await fs.realpath(entry);
    } catch (err) {
      if (isErrnoException(err) && (err.code === "ENOENT" || err.code === "ENOTDIR" || err.code === "ELOOP")) {
        throw new VaultError("NOT_FOUND", "File or folder not found");
      }
      throw err;
    }
    this.assertInside(real);
    if (real === this.root) {
      throw new VaultError("FORBIDDEN", "The vault root cannot be targeted");
    }

    const stats = await fs.stat(real);
    if (kind === "file" && !stats.isFile()) {
      throw new VaultError("NOT_A_FILE", "Not a file");
    }
    if (kind === "directory" && !stats.isDirectory()) {
      throw new VaultError("NOT_A_DIRECTORY", "Not a folder");
    }
    if (!stats.isFile() && !stats.isDirectory()) {
      throw new VaultError("FORBIDDEN", "Unsupported file type");
    }
    return { relative, entry, real, stats };
  }

  /** Resolves a path that must not exist yet, whose parent folder exists. */
  async resolveNew(input: unknown): Promise<NewEntry> {
    const relative = normalizeRelativePath(input);
    const parent = await this.realParent(relative);
    const target = path.join(parent, path.basename(relative));
    this.assertInside(target);
    if (await lexists(target)) {
      throw new VaultError("ALREADY_EXISTS", "A file or folder with this name already exists");
    }
    return { relative, target };
  }
}

export async function lexists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") return false;
    throw err;
  }
}
