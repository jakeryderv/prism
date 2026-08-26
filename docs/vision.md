# Vision

## One line

**A live viewer for the artifacts coding agents produce.**

Prism watches a project directory and previews whatever an agent creates or edits — as it happens — through a pluggable renderer system.

## Problem

Coding agents generate output faster than a human can inspect it: a Markdown report, a CSV of results, an HTML mockup, a chart PNG, a spreadsheet, a PDF. Today you either tab through a code editor's half-supported previews, or open each file in a different native app after the fact. Neither is built around the loop of *agent writes → human looks → human steers*.

## Core loop

```text
agent edits filesystem
        ↓
   file watcher
        ↓
 detect file type
        ↓
 select renderer
        ↓
 live preview
```

## Product direction

- **Now:** universal live file viewer for agent-driven projects. Desktop app, Linux first.
- **Later:** universal visual workspace for inspecting agent artifacts — change history, diffs between revisions, agent annotations, remote/containerized workspaces, third-party renderers.

## Differentiator

Not "supports lots of file types" — editors already do that reasonably well. The differentiator is the combination:

1. **Live and agent-oriented.** Built for watching a directory being written to, not for editing.
2. **Arbitrary artifacts.** Anything an agent can produce should be viewable in place, with a native-app fallback for what isn't.
3. **Change tracking.** (later) What changed, when, and diff against any prior revision — without requiring the agent to commit.
4. **Extensible renderers.** New formats are packages, not core changes.

## Non-goals

- Not an editor. Viewing and light interaction (search, zoom, sort) only.
- Not a file manager. Tree navigation is a means, not the product.
- Not agent-specific. Prism watches the filesystem; it does not depend on any particular agent, protocol, or vendor.

## Deployment

Desktop (Tauri) is canonical: unrestricted filesystem access, native watching, large files, opening in native apps, sitting beside a local agent. Linux → macOS → Windows.

Web/server mode comes later by reusing the same UI over a remote provider (see `architecture.md`), enabling remote agents, containers, SSH hosts, and cloud sandboxes.
