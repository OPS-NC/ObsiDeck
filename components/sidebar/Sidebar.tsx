"use client";

import { useRef } from "react";
import { FilePlus2, FolderPlus, PanelLeftClose, RefreshCw, Search, X } from "lucide-react";
import { useWorkspace } from "@/lib/client/store";
import { BASE_PATH } from "@/lib/client/api";
import { currentFolder, goHome, refreshTree } from "@/lib/client/actions";
import { FileTree } from "./FileTree";
import { SearchPanel } from "./SearchPanel";
import { IconButton, Kbd, cn } from "../ui/primitives";

export function Sidebar({ onClose, closeLabel = "Hide sidebar" }: { onClose: () => void; closeLabel?: string }) {
  const vaultName = useWorkspace((s) => s.vaultName);
  const treeError = useWorkspace((s) => s.treeError);
  const query = useWorkspace((s) => s.sidebarQuery);
  const setQuery = useWorkspace((s) => s.setSidebarQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex h-12 shrink-0 items-center pl-3 pr-1.5">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => void goHome()}
            title="Home"
            className="-ml-1 flex max-w-full items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors duration-100 hover:bg-hover"
          >
            <img src={`${BASE_PATH}/logo.webp`} alt="" width={18} height={18} className="size-[18px] shrink-0 rounded-[5px]" />
            <span className="shrink-0 text-[13.5px] font-semibold tracking-[-0.01em]">ObsiDeck</span>
            {vaultName && <span className="min-w-0 truncate text-[12px] text-subtle">{vaultName}</span>}
          </button>
        </div>
        <IconButton
          label="New note" className="size-[26px]!"
          shortcut="Mod+N"
          onClick={() => useWorkspace.getState().setDialog({ kind: "new-note", folder: currentFolder() })}
        >
          <FilePlus2 className="size-4" />
        </IconButton>
        <IconButton
          label="New folder" className="size-[26px]!"
          onClick={() => useWorkspace.getState().setDialog({ kind: "new-folder", folder: currentFolder() })}
        >
          <FolderPlus className="size-4" />
        </IconButton>
        <IconButton label="Refresh" className="size-[26px]!" onClick={() => void refreshTree()}>
          <RefreshCw className="size-[15px]" />
        </IconButton>
        <IconButton label={closeLabel} className="size-[26px]!" shortcut="Mod+\" onClick={onClose}>
          <PanelLeftClose className="size-4" />
        </IconButton>
      </div>

      <div className="shrink-0 px-3 pb-2">
        <label className="group relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-subtle" />
          <input
            ref={inputRef}
            id="sidebar-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setQuery("");
                inputRef.current?.blur();
              }
            }}
            placeholder="Search notes"
            spellCheck={false}
            autoComplete="off"
            className={cn(
              "h-8 w-full rounded-md border border-transparent bg-active pl-8 pr-14 text-[13px] text-fg outline-none transition-colors",
              "placeholder:text-subtle focus:border-border-strong focus:bg-bg",
            )}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-1.5 flex size-5 items-center justify-center rounded text-subtle hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <Kbd keys="Mod+P" className="pointer-events-none absolute right-2" />
          )}
        </label>
      </div>

      {treeError && (
        <div className="mx-3 mb-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] text-danger">
          {treeError}
        </div>
      )}

      {query.trim() ? <SearchPanel query={query.trim()} /> : <FileTree />}

      <p className="shrink-0 truncate px-4 py-2 font-mono text-[10.5px] text-subtle select-text">
        {process.env.NEXT_PUBLIC_BUILD_VERSION}
        {process.env.NEXT_PUBLIC_BUILD_COMMIT && ` (${process.env.NEXT_PUBLIC_BUILD_COMMIT})`}
      </p>
    </div>
  );
}
