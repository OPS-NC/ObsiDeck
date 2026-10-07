"use client";

import { Fragment } from "react";
import {
  Columns2,
  Eye,
  FileText,
  ListOrdered,
  Menu,
  Moon,
  MoreHorizontal,
  PanelLeftOpen,
  Pencil,
  Search,
  Sun,
  Trash2,
  TextCursorInput,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useWorkspace, type ViewMode } from "@/lib/client/store";
import { useMediaQuery, useTheme } from "@/lib/client/hooks";
import { flushSave } from "@/lib/client/actions";
import { ancestors, stripMd } from "@/lib/client/paths";
import { IconButton, cn } from "../ui/primitives";
import { DropdownMenu, type MenuEntry } from "../ui/menu";
import { SaveIndicator } from "./SaveIndicator";

const MODES: { mode: ViewMode; label: string; icon: typeof Pencil; shortcut: string }[] = [
  { mode: "edit", label: "Edit", icon: Pencil, shortcut: "Mod+Alt+1" },
  { mode: "split", label: "Split", icon: Columns2, shortcut: "Mod+Alt+2" },
  { mode: "preview", label: "Preview", icon: Eye, shortcut: "Mod+Alt+3" },
];

export function TopBar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { activePath, mode, sidebarOpen, hasDoc } = useWorkspace(
    useShallow((s) => ({ activePath: s.activePath, mode: s.mode, sidebarOpen: s.sidebarOpen, hasDoc: Boolean(s.doc) })),
  );
  const [theme, setTheme] = useTheme();
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const showSidebarButton = isNarrow || !sidebarOpen;

  const revealFolder = (folder: string) => {
    const s = useWorkspace.getState();
    s.expandMany([...ancestors(`${folder}/x`)]);
    s.setSidebarQuery("");
    if (isNarrow) s.setMobileSidebarOpen(true);
    else s.setSidebarOpen(true);
  };

  const menu: MenuEntry[] = [
    { label: "Quick open", icon: <Search />, shortcut: "Mod+P", onSelect: () => useWorkspace.getState().setPalette("files") },
    { label: "Command palette", icon: <TextCursorInput />, shortcut: "Mod+Shift+P", onSelect: () => useWorkspace.getState().setPalette("commands") },
    "separator",
    { label: "Toggle line numbers", icon: <ListOrdered />, onSelect: () => useWorkspace.getState().toggleLineNumbers() },
    ...(activePath
      ? ([
          "separator",
          { label: "Find in note", icon: <Search />, shortcut: "Mod+F", onSelect: onOpenSearch },
          { label: "Save now", icon: <FileText />, shortcut: "Mod+S", onSelect: () => void flushSave() },
          {
            label: "Delete note",
            icon: <Trash2 />,
            danger: true,
            onSelect: () => useWorkspace.getState().setDialog({ kind: "delete", path: activePath, isFolder: false }),
          },
        ] satisfies MenuEntry[])
      : []),
  ];

  const parts = activePath ? activePath.split("/") : [];

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 md:px-3">
      {showSidebarButton && (
        <IconButton
          label="Show sidebar"
          shortcut={isNarrow ? undefined : "Mod+\\"}
          onClick={() =>
            isNarrow ? useWorkspace.getState().setMobileSidebarOpen(true) : useWorkspace.getState().setSidebarOpen(true)
          }
        >
          {isNarrow ? <Menu className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </IconButton>
      )}

      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center text-[13px]">
        {parts.map((part, i) => {
          const isLast = i === parts.length - 1;
          const folder = parts.slice(0, i + 1).join("/");
          return (
            <Fragment key={folder}>
              {i > 0 && <span className="mx-1.5 shrink-0 text-subtle">/</span>}
              {isLast ? (
                <span className="truncate font-medium text-fg" title={activePath ?? undefined}>
                  {stripMd(part)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => revealFolder(folder)}
                  className={cn("shrink truncate rounded px-1 py-0.5 text-muted hover:bg-hover hover:text-fg", i < parts.length - 3 && "hidden sm:block")}
                >
                  {part}
                </button>
              )}
            </Fragment>
          );
        })}
        {hasDoc && <SaveIndicator />}
      </nav>

      {hasDoc && (
        <div role="radiogroup" aria-label="View mode" className="flex items-center rounded-lg bg-active p-0.5">
          {MODES.filter((m) => !(isNarrow && m.mode === "split")).map(({ mode: m, label, icon: Icon, shortcut }) => (
            <IconButton
              key={m}
              role="radio"
              aria-checked={mode === m}
              label={label}
              shortcut={shortcut}
              onClick={() => useWorkspace.getState().setMode(m)}
              className={cn("h-6 w-7 rounded-md", mode === m ? "bg-elevated text-fg shadow-sm" : "hover:bg-transparent")}
            >
              <Icon className="size-[14px]" />
            </IconButton>
          ))}
        </div>
      )}

      <IconButton
        label={theme === "dark" ? "Light mode" : "Dark mode"}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </IconButton>
      <DropdownMenu entries={menu}>
        <IconButton label="More">
          <MoreHorizontal className="size-4" />
        </IconButton>
      </DropdownMenu>
    </header>
  );
}
