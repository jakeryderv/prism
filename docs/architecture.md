# Architecture

> Describes the intended structure. Sections marked *(planned)* do not exist in code yet; they will be un-marked as implemented.

## Packages *(planned)*

Bun workspace monorepo.

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

## Provider interface *(planned)*

The abstraction between "things that render files" and "wherever files actually live".

```ts
interface Entry { path: string; kind: 'file' | 'dir'; size: number; mtime: number }

interface Artifact {
  path: string            // workspace-relative
  mime: string
  size: number
  revision: string        // content hash; renderers key reloads on this, not on path
  read(): Promise<Uint8Array>
  readText(): Promise<string>
  url(): Promise<string>  // fetchable by the webview: <img>, <iframe>, PDF.js
}

type FileEvent = { kind: 'created' | 'modified' | 'deleted'; path: string; timestamp: number; size?: number; hash?: string }

interface WorkspaceProvider {
  root: string
  list(dir: string): Promise<Entry[]>
  stat(path: string): Promise<Entry>
  open(path: string): Promise<Artifact>
  watch(cb: (ev: FileEvent) => void): () => void
  openExternal(path: string): Promise<void>
}
```

Implementations:

| Provider | Package | Backing |
|---|---|---|
| `TauriProvider` | desktop | IPC to Rust; `url()` via Tauri asset protocol |
| `MemoryProvider` | core | in-memory map; tests and component stories |
| `RemoteProvider` *(later)* | server | WebSocket events, HTTP for bytes |

The provider is supplied once via Solid context at the app root. Nothing below it knows which implementation it is talking to.

## Renderer contract *(planned)*

```ts
interface Renderer {
  id: string                                   // 'markdown', 'image', ...
  displayName: string
  match(artifact: Pick<Artifact, 'path' | 'mime' | 'size'>): number   // 0 = no, higher = better match
  maxSize?: number                             // bytes; registry enforces, renderer never sees larger
  component: Component<{ artifact: Artifact }>
}
```

- `match` returns a score so multiple renderers can claim a type (e.g. JSON: tree view vs. code view) and the user can switch.
- Renderers re-run when `artifact.revision` changes. They do not subscribe to the watcher themselves.
- Renderers are lazy-loaded; heavy deps (Monaco, PDF.js) must not be in the initial bundle.

### Registry

Owns the fallback policy so renderers do not:

1. Collect renderers with `match > 0`, sorted by score.
2. Drop any whose `maxSize` is exceeded.
3. If none remain: show the "unsupported / too large" view with **Open externally**.
4. If the chosen renderer throws: show the error view with the next candidate offered.

## File watching *(planned)*

Rust side, `notify` + debouncer + `ignore` crate.

- Events are debounced and coalesced per path (agents and editors write in bursts).
- Atomic saves (`write tmp; rename`) are normalized to `modified`, not `deleted`+`created`.
- `.gitignore` and a built-in ignore list (`.git`, `node_modules`, `target`, …) are honored.
- Renders wait for a short settle window so half-written files are not parsed.
- Each event carries `size` and a content `hash` when cheap to compute. The MVP UI only uses `kind` and `path`; the extra fields are the hook for revision tracking later without changing the event shape.

## Large files

Policy lives in the registry (`maxSize`) and the provider (`open()` may refuse or truncate). Renderers assume what they receive is within budget.

## HTML preview

Sandboxed `<iframe>` with `srcdoc`. Relative assets (CSS, images written alongside) resolve through `Artifact.url()` of a directory base — via Tauri's asset protocol in desktop, via HTTP in server mode.

## Desktop shell *(planned)*

Tauri 2. Rust handles: workspace open, fs reads, watcher, asset protocol, `open` for native apps. The Solid front end is the same code that will later run in the browser against `RemoteProvider`.
