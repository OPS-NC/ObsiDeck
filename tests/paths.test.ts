import { describe, expect, it } from "vitest";
import {
  isInsideRoot,
  normalizeRelativePath,
  resolveRelativeToNote,
  validateEntryName,
} from "@/lib/security/paths";
import { VaultError } from "@/lib/security/errors";

const MALICIOUS = [
  "../../etc/passwd",
  "../foo",
  "/foo/bar",
  "folder/../../../etc/passwd",
  "folder/./note.md",
  "..",
  ".",
  "",
  "/etc/passwd",
  "C:\\Windows\\system.ini",
  "C:/Windows",
  "folder\\..\\..\\secret",
  "folder//note.md",
  "note.md/",
  "note\u0000.md",
  "note\n.md",
  ".obsidian/app.json",
  ".git/config",
  "Projects/.hidden/x.md",
  "a/".repeat(600),
];

describe("normalizeRelativePath", () => {
  it.each(MALICIOUS)("rejects %j", (input) => {
    expect(() => normalizeRelativePath(input)).toThrow(VaultError);
  });

  it.each([null, undefined, 42, {}, ["a.md"]])("rejects non-string %j", (input) => {
    expect(() => normalizeRelativePath(input)).toThrow(VaultError);
  });

  it("accepts regular vault paths, including spaces and unicode", () => {
    expect(normalizeRelativePath("Projects/Infrastructure/Kubernetes.md")).toBe("Projects/Infrastructure/Kubernetes.md");
    expect(normalizeRelativePath("Mon dossier/Café crème.md")).toBe("Mon dossier/Café crème.md");
    expect(normalizeRelativePath("a..b/c...md")).toBe("a..b/c...md");
  });
});

describe("validateEntryName", () => {
  it.each(["", " lead", "trail ", ".hidden", "a/b", "a\\b", "a:b", "what?", "x|y", "[[x]]", "a#b", "a^b"])(
    "rejects %j",
    (name) => {
      expect(() => validateEntryName(name)).toThrow(VaultError);
    },
  );

  it("accepts normal names", () => {
    expect(validateEntryName("Réunion 2026-10-06")).toBe("Réunion 2026-10-06");
  });
});

describe("isInsideRoot", () => {
  it("detects containment without prefix confusion", () => {
    expect(isInsideRoot("/vault", "/vault")).toBe(true);
    expect(isInsideRoot("/vault", "/vault/a/b.md")).toBe(true);
    expect(isInsideRoot("/vault", "/vault-evil/a.md")).toBe(false);
    expect(isInsideRoot("/vault", "/etc/passwd")).toBe(false);
    expect(isInsideRoot("/vault", "/")).toBe(false);
  });
});

describe("resolveRelativeToNote", () => {
  it("resolves relative to the note folder", () => {
    expect(resolveRelativeToNote("Projects/Infra/K8s.md", "img/a.png")).toBe("Projects/Infra/img/a.png");
    expect(resolveRelativeToNote("Projects/Infra/K8s.md", "../a.png")).toBe("Projects/a.png");
    expect(resolveRelativeToNote(null, "a.png")).toBe("a.png");
  });

  it("refuses to leave the vault", () => {
    expect(resolveRelativeToNote("Note.md", "../a.png")).toBeNull();
    expect(resolveRelativeToNote("A/Note.md", "../../../etc/passwd")).toBeNull();
    // Leading slash is vault-root relative: it can never reach the host root.
    expect(resolveRelativeToNote("A/Note.md", "/etc/passwd")).toBe("etc/passwd");
  });
});
