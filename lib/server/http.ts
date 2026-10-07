import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { VaultError } from "../security/errors";
import { MAX_NOTE_BYTES } from "../filesystem/notes";

const MAX_BODY_BYTES = MAX_NOTE_BYTES + 64 * 1024;

type Handler = (req: NextRequest) => Promise<Response>;

/** Maps known errors to JSON responses; never leaks host paths or stacks. */
export function withErrors(handler: Handler): Handler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof VaultError) {
        return NextResponse.json({ error: err.message, code: err.code, ...err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        const message = err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
        return NextResponse.json({ error: message, code: "INVALID_INPUT" }, { status: 400 });
      }
      console.error(`[obsideck] ${req.method} ${req.nextUrl.pathname} failed:`, err);
      return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
    }
  };
}

/**
 * Basic CSRF protection for mutating requests: browsers always send
 * Sec-Fetch-Site; reject anything coming from another site.
 */
export function assertSameOrigin(req: NextRequest): void {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new VaultError("FORBIDDEN", "Cross-site requests are not allowed");
  }
}

/** Parses a JSON body with a Zod schema. Requires application/json (forces CORS preflight). */
export async function readJson<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  assertSameOrigin(req);
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new VaultError("UNSUPPORTED_TYPE", "Expected application/json");
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new VaultError("TOO_LARGE", "Request body is too large");

  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new VaultError("TOO_LARGE", "Request body is too large");
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new VaultError("INVALID_INPUT", "Malformed JSON body");
  }
  return schema.parse(data);
}

export function queryParam(req: NextRequest, name: string): string | null {
  return req.nextUrl.searchParams.get(name);
}

export const noStore = { "Cache-Control": "no-store" } as const;
