import fs from "node:fs/promises";
import path from "node:path";
import { isMarkdownPath } from "../security/paths";
import type { FileNode, FolderNode, TreeNode } from "../types";

const MAX_DEPTH = 32;
const MAX_ENTRIES = 200_000;

export interface VaultSnapshot {
  root: FolderNode;
  /** Markdown notes, vault-relative. */
  notes: FileNode[];
  /** Lower-cased basename → vault-relative paths of non-Markdown files (attachments). */
  attachments: Map<string, string[]>;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
  return collator.compare(a.name, b.name);
}

/**
 * Walks the vault and returns metadata only (no content). Hidden entries
 * (.obsidian, .git, .trash…) and symbolic links are skipped, which also
 * prevents cycles and escapes through linked folders.
 */
export async function scanVault(root: string): Promise<VaultSnapshot> {
  const notes: FileNode[] = [];
  const attachments = new Map<string, string[]>();
  let count = 0;

  async function walk(absolute: string, relative: string, depth: number): Promise<FolderNode> {
    const folder: FolderNode = {
      type: "folder",
      name: relative === "" ? "" : path.posix.basename(relative),
      path: relative,
      children: [],
    };
    if (depth > MAX_DEPTH) return folder;

    let entries;
    try {
      entries = await fs.readdir(absolute, { withFileTypes: true });
    } catch (err) {
      console.warn(`[obsideck] cannot read folder "${relative || "/"}":`, (err as Error).message);
      return folder;
    }

    const subfolders: Promise<FolderNode>[] = [];
    const files: Promise<FileNode | null>[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      if (++count > MAX_ENTRIES) break;
      const childRel = relative === "" ? entry.name : `${relative}/${entry.name}`;
      const childAbs = path.join(absolute, entry.name);

      if (entry.isDirectory()) {
        subfolders.push(walk(childAbs, childRel, depth + 1));
      } else if (entry.isFile()) {
        if (isMarkdownPath(entry.name)) {
          files.push(statFile(childAbs, entry.name, childRel));
        } else {
          const key = entry.name.toLowerCase();
          const list = attachments.get(key);
          if (list) list.push(childRel);
          else attachments.set(key, [childRel]);
        }
      }
    }
    for (const node of await Promise.all(files)) {
      if (!node) continue;
      folder.children.push(node);
      notes.push(node);
    }
    folder.children.push(...(await Promise.all(subfolders)));
    folder.children.sort(compareNodes);
    return folder;
  }

  const rootNode = await walk(root, "", 0);
  return { root: rootNode, notes, attachments };
}

async function statFile(absolute: string, name: string, relative: string): Promise<FileNode | null> {
  try {
    const stats = await fs.stat(absolute);
    return { type: "file", name, path: relative, mtime: stats.mtimeMs, size: stats.size };
  } catch {
    // Deleted between readdir and stat.
    return null;
  }
}
