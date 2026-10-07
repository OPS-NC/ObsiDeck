# CLAUDE.md

Guidance for AI coding agents working on ObsiDeck.

## What this is

A self-hosted web editor for a local Obsidian vault. Next.js 16 serves the UI and a JSON API that reads and writes Markdown files directly in `OBSIDIAN_VAULT_PATH`. There is no database and no cache that outlives the process: **the filesystem is the source of truth**. It runs behind Envoy under the `/obsideck` prefix and is exposed privately with Tailscale Serve.

## Commands

```bash
npm install
OBSIDIAN_VAULT_PATH=/path/to/test/vault npm run dev   # http://localhost:3000/obsideck
npm test              # Vitest (tests/)
npm run typecheck     # tsc --noEmit, strict
npm run build         # next build (standalone output)

docker compose up -d                                                      # prebuilt GHCR image
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build   # build locally
```

Run `npm run typecheck && npm test && npm run build` before considering a change done. Never point a dev server or a test at a real vault you care about: the app writes files.

## Layout

```text
app/api/<route>/route.ts   Route handlers (Node runtime): tree, file, folder, rename, search, asset, events (SSE), health
app/                       layout, page (renders the client-only AppShell), globals.css (design tokens, preview, CodeMirror)
components/                layout/, sidebar/ (virtualized tree, search), editor/ (CodeMirror 6), preview/, dialogs/, ui/
lib/security/              paths.ts (lexical validation), vault.ts (realpath containment), errors.ts
lib/filesystem/            notes.ts (CRUD), atomic.ts (atomic write + per-key mutex), tree.ts, search.ts, assets.ts, watcher.ts
lib/markdown/              remark-obsidian.ts (wiki links, embeds, tags, callouts…), links.ts, sanitize.ts
lib/server/                context.ts (env via Zod, process singleton), http.ts (error mapping, CSRF), schemas.ts
lib/client/                api.ts (basePath-aware fetch), store.ts (Zustand), actions.ts (open/save/conflicts/events)
tests/                     paths, vault (I/O + traversal + symlinks), markdown rendering
infra/envoy/envoy.yaml     Gateway config (routes are hardcoded to /obsideck)
```

## Invariants — do not break

1. **All disk access from client input goes through `Vault`** (`lib/security/vault.ts`): `resolveExisting` / `resolveNew`. Never `path.join(root, userInput)` and touch the disk directly. Never return absolute host paths to the browser; API paths are vault-relative POSIX strings.
2. **Hidden entries are off-limits** (`.obsidian`, `.git`, `.trash`, temp files). `normalizeRelativePath` rejects them; the tree and the watcher skip them.
3. **Writes are atomic and ordered**: `atomicWriteFile` (temp + fsync + rename) under `KeyedMutex`, keyed by the normalized path computed synchronously before any `await`.
4. **Never overwrite silently**: saves send `baseVersion` (sha256 prefix); a mismatch returns `409 CONFLICT` and the UI asks the user. Create uses `wx`; rename refuses existing targets; delete moves to `.trash`.
5. **Every browser URL honors the base path**: use `apiUrl()` / `assetUrl()` / `BASE_PATH` from `lib/client/api.ts`. Never hardcode `/api/...` or `/logo.webp`. `basePath` is baked in at build time.
6. **Mutations require JSON + same-origin** (`readJson` / `assertSameOrigin` in `lib/server/http.ts`).
7. Rendered HTML stays sanitized: new hast attributes produced by `remarkObsidian` must be allowed explicitly in `lib/markdown/sanitize.ts`.

Security-sensitive changes need tests in `tests/vault.test.ts` or `tests/paths.test.ts` (traversal inputs, symlinks escaping the vault).

## Conventions

- TypeScript strict, no `any`. Validate API input with Zod (`lib/server/schemas.ts`); throw `VaultError` for expected failures.
- Server Components by default; `"use client"` only where needed. The workspace UI is client-only (`components/layout/ClientApp.tsx`).
- Styling: Tailwind CSS 4 with the tokens defined in `app/globals.css` (`bg-bg`, `text-muted`, `border-border`, `bg-accent-soft`…). Both themes must work. Global base styles live in `@layer base` so utilities can override them.
- CodeMirror layout/typography belongs in `EditorView.theme` (`components/editor/extensions.ts`), not in global CSS: the scoped base theme wins on specificity.
- `mdast-util-find-and-replace` merges adjacent text nodes: Obsidian replacements must return non-text nodes (e.g. `emphasis` renamed through `data.hName`).
- Keep comments for non-obvious reasons only. Match the surrounding style.

## Release & images

- `.github/workflows/ci.yml`: typecheck, test, build on pull requests and `main`.
- `.github/workflows/docker.yml`: multi-arch image (`linux/amd64`, `linux/arm64`, native runners) pushed to `ghcr.io/ops-nc/obsideck` on `main` (`latest`, `sha-…`) and on `v*` tags (`v0.1` → `0.1`, `v0.1`).
- Bump `version` in `package.json`, tag `vX.Y`, then publish a GitHub release.
