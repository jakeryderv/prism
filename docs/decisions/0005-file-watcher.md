# ADR-0005: File watcher — notify-debouncer-full, ignore crate, existence-map normalization

- **Status:** accepted
- **Date:** 2026-08-25

## Context

Prism's core loop is "an agent writes a file, the viewer updates". Raw filesystem notifications are the wrong shape for that: editors and agents write in bursts, atomic saves show up as create-tmp + rename, and every backend (inotify, FSEvents, ReadDirectoryChangesW) reports differently. The UI wants one clean `created | modified | deleted` per path per burst (core's `FileEvent`), no events for `node_modules`/`.git`/build output, and no half-written files. It must run in the Tauri process without touching the async runtime, and stop cleanly on workspace switch and exit.

## Decision

`packages/desktop/src-tauri/src/watcher.rs`:

- **`notify` 8 + `notify-debouncer-full` 0.6** for the platform backend and per-path coalescing (150 ms window). The debouncer's callback only forwards batches over a channel; one std thread (`prism-watcher`) does the rest.
- **`ignore` crate** (`GitignoreBuilder`) for `.gitignore` semantics: a built-in list (`.git`, `node_modules`, `target`, `dist`, `.cache`, `__pycache__`, `.venv`, `.DS_Store`, `*.swp`, `*~`, `.#*`, `4913`) followed by the root `.gitignore`. `matched_path_or_any_parents` makes "inside an ignored directory" a single check that works for deleted paths too.
- **Existence-map normalization.** Instead of interpreting event kinds, `normalize()` collects the paths a batch touched, skips Access events, stats each path, and compares with `known: HashMap<rel_path, bool>` (seeded by a walk at start): exists+unknown → `created`, exists+known → `modified`, gone+known → `deleted`, gone+unknown → nothing. Rename pairs, tmp+rename atomic saves, and create+modify bursts all fall out of that rule without special cases. A 50 ms settle re-stat guards freshly written files. `size` always, `hash` (FNV-1a 64, same as core) for files ≤ 1 MiB, nothing for directories.
- Stop = drop: the debouncer stops on drop, the closed channel ends the normalizer thread, and `WatcherHandle::drop` joins it. `WatcherState` holds the current handle; `workspace_open` replaces it, `RunEvent::Exit` clears it.

## Alternatives considered

- **Raw `notify` events** — every consumer would have to reimplement coalescing and the rename/tmp dance per backend; the debouncer already does the time-window part well and is maintained alongside notify.
- **Polling (notify's `PollWatcher` or our own stat loop)** — backend-independent and immune to inotify limits, but latency of seconds or CPU cost on large trees; wrong trade for a live viewer. Kept as a future opt-in for network filesystems.
- **inotify directly** — Linux-only; we need macOS/Windows on the roadmap and notify wraps all three.
- **watchexec's filter library (`watchexec-filterer-ignore`/`ignore-files`)** — richer (nested and global ignore files, project-type detection) but pulls in the watchexec event model and tokio; the `ignore` crate alone covers what we need with one root file, and nested `.gitignore` support can be added by walking for them with the same builder.
- **Event-kind interpretation** (map `Rename(From)` → deleted, `Rename(To)` → created, …) — the kinds differ by backend and lie under coalescing; checking the disk after the window is simpler and self-correcting.

## Consequences

- One rule decides kind, so pre-existing files must be in `known` at start: the seed walk costs one directory traversal per open (ignore rules prune the big trees). A path that changes during the walk is still correct — its batch is processed after the walk on the same thread.
- Access events are dropped on purpose; a consumer that wants "file was read" has no hook here.
- Only the root `.gitignore` is honored. Nested ones and `.git/info/exclude` are a follow-up.
- **Linux:** recursive inotify registers one watch per directory. Large workspaces can hit `fs.inotify.max_user_watches` (commonly 8192 or 65536 by default); the failure surfaces as an `io` error from `workspace_open`, not a silent degradation. Document `sysctl fs.inotify.max_user_watches=524288` in the packaging notes when we ship.
- **macOS/Windows:** FSEvents and ReadDirectoryChangesW are recursive natively with no per-directory limit, but report coarser kinds — which the existence-map approach does not depend on. Untested until those builds exist.
- The `hash` field is the hook for the revision store (Phase 2); the 1 MiB cap bounds the read cost per event and can be raised without changing the event shape.
