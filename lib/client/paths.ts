import type { FolderNode, TreeNode } from "../types";

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

export function stripMd(name: string): string {
  return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

export function ensureMd(name: string): string {
  return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
}

/** All ancestor folders of a path: "a/b/c.md" → ["a", "a/b"]. */
export function ancestors(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

export function collectFolders(root: FolderNode): string[] {
  const out: string[] = [];
  const walk = (node: FolderNode) => {
    for (const child of node.children) {
      if (child.type === "folder") {
        out.push(child.path);
        walk(child);
      }
    }
  };
  walk(root);
  return out;
}

export function collectNotes(root: FolderNode): string[] {
  const out: string[] = [];
  const walk = (node: TreeNode) => {
    if (node.type === "file") out.push(node.path);
    else node.children.forEach(walk);
  };
  walk(root);
  return out;
}

/** Client-side check mirroring the server rules, for instant feedback in dialogs. */
export function validateName(name: string): string | null {
  if (name.trim() === "") return "Name is required";
  if (name.trim() !== name) return "Name cannot start or end with spaces";
  if (name.startsWith(".")) return "Name cannot start with a dot";
  if (/[\\/:*?"<>|[\]#^]/.test(name)) return 'Name cannot contain \\ / : * ? " < > | [ ] # ^';
  return null;
}

/** Resolves "../x.md" against a note's folder; null if it would leave the vault. */
export function resolveRelativePath(fromNote: string, target: string): string | null {
  const parts = target.startsWith("/") ? [] : dirname(fromNote).split("/").filter(Boolean);
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.length ? parts.join("/") : null;
}
