"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { useWorkspace } from "@/lib/client/store";
import { useMediaQuery } from "@/lib/client/hooks";
import {
  createNote,
  currentFolder,
  flushSave,
  openNote,
  toggleTask,
  updateContent,
} from "@/lib/client/actions";
import { resolveWikiLink, parseWikiTarget, headingSlug } from "@/lib/markdown/links";
import { MarkdownEditor, type EditorHandle } from "../editor/MarkdownEditor";
import { MarkdownPreview } from "../preview/MarkdownPreview";
import { NoteBanner } from "./NoteBanner";
import { cn } from "../ui/primitives";

/** Editor / preview / split view for the open note. */
export function NoteView({ editorRef }: { editorRef: React.RefObject<EditorHandle | null> }) {
  const { doc, mode, lineNumbers, noteIndex, reveal } = useWorkspace(
    useShallow((s) => ({
      doc: s.doc,
      mode: s.mode,
      lineNumbers: s.lineNumbers,
      noteIndex: s.noteIndex,
      reveal: s.reveal,
    })),
  );
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const effectiveMode = isNarrow && mode === "split" ? "edit" : mode;
  const previewRef = useRef<HTMLDivElement>(null);
  const leader = useRef<"editor" | "preview">("editor");
  const syncing = useRef(false);
  const frame = useRef(0);

  const ready = doc && doc.status !== "loading" && !(doc.status === "error" && doc.version === "");

  function openTarget(target: string) {
    const { note, heading } = parseWikiTarget(target);
    if (!note && heading) return revealHeading(heading);
    const resolved = resolveWikiLink(useWorkspace.getState().noteIndex, note, doc?.path ?? null);
    if (resolved) void openNote(resolved, { heading: heading ?? undefined });
    else offerCreate(note);
  }

  function offerCreate(name: string) {
    toast(`“${name}” does not exist yet`, {
      action: { label: "Create note", onClick: () => void createNote(currentFolder(), name.split("/").pop() ?? name) },
    });
  }

  function revealHeading(heading: string) {
    useWorkspace.getState().setReveal({ heading });
  }

  // ── Reveal a line / heading after navigation or search ──
  useEffect(() => {
    if (!reveal || !ready) return;
    const id = requestAnimationFrame(() => {
      const editor = editorRef.current;
      let line = reveal.line ?? null;
      if (reveal.heading) {
        line = editor?.findHeading(reveal.heading) ?? line;
        const preview = previewRef.current;
        const el = preview?.querySelector<HTMLElement>(`[id="${CSS.escape(headingSlug(reveal.heading))}"]`);
        if (el && preview) {
          preview.scrollTop = el.offsetTop - 24;
          el.classList.remove("heading-flash");
          void el.offsetWidth;
          el.classList.add("heading-flash");
        }
      }
      if (line && editor) {
        editor.scrollToLine(line, effectiveMode !== "preview");
        if (!reveal.heading) scrollPreviewToLine(line, 0);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [reveal?.nonce, ready]);

  // ── Scroll sync (split mode) ──
  function previewBlocks(): { line: number; top: number }[] {
    const root = previewRef.current;
    if (!root) return [];
    const article = root.firstElementChild as HTMLElement | null;
    if (!article) return [];
    return Array.from(article.querySelectorAll<HTMLElement>(":scope > [data-line]")).map((el) => ({
      line: Number(el.dataset.line),
      top: el.offsetTop,
    }));
  }

  function scrollPreviewToLine(line: number, fraction: number) {
    const root = previewRef.current;
    if (!root) return;
    const blocks = previewBlocks();
    if (blocks.length === 0) return;
    const pos = line + fraction;
    let i = blocks.findIndex((b) => b.line > pos) - 1;
    if (i === -2) i = blocks.length - 1;
    if (i < 0) {
      root.scrollTop = 0;
      return;
    }
    const cur = blocks[i]!;
    const next = blocks[i + 1];
    const ratio = next ? (pos - cur.line) / Math.max(1, next.line - cur.line) : 0;
    const y = cur.top + (next ? (next.top - cur.top) * ratio : 0);
    root.scrollTop = Math.max(0, y - 36);
  }

  const onEditorScroll = () => {
    if (effectiveMode !== "split" || leader.current !== "editor" || syncing.current) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const top = editorRef.current?.topLine();
      if (!top) return;
      syncing.current = true;
      scrollPreviewToLine(top.line, top.fraction);
      requestAnimationFrame(() => (syncing.current = false));
    });
  };

  const onPreviewScroll = () => {
    if (effectiveMode !== "split" || leader.current !== "preview" || syncing.current) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const root = previewRef.current;
      const editor = editorRef.current;
      if (!root || !editor) return;
      const blocks = previewBlocks();
      const y = root.scrollTop + 36;
      let i = blocks.findIndex((b) => b.top > y) - 1;
      if (i === -2) i = blocks.length - 1;
      if (i < 0) return editor.setTopLine(1);
      const cur = blocks[i]!;
      const next = blocks[i + 1];
      const ratio = next ? (y - cur.top) / Math.max(1, next.top - cur.top) : 0;
      syncing.current = true;
      editor.setTopLine(cur.line + (next ? (next.line - cur.line) * ratio : 0));
      requestAnimationFrame(() => (syncing.current = false));
    });
  };

  // Keep the cursor visible when switching back to edit mode.
  useEffect(() => {
    if (effectiveMode !== "preview") requestAnimationFrame(() => editorRef.current?.focus());
  }, [effectiveMode, editorRef, doc?.path]);

  if (!doc) return null;

  if (!ready) {
    return doc.status === "error" ? (
      <div className="flex h-full items-center justify-center p-8 text-center text-[13px] text-muted">
        <div>
          <p className="font-medium text-fg">This note could not be opened</p>
          <p className="mt-1">{doc.error}</p>
        </div>
      </div>
    ) : (
      <NoteSkeleton />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <NoteBanner />
      <div className={cn("grid min-h-0 flex-1", effectiveMode === "split" ? "grid-cols-2" : "grid-cols-1")}>
        <div
          className={cn("min-h-0 min-w-0", effectiveMode === "preview" && "hidden")}
          onPointerEnter={() => (leader.current = "editor")}
          onTouchStart={() => (leader.current = "editor")}
          onFocusCapture={() => (leader.current = "editor")}
        >
          <MarkdownEditor
            key={doc.path}
            ref={editorRef}
            initialContent={doc.content}
            content={doc.content}
            epoch={doc.epoch}
            lineNumbers={lineNumbers}
            onChange={updateContent}
            onSave={() => void flushSave()}
            onFollowLink={openTarget}
            getNotes={() => useWorkspace.getState().notePaths}
            onScroll={onEditorScroll}
          />
        </div>
        {effectiveMode !== "edit" && (
          <div
            className={cn("min-h-0 min-w-0", effectiveMode === "split" && "border-l border-border")}
            onPointerEnter={() => (leader.current = "preview")}
            onTouchStart={() => (leader.current = "preview")}
          >
            <MarkdownPreview
              ref={previewRef}
              content={doc.content}
              path={doc.path}
              noteIndex={noteIndex}
              onScroll={onPreviewScroll}
              onOpenNote={(path, heading) => void openNote(path, { heading })}
              onMissingNote={offerCreate}
              onHeading={revealHeading}
              onTag={(tag) => {
                const s = useWorkspace.getState();
                s.setSidebarQuery(`#${tag}`);
                if (isNarrow) s.setMobileSidebarOpen(true);
                else s.setSidebarOpen(true);
              }}
              onToggleTask={toggleTask}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function NoteSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-8 pt-10" aria-busy="true">
      <div className="skeleton h-7 w-2/5" />
      <div className="mt-6 space-y-3">
        <div className="skeleton h-3.5 w-full" />
        <div className="skeleton h-3.5 w-11/12" />
        <div className="skeleton h-3.5 w-4/5" />
        <div className="skeleton h-3.5 w-3/5" />
      </div>
    </div>
  );
}
