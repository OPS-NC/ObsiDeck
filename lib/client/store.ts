"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { FolderNode } from "../types";
import { buildNoteIndex, type NoteIndex } from "../markdown/links";
import { collectFolders, collectNotes } from "./paths";

export type ViewMode = "edit" | "preview" | "split";

export type DocStatus = "loading" | "saved" | "dirty" | "saving" | "error" | "conflict" | "missing";

export interface DocState {
  path: string;
  /** Current editor text. */
  content: string;
  /** Last content known to be on disk, and its version (sha256 prefix). */
  savedContent: string;
  version: string;
  status: DocStatus;
  error: string | null;
  /** Disk version kept aside while a conflict is pending. */
  external: { content: string; version: string } | null;
  /** Incremented when `content` is replaced from outside the editor. */
  epoch: number;
}

export interface Reveal {
  line?: number;
  heading?: string;
  nonce: number;
}

export type DialogState =
  | { kind: "new-note"; folder: string }
  | { kind: "new-folder"; folder: string }
  | { kind: "rename"; path: string; isFolder: boolean }
  | { kind: "delete"; path: string; isFolder: boolean };

export type PaletteMode = "files" | "commands";

interface WorkspaceState {
  vaultName: string;
  tree: FolderNode | null;
  notePaths: string[];
  noteIndex: NoteIndex;
  folders: string[];
  treeError: string | null;

  activePath: string | null;
  doc: DocState | null;
  reveal: Reveal | null;

  // Persisted preferences
  mode: ViewMode;
  sidebarOpen: boolean;
  sidebarWidth: number;
  lineNumbers: boolean;
  expanded: Record<string, true>;

  mobileSidebarOpen: boolean;
  palette: PaletteMode | null;
  dialog: DialogState | null;
  sidebarQuery: string;

  setTree: (vaultName: string, tree: FolderNode) => void;
  setTreeError: (error: string | null) => void;
  setMode: (mode: ViewMode) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleLineNumbers: () => void;
  toggleFolder: (path: string, open?: boolean) => void;
  expandMany: (paths: string[]) => void;
  setPalette: (mode: PaletteMode | null) => void;
  setDialog: (dialog: DialogState | null) => void;
  setSidebarQuery: (query: string) => void;
  setReveal: (reveal: Omit<Reveal, "nonce"> | null) => void;
  setDoc: (doc: DocState | null) => void;
  patchDoc: (patch: Partial<DocState>) => void;
  setActivePath: (path: string | null) => void;
}

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 520;

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      vaultName: "",
      tree: null,
      notePaths: [],
      noteIndex: buildNoteIndex([]),
      folders: [],
      treeError: null,

      activePath: null,
      doc: null,
      reveal: null,

      // Notes open read-only; editing is an explicit choice (reset on every note switch).
      mode: "preview",
      sidebarOpen: true,
      sidebarWidth: 272,
      lineNumbers: false,
      expanded: {},

      mobileSidebarOpen: false,
      palette: null,
      dialog: null,
      sidebarQuery: "",

      setTree: (vaultName, tree) => {
        const notePaths = collectNotes(tree);
        set({
          vaultName,
          tree,
          notePaths,
          noteIndex: buildNoteIndex(notePaths),
          folders: collectFolders(tree),
          treeError: null,
        });
      },
      setTreeError: (treeError) => set({ treeError }),
      setMode: (mode) => set({ mode }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width))) }),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
      toggleLineNumbers: () => set((s) => ({ lineNumbers: !s.lineNumbers })),
      toggleFolder: (path, open) =>
        set((s) => {
          const isOpen = Boolean(s.expanded[path]);
          const next = open ?? !isOpen;
          if (next === isOpen) return s;
          const expanded = { ...s.expanded };
          if (next) expanded[path] = true;
          else delete expanded[path];
          return { expanded };
        }),
      expandMany: (paths) =>
        set((s) => {
          if (paths.every((p) => s.expanded[p])) return s;
          const expanded = { ...s.expanded };
          for (const p of paths) expanded[p] = true;
          return { expanded };
        }),
      setPalette: (palette) => set({ palette }),
      setDialog: (dialog) => set({ dialog }),
      setSidebarQuery: (sidebarQuery) => set({ sidebarQuery }),
      setReveal: (reveal) => set({ reveal: reveal ? { ...reveal, nonce: Date.now() + Math.random() } : null }),
      setDoc: (doc) => set({ doc }),
      patchDoc: (patch) => set((s) => (s.doc ? { doc: { ...s.doc, ...patch } } : s)),
      setActivePath: (activePath) => set({ activePath }),
    }),
    {
      name: "obsideck:workspace",
      // v2: the view mode is no longer persisted.
      version: 2,
      migrate: (persisted) => {
        const { mode: _mode, ...rest } = (persisted ?? {}) as Record<string, unknown>;
        return rest as Partial<WorkspaceState>;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sidebarOpen: s.sidebarOpen,
        sidebarWidth: s.sidebarWidth,
        lineNumbers: s.lineNumbers,
        expanded: s.expanded,
      }),
    },
  ),
);
