"use client";

import type { ReactNode } from "react";
import { ContextMenu as RContextMenu, DropdownMenu as RDropdown } from "radix-ui";
import { cn, Kbd } from "./primitives";

const contentClass =
  "animate-pop-in z-50 min-w-[200px] rounded-lg bg-elevated p-1 text-[13px] text-fg shadow-pop outline-none";
const itemClass =
  "flex h-8 cursor-default select-none items-center gap-2.5 rounded-md px-2 outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-40 [&_svg]:size-[15px] [&_svg]:text-muted";

export interface MenuItemSpec {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  onSelect: () => void;
}

export type MenuEntry = MenuItemSpec | "separator";

function Items({ entries, kind }: { entries: MenuEntry[]; kind: "context" | "dropdown" }) {
  const Item = kind === "context" ? RContextMenu.Item : RDropdown.Item;
  const Separator = kind === "context" ? RContextMenu.Separator : RDropdown.Separator;
  return (
    <>
      {entries.map((entry, i) =>
        entry === "separator" ? (
          <Separator key={`sep-${i}`} className="mx-1 my-1 h-px bg-border" />
        ) : (
          <Item
            key={entry.label}
            onSelect={entry.onSelect}
            className={cn(itemClass, entry.danger && "text-danger [&_svg]:!text-danger")}
          >
            {entry.icon}
            <span className="flex-1">{entry.label}</span>
            {entry.shortcut && <Kbd keys={entry.shortcut} />}
          </Item>
        ),
      )}
    </>
  );
}

export function ContextMenu({ entries, children }: { entries: MenuEntry[]; children: ReactNode }) {
  return (
    <RContextMenu.Root>
      <RContextMenu.Trigger asChild>{children}</RContextMenu.Trigger>
      <RContextMenu.Portal>
        <RContextMenu.Content className={contentClass}>
          <Items entries={entries} kind="context" />
        </RContextMenu.Content>
      </RContextMenu.Portal>
    </RContextMenu.Root>
  );
}

export function DropdownMenu({
  entries,
  children,
  align = "end",
}: {
  entries: MenuEntry[];
  children: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <RDropdown.Root>
      <RDropdown.Trigger asChild>{children}</RDropdown.Trigger>
      <RDropdown.Portal>
        <RDropdown.Content align={align} sideOffset={6} className={contentClass}>
          <Items entries={entries} kind="dropdown" />
        </RDropdown.Content>
      </RDropdown.Portal>
    </RDropdown.Root>
  );
}
