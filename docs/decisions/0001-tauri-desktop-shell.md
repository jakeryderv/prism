# ADR-0001: Tauri as the desktop shell

- **Status:** accepted
- **Date:** 2026-08-25

## Context

Prism needs unrestricted local filesystem access, native file watching, large-file handling, launching native apps, and to run beside local coding agents. It must ship on Linux first, then macOS and Windows. The UI is web technology.

## Decision

Tauri 2 with a Rust backend. Rust owns fs, watching, asset serving, and native integration; the webview runs the Solid UI.

## Alternatives considered

- **Electron** — consistent Chromium on every platform, but 100+ MB baseline, higher memory, and no natural home for native code. The consistency advantage is real (see consequences).
- **Pure web app + local Node/Bun server** — no native packaging, weaker fs/watcher story, awkward "open in native app".
- **Native toolkit (GTK/Qt/egui)** — loses the entire web renderer ecosystem (Monaco, PDF.js, SheetJS, Three.js).

## Consequences

- Small binaries, low memory, Rust for the parts that need it.
- **Linux uses WebKitGTK**, not Chromium. Known risk areas: WebGL (Three.js later), occasional rendering/perf differences.
- Relative-asset loading for HTML previews cannot use Tauri's built-in asset protocol (see spike results); Prism registers its own URI scheme.

## Spike results (2026-08-25, Pop!_OS 24.04, WebKitGTK / Tauri 2.11, dev build)

Validated in a throwaway Tauri 2 + Solid app; see issue #3.

| Check | Result |
|---|---|
| Monaco with 5.8 MB / 70k-line file | read 35 ms, editor created 122 ms, no errors |
| PDF.js, 29-page PDF | first 3 pages rendered in 836 ms |
| Sandboxed `<iframe>` with relative CSS/JS/SVG | **fails via `asset://`**, works via custom scheme (below) |
| WebGL2 context | available |
| Memory, all three loaded | ~780 MB RSS total (app 207, WebKitWebProcess 518, network 55) — unoptimized dev build |

**Asset protocol finding.** `convertFileSrc()` percent-encodes the entire path into a single URL segment (`asset://localhost/%2Ftmp%2F…%2Findex.html`), so a relative `app.js` inside that page resolves to `asset://localhost/app.js` and 404s. `<base href>` does not help for the same reason, and an unencoded `asset://localhost/tmp/…` path is rejected (403) by Tauri's scope check. A custom scheme registered with `register_uri_scheme_protocol("prism", …)` that maps `prism://localhost/<absolute path>` to files, preserving real path segments, resolves relative CSS, JS, and images correctly in both `src` and `srcdoc`+`<base>` iframes. Scope enforcement (workspace root, no `..`) lives in that handler.

Gotcha noted along the way: Monaco 0.56 changed its `exports` map; the worker entry is `monaco-editor/editor/editor.worker.js`, not the old `esm/vs/…` path.
