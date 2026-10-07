"use client";

import { AlertTriangle, FileWarning } from "lucide-react";
import { useWorkspace } from "@/lib/client/store";
import { closeNote, keepMyVersion, recreateMissingNote, reloadFromDisk } from "@/lib/client/actions";
import { Button } from "../ui/primitives";

/** Inline notice for conflicts (external edits vs local edits) and deleted notes. */
export function NoteBanner() {
  const status = useWorkspace((s) => s.doc?.status);

  if (status === "conflict") {
    return (
      <Banner
        icon={<AlertTriangle className="size-4 text-warning" />}
        title="Modified externally"
        text="This note changed on disk while you had unsaved edits. Nothing has been overwritten."
      >
        <Button variant="secondary" className="h-7" onClick={reloadFromDisk}>
          Reload from disk
        </Button>
        <Button variant="primary" className="h-7" onClick={() => void keepMyVersion()}>
          Keep my version
        </Button>
      </Banner>
    );
  }
  if (status === "missing") {
    return (
      <Banner
        icon={<FileWarning className="size-4 text-danger" />}
        title="Note deleted"
        text="This note no longer exists on disk. Your text is still here."
      >
        <Button variant="ghost" className="h-7" onClick={closeNote}>
          Close
        </Button>
        <Button variant="primary" className="h-7" onClick={() => void recreateMissingNote()}>
          Restore
        </Button>
      </Banner>
    );
  }
  return null;
}

function Banner({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div role="alert" className="animate-fade-in flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-inset px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {icon}
        <p className="min-w-0 text-[13px]">
          <span className="font-medium">{title}</span>
          <span className="text-muted"> — {text}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
