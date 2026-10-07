"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip as RTooltip } from "radix-ui";
import clsx from "clsx";
import { isMac } from "@/lib/client/hooks";

export function cn(...args: Parameters<typeof clsx>) {
  return clsx(...args);
}

/** Renders a shortcut like "Mod+Shift+P" with platform symbols. */
export function Kbd({ keys, className }: { keys: string; className?: string }) {
  const mac = isMac();
  const parts = keys.split("+").map((k) => {
    if (k === "Mod") return mac ? "⌘" : "Ctrl";
    if (k === "Shift") return mac ? "⇧" : "Shift";
    if (k === "Alt") return mac ? "⌥" : "Alt";
    if (k === "Enter") return "↵";
    return k;
  });
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-sans text-[11px] text-subtle", className)}>
      {parts.map((p, i) => (
        <kbd
          key={i}
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-border bg-inset px-1 font-sans text-[10.5px] leading-none text-muted"
        >
          {p}
        </kbd>
      ))}
    </span>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RTooltip.Provider delayDuration={450} skipDelayDuration={200}>
      {children}
    </RTooltip.Provider>
  );
}

export function Tooltip({
  label,
  shortcut,
  side = "bottom",
  children,
}: {
  label: string;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="animate-fade-in z-50 flex items-center gap-2 rounded-md bg-elevated px-2 py-1 text-[12px] text-fg shadow-pop select-none"
        >
          {label}
          {shortcut && <Kbd keys={shortcut} />}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  shortcut?: string;
  active?: boolean;
  tooltipSide?: "top" | "bottom" | "left" | "right";
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, active, tooltipSide, className, children, ...props },
  ref,
) {
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-100",
          "hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40",
          active && "bg-active text-fg",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  );
});

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors duration-100 disabled:opacity-50",
        variant === "primary" && "bg-accent text-accent-fg hover:bg-accent-hover",
        variant === "secondary" && "border border-border-strong bg-elevated text-fg hover:bg-hover",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-fg",
        className,
      )}
      {...props}
    />
  );
}
