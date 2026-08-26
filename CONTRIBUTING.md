# Contributing

## Dev setup

Requirements: [Bun](https://bun.sh) ≥ 1.4, Rust stable (with `clippy` and `rustfmt`) + [Tauri prerequisites](https://tauri.app/start/prerequisites/).

On Debian/Ubuntu the Tauri 2 deps are:
`libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.

```sh
bun install
bun run check      # Biome + typecheck + package boundaries
bun run test
bun run dev:desktop /path/to/dir   # run the desktop app against a folder

cd packages/desktop/src-tauri            # Rust side; CI runs exactly these
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

`PRISM_DEBUG=1` makes the watcher and the UI log every file event to stderr, which is the way to verify behaviour without screenshots.

## Workflow

Trunk-based. `main` is protected: no direct pushes, CI must pass, PRs are squash-merged.

1. Open or pick an issue. Every non-trivial change should have one.
2. Branch from `main`: `<type>/<short-slug>` — e.g. `feat/csv-renderer`, `fix/watcher-debounce`, `docs/adr-provider`.
3. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   `type(scope): summary` — types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`.
   Scopes are package or area names: `core`, `ui`, `desktop`, `renderer-<name>`, `docs`, `ci`.
4. Open a PR against `main`. The squash-merge commit message should itself be a valid conventional commit — the PR title is used, so title the PR accordingly.
5. Delete the branch after merge (automatic).

Individual commits on a branch can be messy; the squash commit is what matters.

## Documentation rules

Docs live in `docs/` and are part of the change, not an afterthought. A PR is incomplete if it:

- changes package boundaries, the provider interface, or the renderer contract without updating `docs/architecture.md`;
- makes a non-obvious technical choice (library, pattern, tradeoff) without an ADR in `docs/decisions/`;
- adds or materially changes a renderer without a page in `docs/renderers/`;
- finishes or reshapes a roadmap item without updating `docs/roadmap.md`.

See [docs/README.md](docs/README.md) for the layout and templates.

## Code conventions

- TypeScript strict mode everywhere.
- Formatting and linting via [Biome](https://biomejs.dev); `bun run check` must pass.
- `packages/renderers/*` and `packages/ui/*` import only from `@prism/core` (and their own deps). They never import from `desktop` or `server`. Enforced by `bun run boundaries`. See the architecture doc for why.
- Prefer small, composable modules over clever ones.
