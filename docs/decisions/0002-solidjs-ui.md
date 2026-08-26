# ADR-0002: SolidJS for the UI

- **Status:** accepted
- **Date:** 2026-08-25

## Context

The UI is mostly long-lived views that update on fine-grained file events: a tab's content changes while the tree and other tabs do not. Many renderers wrap imperative libraries (Monaco, PDF.js) that must not be re-mounted on unrelated state changes.

## Decision

SolidJS. Fine-grained reactivity without a virtual DOM; components run once, so wrapping imperative libraries is straightforward.

## Alternatives considered

- **React** — larger ecosystem, but re-render semantics make imperative-library wrappers fiddly (effects, refs, memo discipline) and cost more for high-frequency updates.
- **Svelte** — comparable fit; Solid chosen for plain-TSX components and a smaller runtime, no compiler-specific syntax.
- **Vue** — fine, but no advantage over Solid here and less natural TSX.

## Consequences

- Smaller talent pool and fewer ready-made component libraries; we build tree/tabs/grid ourselves or use headless libs.
- Renderer packages export Solid components; a third-party plugin API (Phase 4) will need a framework-agnostic escape hatch (mount to a DOM node).
