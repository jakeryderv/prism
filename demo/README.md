# demo/

One sample file per supported renderer, so the app can be exercised on this repo itself:

```sh
bun run dev:desktop -- -- .
```

then open `demo/` in the file tree. Edit or regenerate any file here while the app is running to see live updates.

| Renderer | Files |
|---|---|
| code (`@prism/renderer-code`) | `code/` — one file per commonly produced language, plus `plain.txt` (universal text fallback) |
| image (`@prism/renderer-image`) | `images/` — png, gif, svg (checkerboard shows through the transparent ones) |

`unsupported.bin` has no renderer and demonstrates the **Open externally** fallback.

**Convention:** when a renderer is added, add its sample file(s) here and a row to this table in the same PR (see the table in `CLAUDE.md`). Keep samples small (< 100 KB) and hand-readable where possible; generated binaries should include how they were generated in this README.

Generated files: `images/gradient.png` and `images/dots.gif` were produced with the python3 snippets in `scripts/make-demo-images.py`.
