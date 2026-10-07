import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Vault } from "@/lib/security/vault";

export interface Sandbox {
  /** Real path of the temp dir containing the vault and an "outside" folder. */
  base: string;
  vaultRoot: string;
  outside: string;
  vault: Vault;
  cleanup: () => Promise<void>;
}

/**
 * base/
 * ├── outside/secret.md        (must never be reachable)
 * └── vault/
 *     ├── Welcome.md
 *     ├── Projects/Infra/Kubernetes.md
 *     ├── Assets/diagram.png
 *     ├── .obsidian/app.json
 *     └── escape -> ../outside  (malicious symlink)
 */
export async function createSandbox(): Promise<Sandbox> {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "obsideck-test-")));
  const vaultRoot = path.join(base, "vault");
  const outside = path.join(base, "outside");

  await fs.mkdir(path.join(vaultRoot, "Projects", "Infra"), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, "Assets"), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, ".obsidian"), { recursive: true });
  await fs.mkdir(outside, { recursive: true });

  await fs.writeFile(path.join(vaultRoot, "Welcome.md"), "# Welcome\n\nHello [[Kubernetes]] #devops\n");
  await fs.writeFile(path.join(vaultRoot, "Projects", "Infra", "Kubernetes.md"), "# Cluster\n\nnodes: 3\n");
  await fs.writeFile(path.join(vaultRoot, "Assets", "diagram.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await fs.writeFile(path.join(vaultRoot, ".obsidian", "app.json"), "{}");
  await fs.writeFile(path.join(outside, "secret.md"), "TOP SECRET");
  await fs.symlink(outside, path.join(vaultRoot, "escape"));
  await fs.symlink(path.join(outside, "secret.md"), path.join(vaultRoot, "secret-link.md"));

  const vault = await Vault.open(vaultRoot);
  return {
    base,
    vaultRoot,
    outside,
    vault,
    cleanup: () => fs.rm(base, { recursive: true, force: true }),
  };
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}
