import { z } from "zod";
import { Vault } from "../security/vault";
import { NoteSearch } from "../filesystem/search";
import { scanVault, type VaultSnapshot } from "../filesystem/tree";
import { VaultWatcher } from "../filesystem/watcher";

const booleanFlag = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  OBSIDIAN_VAULT_PATH: z.string().min(1, "OBSIDIAN_VAULT_PATH is required"),
  OBSIDECK_WATCH_POLLING: booleanFlag,
  OBSIDECK_POLL_INTERVAL: z.coerce.number().int().min(100).max(60_000).default(1000),
  /** Name shown in the UI; defaults to the vault folder name ("vault" in Docker). */
  OBSIDECK_VAULT_NAME: z.string().max(80).optional(),
});

/** Process-wide state: the vault gateway, a metadata snapshot, search cache and watcher. */
export class VaultContext {
  private snapshotPromise: Promise<VaultSnapshot> | null = null;
  readonly search: NoteSearch;
  readonly watcher: VaultWatcher;

  constructor(
    readonly vault: Vault,
    readonly displayName: string,
    watcherOptions: { usePolling: boolean; pollInterval: number },
  ) {
    this.search = new NoteSearch(vault.root);
    this.watcher = new VaultWatcher(vault.root, { ...watcherOptions, batchMs: 120 });
    this.watcher.subscribe((events) => {
      this.invalidate();
      for (const event of events) this.search.invalidate(event.path);
    });
    this.watcher.start();
  }

  snapshot(): Promise<VaultSnapshot> {
    if (!this.snapshotPromise) {
      const started = Date.now();
      const promise = scanVault(this.vault.root).then((snapshot) => {
        const ms = Date.now() - started;
        if (ms > 500) console.log(`[obsideck] scanned ${snapshot.notes.length} notes in ${ms}ms`);
        return snapshot;
      });
      promise.catch(() => {
        if (this.snapshotPromise === promise) this.snapshotPromise = null;
      });
      this.snapshotPromise = promise;
    }
    return this.snapshotPromise;
  }

  /** Called after our own mutations so the next read does not wait for the watcher. */
  invalidate(): void {
    this.snapshotPromise = null;
  }
}

const globalForContext = globalThis as unknown as { __obsideck?: Promise<VaultContext> };

export function getContext(): Promise<VaultContext> {
  if (!globalForContext.__obsideck) {
    const promise = (async () => {
      const env = envSchema.parse(process.env);
      const vault = await Vault.open(env.OBSIDIAN_VAULT_PATH);
      console.log(`[obsideck] vault ready: "${vault.name}"`);
      return new VaultContext(vault, env.OBSIDECK_VAULT_NAME?.trim() || vault.name, {
        usePolling: env.OBSIDECK_WATCH_POLLING,
        pollInterval: env.OBSIDECK_POLL_INTERVAL,
      });
    })();
    promise.catch((err) => {
      console.error("[obsideck] cannot open vault:", err instanceof Error ? err.message : err);
      globalForContext.__obsideck = undefined;
    });
    globalForContext.__obsideck = promise;
  }
  return globalForContext.__obsideck;
}
