import fs from "node:fs/promises";
import path from "node:path";
import type { FileNode, SearchHit, SearchResponse } from "../types";

const MAX_INDEXED_BYTES = 2 * 1024 * 1024;
const READ_CONCURRENCY = 32;
const SNIPPET_RADIUS = 60;

interface CachedNote {
  mtime: number;
  size: number;
  lower: string;
  content: string;
}

/**
 * In-memory full-text search over the vault notes. Contents are cached per
 * file and re-read only when mtime/size change, so repeated queries on a
 * large vault stay fast without any database.
 */
export class NoteSearch {
  private readonly cache = new Map<string, CachedNote>();

  constructor(private readonly root: string) {}

  invalidate(relative: string): void {
    this.cache.delete(relative);
  }

  clear(): void {
    this.cache.clear();
  }

  async search(notes: FileNode[], rawQuery: string, limit: number): Promise<SearchResponse> {
    const query = rawQuery.trim();
    const needle = query.toLowerCase();
    if (needle.length === 0) return { query, hits: [], truncated: false };

    await this.warm(notes);

    const hits: (SearchHit & { score: number })[] = [];
    for (const note of notes) {
      const cached = this.cache.get(note.path);
      const nameMatch = note.name.toLowerCase().includes(needle);
      const first = cached ? cached.lower.indexOf(needle) : -1;
      if (first === -1 && !nameMatch) continue;

      let matches = 0;
      if (cached && first !== -1) {
        for (let i = first; i !== -1 && matches < 999; i = cached.lower.indexOf(needle, i + needle.length)) {
          matches++;
        }
      }
      const hit = cached && first !== -1 ? buildSnippet(cached.content, first, needle.length) : null;
      hits.push({
        path: note.path,
        name: note.name,
        line: hit?.line ?? 0,
        snippet: hit?.snippet ?? "",
        matchStart: hit?.matchStart ?? -1,
        matchLength: hit ? needle.length : 0,
        matches,
        score: (nameMatch ? 1000 : 0) + Math.min(matches, 50),
      });
    }

    hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    return {
      query,
      hits: hits.slice(0, limit).map(({ score: _score, ...hit }) => hit),
      truncated: hits.length > limit,
    };
  }

  private async warm(notes: FileNode[]): Promise<void> {
    const stale = notes.filter((n) => {
      if (n.size > MAX_INDEXED_BYTES) return false;
      const cached = this.cache.get(n.path);
      return !cached || cached.mtime !== n.mtime || cached.size !== n.size;
    });

    let cursor = 0;
    const worker = async () => {
      while (cursor < stale.length) {
        const note = stale[cursor++];
        if (!note) break;
        try {
          // Paths come from our own scan of the vault (no client input here).
          const content = await fs.readFile(path.join(this.root, note.path), "utf8");
          this.cache.set(note.path, { mtime: note.mtime, size: note.size, content, lower: content.toLowerCase() });
        } catch {
          this.cache.delete(note.path);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, stale.length) }, worker));
  }
}

function buildSnippet(content: string, index: number, length: number) {
  const lineStart = content.lastIndexOf("\n", index - 1) + 1;
  let lineEnd = content.indexOf("\n", index);
  if (lineEnd === -1) lineEnd = content.length;

  const start = Math.max(lineStart, index - SNIPPET_RADIUS);
  const end = Math.min(lineEnd, index + length + SNIPPET_RADIUS);
  const prefix = start > lineStart ? "…" : "";
  const suffix = end < lineEnd ? "…" : "";
  const line = countLines(content, index);

  return {
    line,
    snippet: prefix + content.slice(start, end) + suffix,
    matchStart: prefix.length + (index - start),
  };
}

function countLines(content: string, index: number): number {
  let line = 1;
  for (let i = content.indexOf("\n"); i !== -1 && i < index; i = content.indexOf("\n", i + 1)) line++;
  return line;
}
