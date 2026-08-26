# ADR-0004: Renderers depend on a provider interface, never on the shell

- **Status:** accepted
- **Date:** 2026-08-25

## Context

Renderers need to read file bytes, get a URL the webview can fetch, and re-render on change. The obvious implementation imports `@tauri-apps/plugin-fs` in each renderer. That couples every renderer to the desktop shell, makes them untestable without Tauri, and makes the planned web/remote mode a rewrite.

## Decision

`@prism/core` defines `WorkspaceProvider` and `Artifact` (see `architecture.md`). Renderers receive an `Artifact` and use only its methods. Shells implement the provider: `TauriProvider` (desktop), `MemoryProvider` (tests), `RemoteProvider` (server, later). The provider is injected once via Solid context.

Dependency rule: `renderers/*` and `ui/*` import only `@prism/core`. `@tauri-apps/*` appears only in `packages/desktop`. Enforced by `bun run boundaries` (`scripts/check-boundaries.ts`, part of `bun run check`) and review.

## Alternatives considered

- **Direct Tauri imports in renderers** — simplest today, rewrite later.
- **Abstract only at the fs-read level** (a `readFile(path)` shim) — insufficient; `url()`, revision identity, and watching also differ per shell.

## Consequences

- Every renderer is unit-testable against `MemoryProvider`.
- `Artifact.url()` centralizes the ugliest platform difference (asset protocol vs. HTTP vs. blob URL).
- Large-file policy and revision identity have a single home.
- Slight indirection cost; renderers cannot use shell-specific features without extending the interface deliberately.
