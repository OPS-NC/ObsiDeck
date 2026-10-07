import { getContext } from "@/lib/server/context";
import { withErrors } from "@/lib/server/http";
import type { VaultEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;

/**
 * GET /api/events — Server-Sent Events stream of filesystem changes.
 * Each message is a JSON array of { kind, path } with vault-relative paths.
 */
export const GET = withErrors(async (req) => {
  const ctx = await getContext();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send("retry: 3000\n: connected\n\n");

      const unsubscribe = ctx.watcher.subscribe((events: VaultEvent[]) => {
        send(`event: vault\ndata: ${JSON.stringify(events)}\n\n`);
      });
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
