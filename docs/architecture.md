# Architecture

> Describes the intended structure. Sections marked *(planned)* do not exist in code yet; they will be un-marked as implemented.

## Packages

Bun workspace monorepo. `core` and `ui` exist; the rest are planned.

```text
packages/
  core/        @prism/core      file-type detection, provider interface, renderer registry, workspace state, events
  ui/          @prism/ui        Solid components: file tree, tabs, viewer, activity panel
  renderers/   @prism/renderer-<name>   one package per renderer
  desktop/     @prism/desktop   Tauri app: Rust backend (fs, watcher, native integration) + Solid entry
  server/      @prism/server    (later) remote provider over WebSocket/HTTP
```

### Dependency rule

```text
renderers/*  ─┐
ui/*         ─┴──▶ core          (nothing else)
desktop      ───▶ core, ui, renderers/*
server       ───▶ core
```

`@tauri-apps/*` is imported **only** in `packages/desktop`. This is what makes renderers testable without a Tauri runtime and makes a future web/remote mode a new provider rather than a rewrite. See ADR-0004.

## Provider interface

The abstraction between "things that render files" and "wherever files actually live". Defined in `packages/core/src/provider.ts`; the snippet below is a summary — the source is authoritative.

```ts
interface Entry { path: string; name: string; kind: 'file' | 'dir'; size: number; mtime: number }

interface Artifact {
  path: string            // workspace-relative, POSIX, no leading slash
  mime: string
  size: number
  revision: string        // content hash; renderers key reloads on this, not on path
  read(): Promise<Uint8Array>
  readText(): Promise<string>
  url(): Promise<string>  // fetchable by the webview: <img>, <iframe>, PDF.js
}

type FileEvent = { kind: 'created' | 'modified' | 'deleted'; path: string; timestamp: number; size?: number; hash?: string }

interface WorkspaceProvider {
  readonly root: string
  list(dir: string): Promise<Entry[]>      // '' is the workspace root
  stat(path: string): Promise<Entry>
  open(path: string): Promise<Artifact>
  watch(cb: (ev: FileEvent) => void): Unsubscribe
  openExternal(path: string): Promise<void>
}
```

Failures are `ProviderError` with a `code` (`not-found`, `is-directory`, `not-directory`, `unsupported`) so UI can branch without string-matching. `normalizePath` in core is the one canonical path form; providers normalize on entry.

Implementations:

| Provider | Package | Backing | Status |
|---|---|---|---|
| `MemoryProvider` | core | in-memory map; `write`/`remove` emit watch events for tests | done |
| `TauriProvider` | desktop | IPC to Rust; `url()` via custom `prism://` scheme | planned (#6) |
| `RemoteProvider` | server | WebSocket events, HTTP for bytes | later |

### File-type detection

`detectMime(path, bytes?)` in core: extension table first, magic bytes for well-known binaries (PNG, JPEG, GIF, WebP, PDF, zip, gzip, SQLite, wasm), then a text/binary heuristic on the first 8 KiB. Magic bytes override a misleading extension, except zip — which is the container for `.xlsx`/`.docx`/`.pptx` and must not override them. Revision identity is FNV-1a 64 (`fnv1a64`); a stronger hash can replace it in any provider as long as it is stable for identical bytes.

The provider is supplied once via Solid context at the app root. Nothing below it knows which implementation it is talking to.

## Renderer contract

Defined in `packages/core/src/renderer.ts`; summary below, source is authoritative.

```ts
interface Renderer<TView> {
  id: string
  displayName: string
  match(head: Pick<Artifact, 'path' | 'mime' | 'size'>): number   // 0 = no, higher = better
  maxSize?: number                  // bytes; overrides the registry default (50 MiB)
  load(): Promise<TView>            // async so heavy deps stay out of the initial bundle
}
```

- `TView` is the UI framework's component type. Core is framework-agnostic; `@prism/ui` fixes it to Solid's `Component<{ artifact: Artifact }>`. This is also the escape hatch for non-Solid third-party renderers later.
- `match` returns a score so several renderers can claim a type (JSON: tree vs. code) and the user can switch; ties keep registration order.
- Renderers re-run when `artifact.revision` changes. They do not subscribe to the watcher themselves.
- `matchMime([...])` and `matchMimePrefix('text/')` cover the common cases.

### Registry

`RendererRegistry.resolve(head, { exclude?, prefer? })` owns the fallback policy so renderers do not:

1. Collect renderers with `match > 0`, best score first, minus any `exclude`d ids.
2. Nothing left → `{ kind: 'unsupported' }` → UI shows **Open externally**.
3. Drop candidates whose limit (`maxSize ?? defaultMaxSize`) is below the artifact size. None left → `{ kind: 'too-large', renderer, maxSize }` reporting the *most permissive* limit → UI shows the size message + **Open externally**.
4. Otherwise `{ kind: 'render', renderer, alternatives }` — `prefer` wins if it is among the fitting candidates; `alternatives` feeds a "view as" switcher.
5. If the chosen renderer throws, the UI calls `resolve` again with that id in `exclude`, which walks to the next candidate and eventually to `unsupported`.

## UI package

`@prism/ui` fixes the renderer view type to Solid: `RendererView = Component<{ artifact: Artifact }>` and `SolidRenderer = Renderer<RendererView>`. A renderer package may declare the same two aliases locally rather than depend on `@prism/ui`.

### Store

`src/store/` is plain TypeScript with no Solid dependency, unit-tested with `bun test` (see ADR-0003):

- `tabs.ts` — pure reducers over `{ tabs, active }` keyed by path. Reopening an open path activates it; closing the active tab activates the right neighbour, then the left. A `deleted` event flags the tab (struck-through) rather than closing it, so the user sees the file vanish; `created` clears the flag; closing removes it.
- `activity.ts` — newest-first ring buffer (cap 500) of `FileEvent`s plus the `follow` flag. `shouldAutoOpen(event, follow)` is true for `created`/`modified` while following.
- `tree.ts` — lazy directory model. `TreeModel.expand(dir)` lists once via the provider and caches; events patch loaded directories incrementally (`created` inserts sorted, surfacing a new subdirectory in a loaded grandparent; `modified` updates size/mtime; `deleted` removes, or flags when an open tab keeps it visible). Unloaded directories ignore events and list fresh when expanded. Ordering matches `MemoryProvider.list`: dirs first, then by name.

### Workspace

`createWorkspace(provider)` owns the Solid signals, subscribes to `provider.watch` exactly once, and routes each event to tree, activity, and tabs. `artifactFor(path)` is a per-path signal of `ArtifactSlot` (`loading` | `ready` | `error`); a `modified` event re-runs `provider.open` so consumers observe a new `Artifact` with a new `revision`. `<PrismProvider provider registry>` supplies provider, registry, and workspace via context (`useProvider`, `useRegistry`, `useWorkspace`).

### Viewer host

`Viewer` shows the active tab's artifact and is the only place fallback policy is executed (the policy itself lives in the registry):

1. `registry.resolve({ path, mime, size }, { exclude, prefer })`.
2. `render` → `load()` the renderer lazily (loading state), mount it keyed on `revision + renderer.id` so a new revision remounts, inside an `ErrorBoundary`. On error the renderer id is added to `exclude` for that revision (reset when the revision changes), a one-line notice names what failed, and resolution re-runs — walking to the next candidate and eventually `unsupported`. Alternatives populate a "view as" select that sets `prefer`.
3. `too-large` → size and limit message + **Open externally**. `unsupported` → message + **Open externally**. The button calls `provider.openExternal` and shows a thrown `ProviderError` inline (`MemoryProvider` always throws `unsupported`).

Renderer errors are never swallowed below this level.

### Dev harness

`packages/ui/dev` (`bun run dev:ui`) mounts `Workspace` on a seeded `MemoryProvider` with a trivial text renderer and a deliberately throwing `text/markdown` renderer, plus a "simulate agent" button that writes, edits, and deletes files on an interval to exercise live update, activity, and follow.

## File watching *(planned)*

Rust side, `notify` + debouncer + `ignore` crate.

- Events are debounced and coalesced per path (agents and editors write in bursts).
- Atomic saves (`write tmp; rename`) are normalized to `modified`, not `deleted`+`created`.
- `.gitignore` and a built-in ignore list (`.git`, `node_modules`, `target`, …) are honored.
- Renders wait for a short settle window so half-written files are not parsed.
- Each event carries `size` and a content `hash` when cheap to compute. The MVP UI only uses `kind` and `path`; the extra fields are the hook for revision tracking later without changing the event shape.

## Large files

Policy lives in the registry (`maxSize` / `defaultMaxSize`) and the provider (`open()` may refuse or truncate). Renderers assume what they receive is within budget.

## HTML preview

Sandboxed `<iframe>` with `srcdoc` plus a `<base href>` pointing at the artifact's directory via `Artifact.url()`, so relative assets (CSS, JS, images written alongside) resolve.

In desktop mode that URL is a custom `prism://localhost/<absolute path>` scheme registered in Rust, **not** Tauri's `asset://` protocol — the built-in protocol encodes the whole path as one segment, which breaks relative resolution (details in ADR-0001, spike results). The scheme handler enforces scope: paths must be inside the open workspace and contain no `..`. In server mode the same role is played by an HTTP route.

## Desktop shell *(planned)*

Tauri 2. Rust handles: workspace open, fs reads, watcher, asset protocol, `open` for native apps. The Solid front end is the same code that will later run in the browser against `RemoteProvider`.
