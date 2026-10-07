"use client";

import { useEffect, useMemo, useRef } from "react";
import { Toaster } from "sonner";
import {
  Columns2,
  Eye,
  FilePlus2,
  FolderPlus,
  ListOrdered,
  Moon,
  PanelLeft,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useWorkspace } from "@/lib/client/store";
import { useMediaQuery, useTheme, useVaultEvents } from "@/lib/client/hooks";
import { closeNote, currentFolder, flushSave, noteFromUrl, openNote, refreshTree } from "@/lib/client/actions";
import { Sidebar } from "../sidebar/Sidebar";
import { NoteView } from "../workspace/NoteView";
import type { EditorHandle } from "../editor/MarkdownEditor";
import { CommandPalette, type PaletteCommand } from "../dialogs/CommandPalette";
import { EntryDialogs } from "../dialogs/EntryDialogs";
import { TooltipProvider } from "../ui/primitives";
import { TopBar } from "./TopBar";
import { EmptyState } from "./EmptyState";
import { SidebarResizer } from "./SidebarResizer";

export function AppShell() {
  const sidebarOpen = useWorkspace((s) => s.sidebarOpen);
  const sidebarWidth = useWorkspace((s) => s.sidebarWidth);
  const mobileSidebarOpen = useWorkspace((s) => s.mobileSidebarOpen);
  const hasDoc = useWorkspace((s) => Boolean(s.doc));
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const [theme, setTheme] = useTheme();
  const connection = useVaultEvents();
  const editorRef = useRef<EditorHandle | null>(null);

  // Initial load: tree + note from the URL (?note=…), and back/forward navigation.
  useEffect(() => {
    void refreshTree();
    const initial = noteFromUrl();
    if (initial) void openNote(initial, { replaceHistory: true, fromHistory: true });
    const onPop = () => {
      const path = noteFromUrl();
      if (path) void openNote(path, { fromHistory: true });
      else closeNote();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const doc = useWorkspace.getState().doc;
      if (doc && doc.content !== doc.savedContent) {
        void flushSave();
        e.preventDefault();
      }
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") void flushSave();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);

  const openSearchInNote = () => {
    const s = useWorkspace.getState();
    if (!s.doc) return;
    if (s.mode === "preview") s.setMode("edit");
    requestAnimationFrame(() => editorRef.current?.openSearch());
  };

  // Global shortcuts (the editor handles its own: bold, italic, find…).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const s = useWorkspace.getState();
      const key = e.key.toLowerCase();
      if (mod && key === "p") {
        e.preventDefault();
        s.setPalette(e.shiftKey ? "commands" : "files");
      } else if ((mod && key === "n" && !e.shiftKey) || (e.altKey && e.code === "KeyN" && !mod)) {
        e.preventDefault();
        s.setDialog({ kind: "new-note", folder: currentFolder() });
      } else if (mod && key === "s") {
        e.preventDefault();
        void flushSave();
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        if (window.matchMedia("(max-width: 767px)").matches) s.setMobileSidebarOpen(!s.mobileSidebarOpen);
        else s.setSidebarOpen(!s.sidebarOpen);
      } else if (mod && e.altKey && ["Digit1", "Digit2", "Digit3"].includes(e.code)) {
        e.preventDefault();
        s.setMode(e.code === "Digit1" ? "edit" : e.code === "Digit2" ? "split" : "preview");
      } else if (mod && key === "f" && !e.shiftKey && s.doc && s.mode !== "preview") {
        const inEditor = (e.target as HTMLElement | null)?.closest(".cm-editor");
        if (!inEditor) {
          e.preventDefault();
          openSearchInNote();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands = useMemo<PaletteCommand[]>(() => {
    const s = useWorkspace.getState;
    return [
      { id: "new-note", label: "New note", icon: <FilePlus2 />, shortcut: "Mod+N", run: () => s().setDialog({ kind: "new-note", folder: currentFolder() }) },
      { id: "new-folder", label: "New folder", icon: <FolderPlus />, run: () => s().setDialog({ kind: "new-folder", folder: currentFolder() }) },
      { id: "mode-edit", label: "View: Edit", icon: <Pencil />, shortcut: "Mod+Alt+1", run: () => s().setMode("edit") },
      { id: "mode-split", label: "View: Split", icon: <Columns2 />, shortcut: "Mod+Alt+2", run: () => s().setMode("split") },
      { id: "mode-preview", label: "View: Preview", icon: <Eye />, shortcut: "Mod+Alt+3", run: () => s().setMode("preview") },
      { id: "toggle-sidebar", label: "Toggle sidebar", icon: <PanelLeft />, shortcut: "Mod+\\", run: () => s().setSidebarOpen(!s().sidebarOpen) },
      { id: "toggle-theme", label: "Toggle dark / light theme", icon: <Moon />, run: () => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark") },
      { id: "line-numbers", label: "Toggle line numbers", icon: <ListOrdered />, run: () => s().toggleLineNumbers() },
      { id: "find", label: "Find in note", icon: <Search />, shortcut: "Mod+F", run: () => openSearchInNote() },
      { id: "save", label: "Save note", icon: <Save />, shortcut: "Mod+S", run: () => void flushSave() },
      { id: "search-vault", label: "Search in all notes", icon: <Search />, run: () => focusSidebarSearch() },
      { id: "refresh", label: "Reload file tree", icon: <RefreshCw />, run: () => void refreshTree() },
      { id: "close", label: "Close note", icon: <X />, run: () => closeNote() },
      {
        id: "delete",
        label: "Delete current note",
        icon: <Trash2 />,
        run: () => {
          const path = s().activePath;
          if (path) s().setDialog({ kind: "delete", path, isFolder: false });
        },
      },
    ];
  }, [setTheme]);

  return (
    <TooltipProvider>
      <div className="flex h-dvh min-h-0 w-full overflow-hidden">
        {/* Desktop sidebar */}
        {!isNarrow && sidebarOpen && (
          <aside style={{ width: sidebarWidth }} className="relative shrink-0 border-r border-border">
            <Sidebar onClose={() => useWorkspace.getState().setSidebarOpen(false)} />
            <SidebarResizer />
          </aside>
        )}

        {/* Mobile drawer */}
        {isNarrow && mobileSidebarOpen && (
          <div className="fixed inset-0 z-30">
            <div
              className="animate-fade-in absolute inset-0 bg-black/30"
              onClick={() => useWorkspace.getState().setMobileSidebarOpen(false)}
            />
            <aside className="animate-slide-in-left absolute inset-y-0 left-0 w-[86vw] max-w-[340px] border-r border-border shadow-pop">
              <Sidebar closeLabel="Close" onClose={() => useWorkspace.getState().setMobileSidebarOpen(false)} />
            </aside>
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col bg-bg">
          <TopBar onOpenSearch={openSearchInNote} />
          {connection === "reconnecting" && (
            <div className="border-b border-border bg-inset px-4 py-1 text-center text-[12px] text-muted">
              Connection to ObsiDeck lost — reconnecting…
            </div>
          )}
          <div className="min-h-0 flex-1">{hasDoc ? <NoteView editorRef={editorRef} /> : <EmptyState />}</div>
        </main>
      </div>

      <CommandPalette commands={commands} />
      <EntryDialogs />
      <Toaster
        position={isNarrow ? "top-center" : "bottom-right"}
        theme={theme}
        toastOptions={{
          classNames: {
            toast: "!bg-elevated !text-fg !border-0 !shadow-pop !rounded-lg !text-[13px] !font-sans",
            description: "!text-muted",
            actionButton: "!bg-accent !text-accent-fg",
          },
        }}
      />
    </TooltipProvider>
  );
}

function focusSidebarSearch() {
  const s = useWorkspace.getState();
  if (window.matchMedia("(max-width: 767px)").matches) s.setMobileSidebarOpen(true);
  else s.setSidebarOpen(true);
  requestAnimationFrame(() => document.getElementById("sidebar-search")?.focus());
}
