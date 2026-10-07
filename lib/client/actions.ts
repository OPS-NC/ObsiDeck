"use client";

import { toast } from "sonner";
import { api, errorMessage, RequestError } from "./api";
import { ancestors, basename, dirname, ensureMd, joinPath } from "./paths";
import { useWorkspace, type DocState } from "./store";
import type { NoteResponse, VaultEvent } from "../types";

const AUTOSAVE_DELAY_MS = 700;
const RETRY_DELAY_MS = 4000;

const get = useWorkspace.getState;

// ───────────────────────────── Tree ─────────────────────────────

let treeRequest: Promise<void> | null = null;
let treeRefreshQueued = false;

export async function refreshTree(): Promise<void> {
  if (treeRequest) {
    treeRefreshQueued = true;
    return treeRequest;
  }
  treeRequest = (async () => {
    try {
      const res = await api.tree();
      get().setTree(res.vaultName, res.root);
    } catch (err) {
      get().setTreeError(errorMessage(err));
    } finally {
      treeRequest = null;
      if (treeRefreshQueued) {
        treeRefreshQueued = false;
        void refreshTree();
      }
    }
  })();
  return treeRequest;
}

// ───────────────────────────── URL ─────────────────────────────

function noteUrl(path: string | null): string {
  const url = new URL(window.location.href);
  if (path) url.searchParams.set("note", path);
  else url.searchParams.delete("note");
  url.hash = "";
  return url.pathname + url.search;
}

export function noteFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get("note");
}

// ───────────────────────────── Open ─────────────────────────────

let openController: AbortController | null = null;

export interface OpenOptions {
  line?: number;
  heading?: string;
  /** Do not push a browser history entry (used on popstate / initial load). */
  replaceHistory?: boolean;
  fromHistory?: boolean;
}

function docFromNote(note: NoteResponse): DocState {
  return {
    path: note.path,
    content: note.content,
    savedContent: note.content,
    version: note.version,
    status: "saved",
    error: null,
    external: null,
    epoch: 0,
  };
}

export async function openNote(path: string, options: OpenOptions = {}): Promise<void> {
  const state = get();
  const reveal = options.line || options.heading ? { line: options.line, heading: options.heading } : null;

  if (state.doc?.path === path && state.doc.status !== "loading") {
    state.setReveal(reveal);
    closeMobileSidebar();
    return;
  }
  if (!(await leaveCurrentNote())) return;

  openController?.abort();
  const controller = new AbortController();
  openController = controller;

  state.setActivePath(path);
  state.setMode("preview");
  state.expandMany(ancestors(path));
  state.setDoc({
    path,
    content: "",
    savedContent: "",
    version: "",
    status: "loading",
    error: null,
    external: null,
    epoch: 0,
  });
  closeMobileSidebar();

  if (!options.fromHistory) {
    const url = noteUrl(path);
    if (options.replaceHistory) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }

  try {
    const note = await api.readNote(path, controller.signal);
    if (openController !== controller) return;
    get().setDoc(docFromNote(note));
    get().setReveal(reveal);
    document.title = `${basename(path).replace(/\.md$/i, "")} · ObsiDeck`;
  } catch (err) {
    if (controller.signal.aborted) return;
    get().patchDoc({ status: "error", error: errorMessage(err) });
    if (err instanceof RequestError && err.status === 404) {
      toast.error("Note not found", { description: path });
    }
  }
}

export function closeNote(): void {
  get().setDoc(null);
  get().setActivePath(null);
  document.title = "ObsiDeck";
  window.history.replaceState(null, "", noteUrl(null));
}

/**
 * Leaves the open note for the home page. Pending edits are saved first; if
 * they cannot be (conflict, deleted note, save error) the note stays open.
 */
export async function goHome(): Promise<void> {
  const doc = get().doc;
  closeMobileSidebar();
  if (!doc) return;
  if (doc.status === "conflict") {
    toast.warning("Resolve the conflict on this note first");
    return;
  }
  await flushSave();
  const after = get().doc;
  if (!after || after.path !== doc.path) return;
  if (after.content !== after.savedContent) {
    toast.warning("This note has unsaved changes", { description: after.error ?? undefined });
    return;
  }
  openController?.abort();
  get().setDoc(null);
  get().setActivePath(null);
  document.title = "ObsiDeck";
  window.history.pushState(null, "", noteUrl(null));
}

/** Flushes pending changes before switching notes. Returns false to cancel. */
async function leaveCurrentNote(): Promise<boolean> {
  const doc = get().doc;
  if (!doc) return true;
  if (doc.status === "conflict") {
    toast.warning("Resolve the conflict on the current note first");
    return false;
  }
  await flushSave();
  const after = get().doc;
  if (after && after.content !== after.savedContent && after.status !== "missing") {
    return window.confirm("Your latest changes could not be saved. Leave this note anyway?");
  }
  return true;
}

function closeMobileSidebar(): void {
  if (get().mobileSidebarOpen) get().setMobileSidebarOpen(false);
}

// ───────────────────────────── Edit & save ─────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

export function updateContent(content: string): void {
  const doc = get().doc;
  if (!doc || doc.status === "loading") return;
  if (content === doc.content) return;
  const dirty = content !== doc.savedContent;
  const status = doc.status === "conflict" || doc.status === "missing" || doc.status === "saving" ? doc.status : dirty ? "dirty" : "saved";
  get().patchDoc({ content, status });
  scheduleSave();
}

/** Replaces the document content from outside the editor (task toggles, reload). */
export function replaceContent(content: string): void {
  const doc = get().doc;
  if (!doc) return;
  get().patchDoc({ content, epoch: doc.epoch + 1, status: content === doc.savedContent ? "saved" : "dirty" });
  scheduleSave();
}

function scheduleSave(delay = AUTOSAVE_DELAY_MS): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveNow();
  }, delay);
}

export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await saveNow();
  // A second pass covers edits made while the first request was in flight.
  if (get().doc && get().doc!.content !== get().doc!.savedContent) await saveNow();
}

export async function saveNow(): Promise<void> {
  // Loop: several callers may be waiting on the same request.
  while (inflight) await inflight;
  const doc = get().doc;
  if (!doc || doc.status === "loading" || doc.status === "conflict" || doc.status === "missing") return;
  if (doc.content === doc.savedContent) {
    if (doc.status !== "saved") get().patchDoc({ status: "saved", error: null });
    return;
  }

  const { path, content, version } = doc;
  get().patchDoc({ status: "saving" });
  inflight = (async () => {
    try {
      const res = await api.saveNote(path, content, version);
      const current = get().doc;
      if (!current || current.path !== path) return;
      const stillDirty = current.content !== content;
      get().patchDoc({
        savedContent: content,
        version: res.version,
        status: stillDirty ? "dirty" : "saved",
        error: null,
      });
      if (stillDirty) scheduleSave();
    } catch (err) {
      const current = get().doc;
      if (!current || current.path !== path) return;
      if (err instanceof RequestError && err.code === "CONFLICT") {
        await enterConflict(path);
      } else if (err instanceof RequestError && err.status === 404) {
        get().patchDoc({ status: "missing", error: "This note no longer exists on disk" });
      } else {
        get().patchDoc({ status: "error", error: errorMessage(err) });
        scheduleSave(RETRY_DELAY_MS);
      }
    }
  })();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}

async function enterConflict(path: string): Promise<void> {
  try {
    const disk = await api.readNote(path);
    if (get().doc?.path !== path) return;
    get().patchDoc({ status: "conflict", external: { content: disk.content, version: disk.version } });
  } catch (err) {
    if (err instanceof RequestError && err.status === 404) {
      get().patchDoc({ status: "missing", error: "This note no longer exists on disk" });
    }
  }
}

/** Conflict resolution: discard local edits and load the disk version. */
export function reloadFromDisk(): void {
  const doc = get().doc;
  if (!doc?.external) return;
  get().patchDoc({
    content: doc.external.content,
    savedContent: doc.external.content,
    version: doc.external.version,
    external: null,
    status: "saved",
    error: null,
    epoch: doc.epoch + 1,
  });
}

/** Conflict resolution: overwrite the disk version with the local text. */
export async function keepMyVersion(): Promise<void> {
  const doc = get().doc;
  if (!doc?.external) return;
  get().patchDoc({
    version: doc.external.version,
    savedContent: doc.external.content,
    external: null,
    status: "dirty",
  });
  await saveNow();
}

/** Re-creates a note that was deleted on disk while open. */
export async function recreateMissingNote(): Promise<void> {
  const doc = get().doc;
  if (!doc || doc.status !== "missing") return;
  try {
    const res = await api.createNote(doc.path, doc.content);
    get().patchDoc({ status: "saved", savedContent: doc.content, version: res.version, error: null });
    void refreshTree();
    toast.success("Note restored");
  } catch (err) {
    toast.error("Could not restore note", { description: errorMessage(err) });
  }
}

// ───────────────────────────── External changes ─────────────────────────────

let treeRefreshTimer: ReturnType<typeof setTimeout> | null = null;

export function handleVaultEvents(events: VaultEvent[]): void {
  if (events.some((e) => e.kind !== "change")) {
    if (treeRefreshTimer) clearTimeout(treeRefreshTimer);
    treeRefreshTimer = setTimeout(() => void refreshTree(), 100);
  }
  const doc = get().doc;
  if (doc && events.some((e) => e.path === doc.path)) {
    void checkActiveNote();
  }
}

/** Compares the open note with the disk after an external event. */
export async function checkActiveNote(): Promise<void> {
  const doc = get().doc;
  if (!doc || doc.status === "loading") return;
  if (inflight) await inflight;

  let disk: NoteResponse;
  try {
    disk = await api.readNote(doc.path);
  } catch (err) {
    if (err instanceof RequestError && err.status === 404 && get().doc?.path === doc.path) {
      get().patchDoc({ status: "missing", error: "This note was deleted or moved outside ObsiDeck" });
    }
    return;
  }

  const current = get().doc;
  if (!current || current.path !== disk.path) return;
  if (current.status === "missing") {
    // The note came back (e.g. restored or re-synced by iCloud).
    const same = current.content === disk.content;
    get().patchDoc(
      same
        ? { status: "saved", error: null, savedContent: disk.content, version: disk.version }
        : { status: "conflict", error: null, external: { content: disk.content, version: disk.version } },
    );
    return;
  }
  if (disk.version === current.version) return; // our own write
  if (disk.content === current.content) {
    get().patchDoc({ savedContent: disk.content, version: disk.version, status: "saved" });
    return;
  }
  const hasLocalChanges = current.content !== current.savedContent || current.status === "saving";
  if (hasLocalChanges) {
    get().patchDoc({ status: "conflict", external: { content: disk.content, version: disk.version } });
  } else {
    get().patchDoc({
      content: disk.content,
      savedContent: disk.content,
      version: disk.version,
      status: "saved",
      epoch: current.epoch + 1,
    });
    toast("Reloaded from disk", { description: "The note was modified outside ObsiDeck", duration: 2500 });
  }
}

// ───────────────────────────── File operations ─────────────────────────────

export async function createNote(folder: string, rawName: string): Promise<void> {
  const path = joinPath(folder, ensureMd(rawName.trim()));
  try {
    await api.createNote(path, "");
    await refreshTree();
    get().expandMany([...ancestors(path)]);
    await openNote(path);
    // A freshly created note is opened for writing.
    get().setMode("edit");
    toast.success("Note created", { description: path });
  } catch (err) {
    toast.error("Could not create note", { description: errorMessage(err) });
    throw err;
  }
}

export async function createFolder(parent: string, name: string): Promise<void> {
  const path = joinPath(parent, name.trim());
  try {
    await api.createFolder(path);
    get().expandMany([...ancestors(path), path]);
    await refreshTree();
    toast.success("Folder created", { description: path });
  } catch (err) {
    toast.error("Could not create folder", { description: errorMessage(err) });
    throw err;
  }
}

export async function renameEntry(from: string, newName: string, isFolder: boolean): Promise<void> {
  const name = isFolder ? newName.trim() : ensureMd(newName.trim());
  const to = joinPath(dirname(from), name);
  if (to === from) return;
  await flushSave();
  try {
    await api.rename(from, to);
    const doc = get().doc;
    if (doc && (doc.path === from || (isFolder && doc.path.startsWith(`${from}/`)))) {
      const nextPath = to + doc.path.slice(from.length);
      get().patchDoc({ path: nextPath });
      get().setActivePath(nextPath);
      window.history.replaceState(null, "", noteUrl(nextPath));
      document.title = `${basename(nextPath).replace(/\.md$/i, "")} · ObsiDeck`;
    }
    if (isFolder && get().expanded[from]) get().toggleFolder(to, true);
    await refreshTree();
    toast.success("Renamed", { description: to });
  } catch (err) {
    toast.error("Could not rename", { description: errorMessage(err) });
    throw err;
  }
}

export async function deleteEntry(path: string, isFolder: boolean): Promise<void> {
  try {
    if (isFolder) await api.deleteFolder(path);
    else await api.deleteNote(path);
    const doc = get().doc;
    if (doc && (doc.path === path || (isFolder && doc.path.startsWith(`${path}/`)))) {
      if (saveTimer) clearTimeout(saveTimer);
      closeNote();
    }
    await refreshTree();
    toast.success("Moved to trash", { description: `${path} → .trash` });
  } catch (err) {
    toast.error("Could not delete", { description: errorMessage(err) });
    throw err;
  }
}

/** Default folder for new notes: the folder of the open note. */
export function currentFolder(): string {
  const path = get().activePath;
  return path ? dirname(path) : "";
}

export function toggleTask(line: number): void {
  const doc = get().doc;
  if (!doc) return;
  const lines = doc.content.split("\n");
  const target = lines[line - 1];
  if (target === undefined) return;
  const toggled = target.replace(/^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/, (_m, a: string, mark: string, b: string) =>
    `${a}${mark === " " ? "x" : " "}${b}`,
  );
  if (toggled === target) return;
  lines[line - 1] = toggled;
  replaceContent(lines.join("\n"));
}
