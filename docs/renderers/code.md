# Renderer: code

- **Package:** `@prism/renderer-code`
- **Matches:** every MIME where core's `isTextMime` is true. Score **1** when no grammar is known (universal text fallback: `.txt`, `.log`, `.csv`, sniffed `text/plain`, …) and **5** when the extension or MIME maps to a Monaco language (`src/language.ts`: ts/tsx/js/jsx, json/jsonl/ipynb, yaml, toml (as INI), md, py, rs, go, css/scss/less, html, xml/svg, sh, sql, java, c/cpp, cs, rb, php, Dockerfile, …). Dedicated renderers (Markdown, JSON tree, CSV) are expected to score higher; this one stays in the "view as" list as the raw view.
- **Max size:** 20 MiB. Monaco gets sluggish beyond that; the registry reports too-large above it.
- **Demo files:** `demo/code/`

## What it shows

A read-only Monaco editor (`vs-dark`, line numbers, minimap off, word wrap off, automatic layout) with syntax highlighting from Monaco's Monarch grammars. Find (`Ctrl+F`), folding, bracket matching and selection work; editing does not (`readOnly` + `domReadOnly`).

The host remounts the view per artifact revision, so the component reads `readText()` once on mount and creates one model + editor, both disposed in `onCleanup`. A rejected `readText()` throws through the Solid resource into the host's `ErrorBoundary`; the registry then falls back.

## Dependencies

| Library | Why | Loaded |
|---|---|---|
| `monaco-editor` ^0.56 | editor, grammars | lazily — `load()` dynamic-imports `CodeView.tsx`, the only module that imports Monaco; the initial graph contains just `index.ts` + `language.ts` |

### Monaco setup (`src/monaco-env.ts`)

- `self.MonacoEnvironment.getWorker` is installed once (module-level guard) and returns the base editor worker for every label, imported as `monaco-editor/editor/editor.worker.js?worker` (the 0.56 exports map; the old `esm/vs/...` path no longer resolves).
- Only the base worker is wired. The `monaco-editor` entry also registers the CSS/HTML/JSON/TypeScript *language features* (diagnostics, hovers, completions) which need their own workers, so those modes are switched off via `setModeConfiguration` (JSON keeps its main-thread tokenizer). Tokenization for every language is main-thread Monarch and unaffected.
- **Vite assumption:** the `?worker` import is a Vite feature; Prism's desktop app and the `@prism/ui` harness both build with Vite. Under any other bundler this module needs an equivalent.
- Wiring language workers later: Monaco 0.56 self-provisions all workers via `new Worker(new URL('<x>.worker.js', import.meta.url))` when `getWorker` returns nothing for a label, so it is mostly a matter of dropping the `setModeConfiguration({})` overrides (and returning the base worker only for the `editorWorkerService` label). Vite already emits those worker files as separate assets; they are not fetched today.

## Limits and known issues

- 20 MiB cap; very long single lines are slow regardless of size (Monaco limitation).
- No TOML grammar in Monaco; `.toml` is highlighted as INI.
- `Makefile`, `.gitignore`, `.env` and other extensionless text files get `plaintext` (score 1).
- Theme is fixed to `vs-dark`; no light theme yet.
- No language-service features (diagnostics, hover, go-to) — see setup above.
- Score 5 for Markdown/JSON/CSV means this renderer wins until their dedicated renderers land, which is intended.
- The Monaco chunk is ~3.9 MB minified (~1 MB gzip); first open of a text file pays that once.
- Not exercised in an automated browser test; the smoke check so far is a Vite build of the package plus manual use in the harness.

## Testing

`test/language.test.ts` (bun:test) covers `languageForPath`, `languageForMime`, `detectLanguage` and `matchCode`, including agreement with core's `detectMime` for the harness fixtures (`src/index.ts`, `data/config.yaml`, `data/report.csv`, `assets/pixel.png`, `logs/agent.log`). The Solid component is not unit-tested (`bun test` cannot run Solid JSX); it is exercised through the `@prism/ui` harness on `MemoryProvider`.
