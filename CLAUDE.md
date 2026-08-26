# Prism — agent instructions

Read `docs/README.md` first for where things live. Key docs: `docs/vision.md`, `docs/architecture.md`, `docs/roadmap.md`.

## Conventions

- Follow `CONTRIBUTING.md` exactly: trunk-based, conventional commits, squash-merged PRs, branch from `main` as `<type>/<slug>`.
- No `Co-Authored-By` or agent attribution lines in commits.
- Use `bun`, not npm/yarn/pnpm. Lint/format with Biome via `bun run check`.
- TypeScript strict. SolidJS for UI. Tauri/Rust for the desktop shell.

## Architecture rules (enforced in review)

- `packages/renderers/*` and `packages/ui/*` depend only on `@prism/core`. Never import `@tauri-apps/*` outside `packages/desktop`.
- Renderers receive an `Artifact` from the provider interface and never touch the filesystem directly.
- The renderer registry decides fallbacks (too large, unknown type, error) — individual renderers do not.

## Documentation is part of the change

When a task touches any of the following, update the doc in the same PR:

| Change | Doc |
|---|---|
| package boundaries, provider interface, renderer contract | `docs/architecture.md` |
| a non-obvious technical choice | new ADR in `docs/decisions/` (copy `0000-template.md`) |
| a renderer added/changed | `docs/renderers/<name>.md` (copy `_template.md`) |
| a renderer added | sample file(s) in `demo/` + a row in `demo/README.md` |
| roadmap item done or reshaped | `docs/roadmap.md` |

Do not create new top-level docs or directories without a reason stated in `docs/README.md`.

## Working style

- Before broad or direction-setting changes, propose the approach and confirm.
- Prefer running `bun run check` / `bun run test` over asserting that code works.
- Open an issue for work that isn't a one-line fix; reference it in the PR.
