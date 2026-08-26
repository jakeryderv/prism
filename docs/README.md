# Docs

How documentation is organized and when to touch what.

| File / dir | Purpose | Update when |
|---|---|---|
| `vision.md` | Product concept, differentiator, long-term direction | direction changes (rare) |
| `architecture.md` | Packages, boundaries, provider interface, renderer contract, watcher semantics | any structural code change |
| `roadmap.md` | MVP scope and phases, current status | a phase item is done, added, dropped, or reshaped |
| `decisions/` | Architecture Decision Records — *why* something was chosen | a non-obvious technical choice is made or reversed |
| `renderers/` | One page per renderer: scope, deps, limits, known issues | a renderer is added or materially changed |

## Principles

- **Docs describe what is, not what we hope.** Aspirational content goes in `roadmap.md` or an ADR's "consequences" section, not in `architecture.md`.
- **One home per fact.** If two docs say the same thing, one links to the other.
- **ADRs are append-only.** To reverse a decision, write a new ADR that supersedes the old one and mark the old one `superseded`.
- **Short over complete.** A doc nobody reads is worse than none.

## Templates

- `decisions/0000-template.md`
- `renderers/_template.md`

## Task tracking

GitHub Issues, labeled by area (`core`, `ui`, `desktop`, `renderer`, `docs`, `ci`) and type (`bug`, `feature`, `chore`). The MVP milestone and a Project board track progress. `roadmap.md` is the human-readable summary; issues are the source of truth for status.
