import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { isErrnoException } from "../security/errors";

/**
 * Writes `content` to `target` atomically: temp file in the same folder,
 * fsync, then rename over the target. Readers (and Obsidian) only ever see
 * the old or the new content, never a truncated file.
 *
 * The temp file is dot-prefixed so the watcher and the tree ignore it.
 */
export async function atomicWriteFile(target: string, content: string): Promise<void> {
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.${randomBytes(6).toString("hex")}.obsideck-tmp`);

  let mode = 0o644;
  try {
    mode = (await fs.stat(target)).mode & 0o777;
  } catch (err) {
    if (!isErrnoException(err) || err.code !== "ENOENT") throw err;
  }

  const handle = await fs.open(tmp, "wx", mode);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } catch (err) {
    await handle.close().catch(() => undefined);
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
  await handle.close();

  try {
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
  await syncDirectory(dir);
}

async function syncDirectory(dir: string): Promise<void> {
  // Persists the rename itself. Not supported on every filesystem: best effort.
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(dir, "r");
    await handle.sync();
  } catch {
    // ignore
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/** Serializes async operations per key (e.g. per file) to avoid interleaved writes. */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.tails.set(key, current);
    try {
      return await current;
    } finally {
      if (this.tails.get(key) === current) this.tails.delete(key);
    }
  }
}
