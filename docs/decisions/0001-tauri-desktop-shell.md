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
- **Linux uses WebKitGTK**, not Chromium. Known risk areas: WebGL (Three.js later), occasional rendering/perf differences. A spike validating Monaco, sandboxed iframes, and PDF.js on WebKitGTK is a Phase 0 task; revisit this ADR if it fails.
- Relative-asset loading for HTML previews goes through Tauri's asset protocol rather than plain file URLs.
