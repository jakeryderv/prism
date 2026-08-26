# Prism

**Live artifact viewer for agent-driven projects.**

Prism watches a project directory and live-previews whatever files a coding agent creates or edits — code, Markdown, JSON/YAML, images, HTML, CSV, PDF, spreadsheets, notebooks, and more — through a pluggable renderer system.

> Status: **pre-alpha**. The desktop app opens a folder and live-previews code and images as files change; other renderers are in progress. See [docs/roadmap.md](docs/roadmap.md).

## Run it

Requires Bun, Rust stable, and the [Tauri Linux prerequisites](https://tauri.app/start/prerequisites/).

```sh
bun install && bun run dev:desktop            # opens a folder picker
bun run dev:desktop -- -- /path/to/project    # or open a folder directly
```

## Why

Coding agents produce artifacts faster than humans can `open` them. Prism sits beside the agent and shows you what it just made, as it makes it.

## Stack

TypeScript · Bun · SolidJS · Tauri (Rust) — Linux first, then macOS/Windows.

## Docs

- [Vision](docs/vision.md) — what this is and why
- [Architecture](docs/architecture.md) — packages, provider interface, renderer contract
- [Roadmap](docs/roadmap.md) — MVP scope and what comes after
- [Decisions](docs/decisions/) — ADRs
- [Contributing](CONTRIBUTING.md) — dev setup and conventions

## License

[MIT](LICENSE)
