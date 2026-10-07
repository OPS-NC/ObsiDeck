"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { useWorkspace } from "@/lib/client/store";
import { api, errorMessage } from "@/lib/client/api";
import { openNote } from "@/lib/client/actions";
import { fuzzyScore } from "@/lib/client/fuzzy";
import { dirname, stripMd, basename } from "@/lib/client/paths";
import type { SearchHit } from "@/lib/types";
import { cn } from "../ui/primitives";

const FILE_LIMIT = 30;

/** Sidebar search: instant file name matches plus server-side full-text hits. */
export function SearchPanel({ query }: { query: string }) {
  const notePaths = useWorkspace((s) => s.notePaths);
  const activePath = useWorkspace((s) => s.activePath);
  const isTag = query.startsWith("#");

  const files = useMemo(() => {
    if (isTag) return [];
    return notePaths
      .map((path) => ({ path, match: fuzzyScore(query, stripMd(path)) }))
      .filter((r) => r.match !== null)
      .sort((a, b) => b.match!.score - a.match!.score)
      .slice(0, FILE_LIMIT);
  }, [notePaths, query, isTag]);

  const content = useContentSearch(query);

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-6">
      {files.length > 0 && (
        <Section title="Files">
          {files.map(({ path }) => (
            <button
              key={path}
              type="button"
              onClick={() => void openNote(path)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover",
                path === activePath && "bg-accent-soft",
              )}
            >
              <FileText className="size-[15px] shrink-0 text-subtle" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg">{stripMd(basename(path))}</span>
                {dirname(path) && <span className="block truncate text-[11.5px] text-subtle">{dirname(path)}</span>}
              </span>
            </button>
          ))}
        </Section>
      )}

      <Section
        title={isTag ? `Notes tagged ${query}` : "In notes"}
        aside={content.loading ? <Loader2 className="size-3 animate-spin text-subtle" /> : null}
      >
        {content.error && <p className="px-2 py-1 text-[12px] text-danger">{content.error}</p>}
        {!content.loading && content.hits.length === 0 && !content.error && (
          <p className="px-2 py-1 text-[12px] text-subtle">{query.trim().length < 2 ? "Type at least 2 characters" : "No matches"}</p>
        )}
        {content.hits.map((hit) => (
          <ContentHit key={hit.path} hit={hit} />
        ))}
      </Section>
    </div>
  );
}

function ContentHit({ hit }: { hit: SearchHit }) {
  const before = hit.matchStart >= 0 ? hit.snippet.slice(0, hit.matchStart) : hit.snippet;
  const match = hit.matchStart >= 0 ? hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLength) : "";
  const after = hit.matchStart >= 0 ? hit.snippet.slice(hit.matchStart + hit.matchLength) : "";
  return (
    <button
      type="button"
      onClick={() => void openNote(hit.path, { line: hit.line || undefined })}
      className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-hover"
    >
      <span className="flex items-baseline gap-2">
        <span className="truncate text-[13px] font-medium text-fg">{stripMd(hit.name)}</span>
        {hit.matches > 1 && <span className="shrink-0 text-[11px] text-subtle">{hit.matches}×</span>}
      </span>
      {dirname(hit.path) && <span className="block truncate text-[11.5px] text-subtle">{dirname(hit.path)}</span>}
      {hit.snippet && (
        <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-muted">
          {before}
          <mark className="rounded-[3px] bg-accent-soft px-0.5 text-accent-text">{match}</mark>
          {after}
        </span>
      )}
    </button>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <h3 className="flex items-center gap-2 px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-subtle">
        {title}
        {aside}
      </h3>
      {children}
    </section>
  );
}

/** Debounced full-text search; aborts stale requests. */
export function useContentSearch(query: string, delay = 180) {
  const [state, setState] = useState<{ hits: SearchHit[]; loading: boolean; error: string | null }>({
    hits: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setState({ hits: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .search(q, controller.signal)
        .then((res) => setState({ hits: res.hits.filter((h) => h.matches > 0), loading: false, error: null }))
        .catch((err) => {
          if (!controller.signal.aborted) setState({ hits: [], loading: false, error: errorMessage(err) });
        });
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, delay]);

  return state;
}
