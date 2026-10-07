"use client";

import { useWorkspace, type DocStatus } from "@/lib/client/store";
import { cn } from "../ui/primitives";

const LABELS: Record<DocStatus, string> = {
  loading: "Loading…",
  saved: "Saved",
  dirty: "Edited",
  saving: "Saving…",
  error: "Not saved",
  conflict: "Modified externally",
  missing: "Deleted on disk",
};

const DOT: Record<DocStatus, string> = {
  loading: "bg-subtle",
  saved: "bg-success/70",
  dirty: "bg-subtle",
  saving: "bg-accent animate-pulse",
  error: "bg-danger",
  conflict: "bg-warning",
  missing: "bg-danger",
};

/** Discreet save state next to the breadcrumb. */
export function SaveIndicator() {
  const status = useWorkspace((s) => s.doc?.status);
  const error = useWorkspace((s) => s.doc?.error);
  if (!status) return null;
  return (
    <span
      role="status"
      title={error ?? LABELS[status]}
      className={cn(
        "ml-3 inline-flex shrink-0 items-center gap-1.5 text-[12px]",
        status === "error" || status === "conflict" || status === "missing" ? "text-fg" : "text-subtle",
      )}
    >
      <span className={cn("size-1.5 rounded-full transition-colors", DOT[status])} />
      <span className="hidden sm:inline">{LABELS[status]}</span>
    </span>
  );
}
