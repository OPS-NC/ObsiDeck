import type {
  ApiError,
  NoteResponse,
  SaveResponse,
  SearchResponse,
  TreeResponse,
} from "../types";

/** Build-time base path (e.g. "/obsideck"). Every browser URL must go through these helpers. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function apiUrl(endpoint: string, params?: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const qs = search.toString();
  return `${BASE_PATH}/api/${endpoint}${qs ? `?${qs}` : ""}`;
}

export function assetUrl(target: string, fromNote: string | null): string {
  return apiUrl("asset", { path: target, from: fromNote });
}

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

async function request<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      signal,
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new RequestError("Network error: ObsiDeck server is unreachable", 0, "NETWORK");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const error = data as Partial<ApiError>;
    throw new RequestError(error.error ?? `Request failed (${res.status})`, res.status, error.code, data);
  }
  return data as T;
}

export const api = {
  tree: (signal?: AbortSignal) => request<TreeResponse>("GET", apiUrl("tree"), undefined, signal),
  readNote: (path: string, signal?: AbortSignal) =>
    request<NoteResponse>("GET", apiUrl("file", { path }), undefined, signal),
  createNote: (path: string, content = "") => request<SaveResponse>("POST", apiUrl("file"), { path, content }),
  saveNote: (path: string, content: string, baseVersion?: string) =>
    request<SaveResponse>("PUT", apiUrl("file"), { path, content, baseVersion }),
  deleteNote: (path: string) => request<{ path: string }>("DELETE", apiUrl("file", { path })),
  createFolder: (path: string) => request<{ path: string }>("POST", apiUrl("folder"), { path }),
  deleteFolder: (path: string) => request<{ path: string }>("DELETE", apiUrl("folder", { path })),
  rename: (from: string, to: string) => request<{ from: string; to: string }>("PUT", apiUrl("rename"), { from, to }),
  search: (q: string, signal?: AbortSignal) =>
    request<SearchResponse>("GET", apiUrl("search", { q, limit: 40 }), undefined, signal),
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}
