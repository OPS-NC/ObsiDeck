"use client";

import type { ReactNode } from "react";
import { Dialog as RDialog } from "radix-ui";
import { cn } from "./primitives";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="animate-fade-in fixed inset-0 z-40 bg-black/25 dark:bg-black/50" />
        <RDialog.Content
          className={cn(
            "animate-pop-in fixed left-1/2 top-[18vh] z-50 w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 rounded-xl bg-elevated p-5 shadow-pop outline-none",
            className,
          )}
        >
          <RDialog.Title className="text-[15px] font-semibold tracking-[-0.01em]">{title}</RDialog.Title>
          {description ? (
            <RDialog.Description className="mt-1 text-[13px] leading-relaxed text-muted">{description}</RDialog.Description>
          ) : (
            <RDialog.Description className="sr-only">{title}</RDialog.Description>
          )}
          <div className="mt-4">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export const inputClass =
  "h-9 w-full rounded-md border border-border-strong bg-bg px-3 text-[13.5px] text-fg outline-none transition-colors placeholder:text-subtle focus:border-accent focus:ring-3 focus:ring-accent-soft";
