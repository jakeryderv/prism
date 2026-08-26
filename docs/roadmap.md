# Roadmap

Status is tracked in GitHub Issues (milestone **MVP**); this page is the readable summary. Keep it in sync when scope changes.

## Phase 0 — Foundation ← current

- [x] Repo, CI, docs structure, conventions
- [x] Bun workspace + Biome + TypeScript config (root only; packages come with their first code)
- [x] `@prism/core`: provider interface, `MemoryProvider`, file-type detection (#4)
- [x] `@prism/core`: renderer registry with fallback policy (#5)
- [ ] `@prism/desktop`: Tauri 2 shell, `TauriProvider`, Rust watcher with debounce + ignore
- [x] `@prism/ui`: file tree, tabs, viewer host, activity panel (#8)
- [x] Spike: Tauri on Linux (WebKitGTK) with Monaco, sandboxed iframe, PDF.js — passed; asset protocol caveat recorded in ADR-0001 (#3)

## Phase 1 — MVP: working desktop viewer

Goal: open a directory, watch it, and preview every file type below live, with a native-app fallback for everything else.

Renderers in the order that best stresses the skeleton:

| Renderer | Proves | Status |
|---|---|---|
| code/text (Monaco) | lazy-loaded heavy dep, large-file policy | done — `@prism/renderer-code` (#9) |
| Markdown | text → DOM, relative images via `url()` | todo |
| images / SVG | `url()` path, binary, no parsing | todo |
| HTML | sandboxed iframe, asset resolution | todo |
| CSV | tabular data, virtualization | todo |
| JSON / YAML | two views of one artifact (tree + code) | todo |
| PDF (PDF.js) | canvas-based, paged | todo |
| Excel (SheetJS) | multi-sheet tabular | todo |
| Jupyter notebook | composite: cells of Markdown + code + outputs | todo |

Plus:

- Activity panel: created / modified / deleted, click to open, "follow agent" auto-open toggle
- Open externally for unsupported / oversized files
- Linux packaging: AppImage + .deb

## Phase 2 — Change tracking

- Revision store (content-addressed, SQLite) fed by watcher events
- Diff view between any two revisions of a file
- Timeline scrubbing in the activity panel

## Phase 3 — More formats

DOCX / PPTX · SQLite / DB viewer · Mermaid / Graphviz · video / audio · archives · 3D (STL/OBJ/glTF) · STEP (OpenCascade.js) · USD/USDZ

## Phase 4 — Platform

- macOS (.dmg), Windows (.msi)
- Flatpak
- Web/server mode via `RemoteProvider`
- Third-party renderer plugins
- Agent annotations / metadata
