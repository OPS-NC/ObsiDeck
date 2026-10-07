import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSandbox, exists, type Sandbox } from "./helpers";
import { VaultError } from "@/lib/security/errors";
import {
  contentVersion,
  createFolder,
  createNote,
  readNote,
  renameEntry,
  trashEntry,
  writeNote,
} from "@/lib/filesystem/notes";
import { scanVault } from "@/lib/filesystem/tree";
import { resolveAsset } from "@/lib/filesystem/assets";
import { NoteSearch } from "@/lib/filesystem/search";

let sb: Sandbox;

beforeEach(async () => {
  sb = await createSandbox();
});

afterEach(async () => {
  await sb.cleanup();
});

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((err: unknown) => err instanceof VaultError && err.code === code);
}

const TRAVERSALS = ["../../etc/passwd", "../foo", "/foo/bar", "folder/../../../etc/passwd", "../outside/secret.md"];

describe("vault containment", () => {
  it.each(TRAVERSALS)("readNote rejects %j", async (input) => {
    await expect(readNote(sb.vault, input)).rejects.toBeInstanceOf(VaultError);
  });

  it.each(TRAVERSALS)("createNote rejects %j", async (input) => {
    await expect(createNote(sb.vault, `${input}.md`)).rejects.toBeInstanceOf(VaultError);
  });

  it.each(TRAVERSALS)("writeNote rejects %j", async (input) => {
    await expect(writeNote(sb.vault, input, "pwned")).rejects.toBeInstanceOf(VaultError);
  });

  it.each(TRAVERSALS)("trashEntry rejects %j", async (input) => {
    await expect(trashEntry(sb.vault, input)).rejects.toBeInstanceOf(VaultError);
  });

  it.each(TRAVERSALS)("renameEntry rejects %j as source and destination", async (input) => {
    await expect(renameEntry(sb.vault, input, "x.md")).rejects.toBeInstanceOf(VaultError);
    await expect(renameEntry(sb.vault, "Welcome.md", input)).rejects.toBeInstanceOf(VaultError);
    expect(await exists(path.join(sb.vaultRoot, "Welcome.md"))).toBe(true);
  });

  it("rejects reading through a symlinked folder pointing outside", async () => {
    await expectCode(readNote(sb.vault, "escape/secret.md"), "FORBIDDEN");
  });

  it("rejects reading a symlinked file pointing outside", async () => {
    await expectCode(readNote(sb.vault, "secret-link.md"), "FORBIDDEN");
  });

  it("rejects writing through symlinks pointing outside", async () => {
    await expectCode(writeNote(sb.vault, "secret-link.md", "pwned"), "FORBIDDEN");
    await expectCode(createNote(sb.vault, "escape/new.md"), "FORBIDDEN");
    await expectCode(createFolder(sb.vault, "escape/dir"), "FORBIDDEN");
    expect(await fs.readFile(path.join(sb.outside, "secret.md"), "utf8")).toBe("TOP SECRET");
    expect(await exists(path.join(sb.outside, "new.md"))).toBe(false);
  });

  it("rejects moving vault content outside through a symlink", async () => {
    await expectCode(renameEntry(sb.vault, "Welcome.md", "escape/Welcome.md"), "FORBIDDEN");
    expect(await exists(path.join(sb.outside, "Welcome.md"))).toBe(false);
  });

  it("refuses hidden folders like .obsidian", async () => {
    await expectCode(writeNote(sb.vault, ".obsidian/app.json", "{}"), "FORBIDDEN");
    await expectCode(trashEntry(sb.vault, ".obsidian"), "FORBIDDEN");
  });

  it("refuses non-markdown files through the note API", async () => {
    await expectCode(readNote(sb.vault, "Assets/diagram.png"), "UNSUPPORTED_TYPE");
    await expectCode(createNote(sb.vault, "evil.sh"), "UNSUPPORTED_TYPE");
  });
});

describe("read / create / write", () => {
  it("reads a note with a content version", async () => {
    const note = await readNote(sb.vault, "Projects/Infra/Kubernetes.md");
    expect(note.path).toBe("Projects/Infra/Kubernetes.md");
    expect(note.content).toBe("# Cluster\n\nnodes: 3\n");
    expect(note.version).toBe(contentVersion(note.content));
  });

  it("returns NOT_FOUND for missing notes", async () => {
    await expectCode(readNote(sb.vault, "Nope.md"), "NOT_FOUND");
    await expectCode(readNote(sb.vault, "Nope/Nope.md"), "NOT_FOUND");
  });

  it("creates a note and refuses to overwrite it", async () => {
    const created = await createNote(sb.vault, "Projects/New note.md", "hello");
    expect(created.path).toBe("Projects/New note.md");
    expect(await fs.readFile(path.join(sb.vaultRoot, "Projects/New note.md"), "utf8")).toBe("hello");
    await expectCode(createNote(sb.vault, "Projects/New note.md"), "ALREADY_EXISTS");
  });

  it("refuses to create in a missing folder", async () => {
    await expectCode(createNote(sb.vault, "Missing/Note.md"), "NOT_FOUND");
  });

  it("writes atomically and leaves no temp files", async () => {
    const saved = await writeNote(sb.vault, "Welcome.md", "updated");
    expect(saved.version).toBe(contentVersion("updated"));
    expect(await fs.readFile(path.join(sb.vaultRoot, "Welcome.md"), "utf8")).toBe("updated");
    const leftovers = (await fs.readdir(sb.vaultRoot)).filter((n) => n.includes("obsideck-tmp"));
    expect(leftovers).toEqual([]);
  });

  it("serializes concurrent writes without corruption", async () => {
    const writes = Array.from({ length: 20 }, (_, i) => writeNote(sb.vault, "Welcome.md", `v${i}`.repeat(1000)));
    await Promise.all(writes);
    const final = await fs.readFile(path.join(sb.vaultRoot, "Welcome.md"), "utf8");
    expect(final).toBe("v19".repeat(1000));
  });

  it("detects external modifications with baseVersion", async () => {
    const note = await readNote(sb.vault, "Welcome.md");
    await fs.writeFile(path.join(sb.vaultRoot, "Welcome.md"), "changed in Obsidian");
    await expectCode(writeNote(sb.vault, "Welcome.md", "mine", note.version), "CONFLICT");
    expect(await fs.readFile(path.join(sb.vaultRoot, "Welcome.md"), "utf8")).toBe("changed in Obsidian");
  });

  it("writes through an internal symlink to its real target", async () => {
    await fs.symlink(path.join(sb.vaultRoot, "Welcome.md"), path.join(sb.vaultRoot, "alias.md"));
    await writeNote(sb.vault, "alias.md", "via alias");
    expect(await fs.readFile(path.join(sb.vaultRoot, "Welcome.md"), "utf8")).toBe("via alias");
    expect((await fs.lstat(path.join(sb.vaultRoot, "alias.md"))).isSymbolicLink()).toBe(true);
  });
});

describe("folders, rename and delete", () => {
  it("creates folders", async () => {
    await createFolder(sb.vault, "Projects/Archive");
    expect((await fs.stat(path.join(sb.vaultRoot, "Projects/Archive"))).isDirectory()).toBe(true);
    await expectCode(createFolder(sb.vault, "Projects/Archive"), "ALREADY_EXISTS");
    await expectCode(createFolder(sb.vault, "Bad:Name"), "INVALID_NAME");
  });

  it("renames and moves notes", async () => {
    await renameEntry(sb.vault, "Welcome.md", "Projects/Hello.md");
    expect(await exists(path.join(sb.vaultRoot, "Welcome.md"))).toBe(false);
    expect(await exists(path.join(sb.vaultRoot, "Projects/Hello.md"))).toBe(true);
  });

  it("refuses to overwrite on rename", async () => {
    await createNote(sb.vault, "Other.md", "other");
    await expectCode(renameEntry(sb.vault, "Welcome.md", "Other.md"), "ALREADY_EXISTS");
    expect(await fs.readFile(path.join(sb.vaultRoot, "Other.md"), "utf8")).toBe("other");
  });

  it("refuses to drop the .md extension or move a folder into itself", async () => {
    await expectCode(renameEntry(sb.vault, "Welcome.md", "Welcome.txt"), "INVALID_NAME");
    await expectCode(renameEntry(sb.vault, "Projects", "Projects/Infra/Projects"), "INVALID_PATH");
  });

  it("renames folders", async () => {
    await renameEntry(sb.vault, "Projects/Infra", "Projects/Infrastructure");
    expect(await exists(path.join(sb.vaultRoot, "Projects/Infrastructure/Kubernetes.md"))).toBe(true);
  });

  it("moves deleted notes and folders to .trash", async () => {
    const res = await trashEntry(sb.vault, "Welcome.md");
    expect(res.trashedAs).toBe("Welcome.md");
    expect(await exists(path.join(sb.vaultRoot, "Welcome.md"))).toBe(false);
    expect(await exists(path.join(sb.vaultRoot, ".trash/Welcome.md"))).toBe(true);

    await createNote(sb.vault, "Welcome.md", "again");
    expect((await trashEntry(sb.vault, "Welcome.md")).trashedAs).toBe("Welcome 1.md");

    await trashEntry(sb.vault, "Projects");
    expect(await exists(path.join(sb.vaultRoot, ".trash/Projects/Infra/Kubernetes.md"))).toBe(true);
  });

  it("refuses to trash a symlink pointing outside the vault", async () => {
    await expectCode(trashEntry(sb.vault, "escape"), "FORBIDDEN");
    expect(await exists(path.join(sb.outside, "secret.md"))).toBe(true);
  });
});

describe("tree, assets and search", () => {
  it("lists notes and folders, skipping hidden entries and symlinks", async () => {
    const snap = await scanVault(sb.vault.root);
    const paths = snap.notes.map((n) => n.path).sort();
    expect(paths).toEqual(["Projects/Infra/Kubernetes.md", "Welcome.md"]);
    expect(snap.root.children.map((c) => c.name)).toEqual(["Assets", "Projects", "Welcome.md"]);
    expect(JSON.stringify(snap.root)).not.toContain(sb.base);
    expect(snap.attachments.get("diagram.png")).toEqual(["Assets/diagram.png"]);
  });

  it("resolves attachments relative, from root, then by name", async () => {
    const snapshot = () => scanVault(sb.vault.root);
    expect((await resolveAsset(sb.vault, snapshot, "Assets/diagram.png", "Welcome.md")).relative).toBe("Assets/diagram.png");
    expect((await resolveAsset(sb.vault, snapshot, "diagram.png", "Projects/Infra/Kubernetes.md")).relative).toBe(
      "Assets/diagram.png",
    );
    await expect(resolveAsset(sb.vault, snapshot, "../outside/x.png", "Welcome.md")).rejects.toBeInstanceOf(VaultError);
    await expect(resolveAsset(sb.vault, snapshot, "Welcome.md", null)).rejects.toBeInstanceOf(VaultError);
  });

  it("searches note contents with snippets", async () => {
    const snap = await scanVault(sb.vault.root);
    const search = new NoteSearch(sb.vault.root);
    const res = await search.search(snap.notes, "nodes", 10);
    expect(res.hits).toHaveLength(1);
    expect(res.hits[0]?.path).toBe("Projects/Infra/Kubernetes.md");
    expect(res.hits[0]?.snippet).toContain("nodes: 3");
    expect(res.hits[0]?.line).toBe(3);
  });
});
