"use client";

import { memo, useMemo, useRef, useEffect, useState, type KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useWorkspace, type DialogState } from "@/lib/client/store";
import { openNote } from "@/lib/client/actions";
import { dirname, stripMd } from "@/lib/client/paths";
import type { FolderNode, TreeNode } from "@/lib/types";
import { ContextMenu, type MenuEntry } from "../ui/menu";
import { cn } from "../ui/primitives";

const ROW_HEIGHT = 28;

interface Row {
  node: TreeNode;
  depth: number;
}

function flatten(root: FolderNode, expanded: Record<string, true>): Row[] {
  const rows: Row[] = [];
  const walk = (folder: FolderNode, depth: number) => {
    for (const child of folder.children) {
      rows.push({ node: child, depth });
      if (child.type === "folder" && expanded[child.path]) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

/** Virtualized file tree: only visible rows are rendered, so large vaults stay fast. */
export function FileTree() {
  const { tree, expanded, activePath } = useWorkspace(
    useShallow((s) => ({ tree: s.tree, expanded: s.expanded, activePath: s.activePath })),
  );
  const rows = useMemo(() => (tree ? flatten(tree, expanded) : []), [tree, expanded]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Bring the active note into view when it changes (e.g. opened from quick open).
  useEffect(() => {
    if (!activePath) return;
    const index = rows.findIndex((r) => r.node.path === activePath);
    if (index !== -1) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [activePath, rows.length]);

  // Roving tabindex: the tree is a single tab stop, arrows move between rows.
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const indexOf = (path: string | null) => (path === null ? -1 : rows.findIndex((r) => r.node.path === path));
  const focusIndex = [focusedPath, activePath].map(indexOf).find((i) => i !== -1) ?? 0;

  // The target row may not be rendered until the virtualizer has scrolled to it.
  useEffect(() => {
    const path = pendingFocus.current;
    if (path === null) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
    if (el) {
      pendingFocus.current = null;
      el.focus({ preventScroll: true });
    }
  });

  const moveTo = (index: number) => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!row) return;
    pendingFocus.current = row.node.path;
    setFocusedPath(row.node.path);
    virtualizer.scrollToIndex(rows.indexOf(row), { align: "auto" });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !(e.target instanceof HTMLElement) || !e.target.dataset.path) return;
    const index = indexOf(e.target.dataset.path);
    const row = rows[index];
    if (!row) return;
    const isOpenFolder = row.node.type === "folder" && Boolean(expanded[row.node.path]);
    const { toggleFolder } = useWorkspace.getState();
    switch (e.key) {
      case "ArrowDown":
        moveTo(index + 1);
        break;
      case "ArrowUp":
        moveTo(index - 1);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(rows.length - 1);
        break;
      case "ArrowRight":
        if (row.node.type !== "folder") return;
        if (isOpenFolder) {
          if (rows[index + 1]?.depth === row.depth + 1) moveTo(index + 1);
        } else toggleFolder(row.node.path, true);
        break;
      case "ArrowLeft":
        if (isOpenFolder) toggleFolder(row.node.path, false);
        else if (row.depth > 0) moveTo(indexOf(dirname(row.node.path)));
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const rootMenu: MenuEntry[] = [
    { label: "New note", icon: <FilePlus2 />, shortcut: "Mod+N", onSelect: () => openDialog({ kind: "new-note", folder: "" }) },
    { label: "New folder", icon: <FolderPlus />, onSelect: () => openDialog({ kind: "new-folder", folder: "" }) },
  ];

  if (!tree) return <TreeSkeleton />;

  return (
    <ContextMenu entries={rootMenu}>
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-6" role="tree" aria-label="Vault files" onKeyDown={onKeyDown}>
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12.5px] text-subtle">This vault is empty.</p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]!;
              return (
                <div
                  key={row.node.path}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
                >
                  <TreeRow
                    node={row.node}
                    depth={row.depth}
                    expanded={row.node.type === "folder" && Boolean(expanded[row.node.path])}
                    active={row.node.path === activePath}
                    tabbable={item.index === focusIndex}
                    onFocusRow={setFocusedPath}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ContextMenu>
  );
}

function openDialog(dialog: DialogState) {
  useWorkspace.getState().setDialog(dialog);
}

const TreeRow = memo(function TreeRow({
  node,
  depth,
  expanded,
  active,
  tabbable,
  onFocusRow,
}: {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  active: boolean;
  tabbable: boolean;
  onFocusRow: (path: string) => void;
}) {
  const isFolder = node.type === "folder";
  const parent = isFolder ? node.path : dirname(node.path);

  const entries: MenuEntry[] = [
    { label: "New note", icon: <FilePlus2 />, onSelect: () => openDialog({ kind: "new-note", folder: parent }) },
    { label: "New folder", icon: <FolderPlus />, onSelect: () => openDialog({ kind: "new-folder", folder: parent }) },
    "separator",
    { label: "Rename", icon: <Pencil />, onSelect: () => openDialog({ kind: "rename", path: node.path, isFolder }) },
    {
      label: "Delete",
      icon: <Trash2 />,
      danger: true,
      onSelect: () => openDialog({ kind: "delete", path: node.path, isFolder }),
    },
  ];

  const onClick = () => {
    if (isFolder) useWorkspace.getState().toggleFolder(node.path);
    else void openNote(node.path);
  };

  return (
    <ContextMenu entries={entries}>
      <button
        type="button"
        role="treeitem"
        aria-expanded={isFolder ? expanded : undefined}
        aria-selected={active}
        title={node.path}
        data-path={node.path}
        tabIndex={tabbable ? 0 : -1}
        onFocus={() => onFocusRow(node.path)}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "F2") openDialog({ kind: "rename", path: node.path, isFolder });
          if ((e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) && !e.repeat) {
            openDialog({ kind: "delete", path: node.path, isFolder });
          }
        }}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={cn(
          "group flex h-[26px] w-full items-center gap-1.5 rounded-md pr-2 text-left text-[13px] transition-colors duration-75 focus-visible:outline-1 focus-visible:-outline-offset-1",
          active ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover hover:text-fg",
        )}
      >
        {isFolder ? (
          <>
            <ChevronRight
              className={cn("size-3.5 shrink-0 text-subtle transition-transform duration-150", expanded && "rotate-90")}
            />
            {expanded ? (
              <FolderOpen className="size-[15px] shrink-0 text-subtle" />
            ) : (
              <Folder className="size-[15px] shrink-0 text-subtle" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <FileText className={cn("size-[15px] shrink-0", active ? "text-accent-text" : "text-subtle")} />
          </>
        )}
        <span className={cn("truncate", isFolder && "text-fg/85", active && "font-medium")}>
          {isFolder ? node.name : stripMd(node.name)}
        </span>
      </button>
    </ContextMenu>
  );
});

function TreeSkeleton() {
  return (
    <div className="space-y-2.5 px-4 pt-3" aria-busy="true">
      {[70, 55, 80, 45, 65, 50].map((w, i) => (
        <div key={i} className="skeleton h-3" style={{ width: `${w}%`, marginLeft: i % 3 === 2 ? 16 : 0 }} />
      ))}
    </div>
  );
}
