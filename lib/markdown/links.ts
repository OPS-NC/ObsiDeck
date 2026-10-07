/**
 * Obsidian link helpers, shared by the preview and the editor. Pure functions
 * so they can be unit tested.
 */

export interface WikiTarget {
  /** Note part, e.g. "Folder/Note" (may be empty for same-note heading links). */
  note: string;
  heading: string | null;
  alias: string | null;
}

/** Parses the inside of [[...]]: "Note#Heading|Alias". */
export function parseWikiTarget(raw: string): WikiTarget {
  let rest = raw.trim();
  let alias: string | null = null;
  const pipe = rest.indexOf("|");
  if (pipe !== -1) {
    alias = rest.slice(pipe + 1).trim() || null;
    rest = rest.slice(0, pipe);
  }
  let heading: string | null = null;
  const hash = rest.indexOf("#");
  if (hash !== -1) {
    heading = rest.slice(hash + 1).replace(/^\^/, "").trim() || null;
    rest = rest.slice(0, hash);
  }
  return { note: rest.trim(), heading, alias };
}

export interface NoteIndex {
  /** Lower-cased full path without .md → path. */
  byPath: Map<string, string>;
  /** Lower-cased basename without .md → paths. */
  byName: Map<string, string[]>;
}

export function buildNoteIndex(paths: string[]): NoteIndex {
  const byPath = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const p of paths) {
    const key = p.replace(/\.md$/i, "").toLowerCase();
    byPath.set(key, p);
    const name = key.slice(key.lastIndexOf("/") + 1);
    const list = byName.get(name);
    if (list) list.push(p);
    else byName.set(name, [p]);
  }
  return { byPath, byName };
}

/**
 * Resolves a wiki link target like Obsidian: exact vault path first, then
 * relative to the current note, then by unique name (closest/shortest path).
 */
export function resolveWikiLink(index: NoteIndex, target: string, fromNote: string | null): string | null {
  const clean = target.replace(/\.md$/i, "").replace(/^\/+/, "").trim();
  if (!clean) return null;
  const key = clean.toLowerCase();

  const exact = index.byPath.get(key);
  if (exact) return exact;

  if (fromNote) {
    const dir = fromNote.includes("/") ? fromNote.slice(0, fromNote.lastIndexOf("/")) : "";
    const relative = index.byPath.get((dir ? `${dir}/${key}` : key).toLowerCase());
    if (relative) return relative;
  }

  const name = key.slice(key.lastIndexOf("/") + 1);
  const candidates = (index.byName.get(name) ?? []).filter((p) =>
    p.replace(/\.md$/i, "").toLowerCase().endsWith(key),
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;

  const fromDir = fromNote?.includes("/") ? fromNote.slice(0, fromNote.lastIndexOf("/")) : "";
  const sameFolder = candidates.find((p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "") === fromDir);
  return sameFolder ?? [...candidates].sort((a, b) => a.length - b.length)[0] ?? null;
}

/** GitHub-like slug, matching rehype-slug (github-slugger) output for headings. */
export { slug as headingSlug } from "github-slugger";
