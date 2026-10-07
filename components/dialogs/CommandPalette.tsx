"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import { Dialog as RDialog } from "radix-ui";
import { CornerDownLeft, FileText, TextSearch } from "lucide-react";
import { useWorkspace } from "@/lib/client/store";
import { openNote } from "@/lib/client/actions";
import { fuzzyScore } from "@/lib/client/fuzzy";
import { basename, dirname, stripMd } from "@/lib/client/paths";
import { useContentSearch } from "../sidebar/SearchPanel";
import { Kbd } from "../ui/primitives";

export interface PaletteCommand {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  run: () => void;
}

const MAX_FILES = 50;

/**
 * Quick open (⌘P) and command palette (⌘⇧P, or ">" prefix like VS Code).
 * Filtering is done here (fuzzy) rather than by cmdk to stay fast on big vaults.
 */
export function CommandPalette({ commands }: { commands: PaletteCommand[] }) {
  const mode = useWorkspace((s) => s.palette);
  const setPalette = useWorkspace((s) => s.setPalette);
  const open = mode !== null;

  return (
    <RDialog.Root open={open} onOpenChange={(o) => !o && setPalette(null)}>
      <RDialog.Portal>
        <RDialog.Overlay className="animate-fade-in fixed inset-0 z-40 bg-black/20 dark:bg-black/45" />
        <RDialog.Content
          aria-describedby={undefined}
          className="animate-pop-in fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-[600px] -translate-x-1/2 overflow-hidden rounded-xl bg-elevated shadow-pop outline-none"
        >
          <RDialog.Title className="sr-only">{mode === "commands" ? "Command palette" : "Quick open"}</RDialog.Title>
          {open && <PaletteBody initialQuery={mode === "commands" ? ">" : ""} commands={commands} onDone={() => setPalette(null)} />}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

function PaletteBody({
  initialQuery,
  commands,
  onDone,
}: {
  initialQuery: string;
  commands: PaletteCommand[];
  onDone: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const notePaths = useWorkspace((s) => s.notePaths);
  const isCommand = query.startsWith(">");
  const text = isCommand ? query.slice(1).trim() : query.trim();

  const files = useMemo(() => {
    if (isCommand) return [];
    if (!text) return notePaths.slice(0, MAX_FILES);
    return notePaths
      .map((p) => ({ p, m: fuzzyScore(text, stripMd(p)) }))
      .filter((r) => r.m)
      .sort((a, b) => b.m!.score - a.m!.score)
      .slice(0, MAX_FILES)
      .map((r) => r.p);
  }, [notePaths, text, isCommand]);

  const filteredCommands = useMemo(() => {
    if (!isCommand) return [];
    return commands
      .map((c) => ({ c, m: fuzzyScore(text, c.label) }))
      .filter((r) => r.m)
      .sort((a, b) => b.m!.score - a.m!.score)
      .map((r) => r.c);
  }, [commands, text, isCommand]);

  const content = useContentSearch(!isCommand && text.length >= 3 ? text : "", 220);

  const run = (fn: () => void) => {
    onDone();
    fn();
  };

  return (
    <Command shouldFilter={false} loop className="flex max-h-[min(560px,70vh)] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder={isCommand ? "Run a command…" : "Search notes by name…  (type > for commands)"}
          className="h-12 flex-1 bg-transparent text-[14.5px] text-fg outline-none placeholder:text-subtle focus-visible:outline-none"
        />
        <Kbd keys="Esc" />
      </div>
      <Command.List className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-subtle">
        <Command.Empty className="px-3 py-8 text-center text-[13px] text-subtle">
          {content.loading ? "Searching…" : "No results"}
        </Command.Empty>

        {filteredCommands.length > 0 && (
          <Command.Group heading="Commands">
            {filteredCommands.map((c) => (
              <Item key={c.id} value={`cmd:${c.id}`} onSelect={() => run(c.run)}>
                <span className="text-muted [&_svg]:size-4">{c.icon}</span>
                <span className="flex-1 truncate">{c.label}</span>
                {c.shortcut && <Kbd keys={c.shortcut} />}
              </Item>
            ))}
          </Command.Group>
        )}

        {files.length > 0 && (
          <Command.Group heading={text ? "Notes" : "All notes"}>
            {files.map((path) => (
              <Item key={path} value={`file:${path}`} onSelect={() => run(() => void openNote(path))}>
                <FileText className="size-4 shrink-0 text-subtle" />
                <span className="truncate">{stripMd(basename(path))}</span>
                <span className="ml-auto truncate pl-3 text-[12px] text-subtle">{dirname(path)}</span>
              </Item>
            ))}
          </Command.Group>
        )}

        {content.hits.length > 0 && (
          <Command.Group heading="Content">
            {content.hits.slice(0, 15).map((hit) => (
              <Item
                key={`c:${hit.path}`}
                value={`content:${hit.path}`}
                onSelect={() => run(() => void openNote(hit.path, { line: hit.line || undefined }))}
              >
                <TextSearch className="size-4 shrink-0 text-subtle" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{stripMd(hit.name)}</span>
                  <span className="block truncate text-[12px] text-muted">{hit.snippet}</span>
                </span>
              </Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
      <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11.5px] text-subtle">
        <span className="flex items-center gap-1.5">
          <Kbd keys="↑" />
          <Kbd keys="↓" /> navigate
        </span>
        <span className="flex items-center gap-1.5">
          <CornerDownLeft className="size-3" /> open
        </span>
      </div>
    </Command>
  );
}

function Item({ value, onSelect, children }: { value: string; onSelect: () => void; children: ReactNode }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-auto min-h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] text-fg data-[selected=true]:bg-accent-soft"
    >
      {children}
    </Command.Item>
  );
}
