"use client";

import { useState, type FormEvent } from "react";
import { useWorkspace, type DialogState } from "@/lib/client/store";
import { createFolder, createNote, deleteEntry, renameEntry } from "@/lib/client/actions";
import { basename, stripMd, validateName } from "@/lib/client/paths";
import { Dialog, inputClass } from "../ui/dialog";
import { Button } from "../ui/primitives";

/** New note / new folder / rename / delete dialogs, driven by the store. */
export function EntryDialogs() {
  const dialog = useWorkspace((s) => s.dialog);
  const close = () => useWorkspace.getState().setDialog(null);
  if (!dialog) return null;
  // Keyed so local form state resets for each opening.
  const key = JSON.stringify(dialog);
  switch (dialog.kind) {
    case "new-note":
    case "new-folder":
      return <CreateDialog key={key} dialog={dialog} onClose={close} />;
    case "rename":
      return <RenameDialog key={key} dialog={dialog} onClose={close} />;
    case "delete":
      return <DeleteDialog key={key} dialog={dialog} onClose={close} />;
  }
}

function CreateDialog({
  dialog,
  onClose,
}: {
  dialog: Extract<DialogState, { kind: "new-note" | "new-folder" }>;
  onClose: () => void;
}) {
  const folders = useWorkspace((s) => s.folders);
  const isNote = dialog.kind === "new-note";
  const [name, setName] = useState("");
  const [folder, setFolder] = useState(dialog.folder);
  const [busy, setBusy] = useState(false);
  const cleaned = isNote ? stripMd(name.trim()) : name.trim();
  const error = name ? validateName(cleaned) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cleaned || error) return;
    setBusy(true);
    try {
      if (isNote) await createNote(folder, cleaned);
      else await createFolder(folder, cleaned);
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={isNote ? "New note" : "New folder"}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isNote ? "Note name" : "Folder name"}
            className={inputClass}
            aria-invalid={Boolean(error)}
            spellCheck={false}
          />
          {error ? (
            <p className="mt-1.5 text-[12px] text-danger">{error}</p>
          ) : (
            isNote && <p className="mt-1.5 text-[12px] text-subtle">.md is added automatically</p>
          )}
        </div>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">Location</span>
          <select value={folder} onChange={(e) => setFolder(e.target.value)} className={`${inputClass} pr-8`}>
            <option value="">/ (vault root)</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!cleaned || Boolean(error) || busy}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RenameDialog({ dialog, onClose }: { dialog: Extract<DialogState, { kind: "rename" }>; onClose: () => void }) {
  const original = dialog.isFolder ? basename(dialog.path) : stripMd(basename(dialog.path));
  const [name, setName] = useState(original);
  const [busy, setBusy] = useState(false);
  const cleaned = dialog.isFolder ? name.trim() : stripMd(name.trim());
  const error = validateName(cleaned);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (error || cleaned === original) return onClose();
    setBusy(true);
    try {
      await renameEntry(dialog.path, cleaned, dialog.isFolder);
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={dialog.isFolder ? "Rename folder" : "Rename note"} description={dialog.path}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <input
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(error)}
            spellCheck={false}
          />
          {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}
        </div>
        <p className="text-[12px] text-subtle">Links pointing to this {dialog.isFolder ? "folder" : "note"} are not updated automatically.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={Boolean(error) || busy}>
            Rename
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ dialog, onClose }: { dialog: Extract<DialogState, { kind: "delete" }>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const name = dialog.isFolder ? basename(dialog.path) : stripMd(basename(dialog.path));

  const confirm = async () => {
    setBusy(true);
    try {
      await deleteEntry(dialog.path, dialog.isFolder);
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Delete “${name}”?`}
      description={
        dialog.isFolder
          ? "The folder and everything inside it will be moved to the vault's .trash folder."
          : "The note will be moved to the vault's .trash folder."
      }
    >
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} autoFocus>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => void confirm()} disabled={busy}>
          Delete
        </Button>
      </div>
    </Dialog>
  );
}
