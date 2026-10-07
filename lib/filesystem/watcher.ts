import { watch, type FSWatcher } from "chokidar";
import path from "node:path";
import type { VaultEvent, VaultEventKind } from "../types";

export type VaultEventListener = (events: VaultEvent[]) => void;

export interface WatcherOptions {
  usePolling: boolean;
  pollInterval: number;
  /** Events are coalesced over this window before being dispatched. */
  batchMs: number;
}

/**
 * Watches the vault and dispatches batched, de-duplicated events with
 * vault-relative paths. Hidden entries (.obsidian, .git, temp files) are
 * ignored entirely.
 */
export class VaultWatcher {
  private watcher: FSWatcher | null = null;
  private readonly listeners = new Set<VaultEventListener>();
  private pending = new Map<string, VaultEvent>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly root: string,
    private readonly options: WatcherOptions,
  ) {}

  start(): void {
    if (this.watcher) return;
    const root = this.root;
    this.watcher = watch(root, {
      ignoreInitial: true,
      followSymlinks: false,
      usePolling: this.options.usePolling,
      interval: this.options.pollInterval,
      binaryInterval: Math.max(this.options.pollInterval, 1000),
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
      ignored: (p: string) => {
        const rel = path.relative(root, p);
        return rel !== "" && rel.split(path.sep).some((s) => s.startsWith("."));
      },
    });

    const kinds: VaultEventKind[] = ["add", "change", "unlink", "addDir", "unlinkDir"];
    for (const kind of kinds) {
      this.watcher.on(kind, (p: string) => this.enqueue(kind, p));
    }
    this.watcher.on("error", (err) => console.error("[obsideck] watcher error:", err));
    this.watcher.on("ready", () => console.log(`[obsideck] watching vault (polling: ${this.options.usePolling})`));
  }

  subscribe(listener: VaultEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    await this.watcher?.close();
    this.watcher = null;
  }

  private enqueue(kind: VaultEventKind, absolute: string): void {
    const relative = path.relative(this.root, absolute).split(path.sep).join("/");
    if (relative === "" || relative.startsWith("..")) return;
    this.pending.set(`${kind}:${relative}`, { kind, path: relative });
    this.timer ??= setTimeout(() => this.flush(), this.options.batchMs);
  }

  private flush(): void {
    this.timer = null;
    const events = [...this.pending.values()];
    this.pending = new Map();
    if (events.length === 0) return;
    for (const listener of this.listeners) {
      try {
        listener(events);
      } catch (err) {
        console.error("[obsideck] watcher listener failed:", err);
      }
    }
  }
}
