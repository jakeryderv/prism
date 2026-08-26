# ADR-0003: Bun as runtime, package manager, and test runner; Biome for lint/format

- **Status:** accepted
- **Date:** 2026-08-25

## Context

Monorepo with several TypeScript packages, a Tauri app, and a future server. Want fast installs, fast tests, minimal config.

## Decision

- **Bun** for package management (workspaces), scripts, and `bun test`.
- **Biome** for linting and formatting — one tool, one config file.
- **TypeScript** strict, `tsc --noEmit` for typechecking (Bun does not typecheck).

## Alternatives considered

- **pnpm + Vitest** — mature and well-supported; Bun chosen for one fewer tool and speed. Vitest remains an option if `bun test` lacks something (e.g. Solid component testing ergonomics).
- **ESLint + Prettier** — more plugins (notably `eslint-plugin-solid`); Biome chosen for simplicity. Revisit if Solid-specific lint rules prove valuable.

## Consequences

- Contributors need Bun installed; documented in CONTRIBUTING.
- Vite is still used for the Solid/Tauri front-end build; Bun is not a bundler replacement here.
- `bun test` cannot compile Solid JSX, so UI logic lives in plain `.ts` modules (`packages/ui/src/store`) tested with `bun:test`; components stay thin and are checked visually via the Vite dev harness.
