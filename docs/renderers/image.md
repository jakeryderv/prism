# Renderer: image

- **Package:** `@prism/renderer-image`
- **Matches:** `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/bmp`, `image/x-icon`, `image/avif`, `image/svg+xml` — score 10 (exact MIME match; the list is `IMAGE_MIMES` in `src/mime.ts`). Anything else scores 0, including image types the webview cannot decode (TIFF, HEIC).
- **Max size:** 50 MiB. Same as the registry default, set explicitly so the limit is visible in the package. Decoding is done by the webview, so the real ceiling is memory for the decoded bitmap, not file size.

## What it shows

A single `<img src={await artifact.url()}>` centred on a checkerboard so transparency is visible. Toolbar:

- **Fit** (default) — scale down to the viewport, never up (a 16×16 icon stays 16×16).
- **100%** — natural size; larger images scroll.
- **−** / **+** — step through `ZOOM_STEPS` (10% … 800%) starting from the current effective scale, so the first step out of "fit" is relative to what is on screen.

Status line: natural `width×height`, file size (`formatBytes`, binary units), and the current zoom (`fit` or a percentage).

A new `revision` remounts the component (the viewer host keys on it), so an agent overwriting the file shows the new image; zoom resets to fit on each revision.

The renderer never revokes or caches the URL; ownership of what `url()` returns stays with the provider.

## Dependencies

| Library | Why | Loaded |
|---|---|---|
| none | the webview decodes every listed format natively | — |

The view component itself is behind `load()` (dynamic import) like every renderer, even though it is small.

## SVG via `<img>` — deliberate

SVG is rendered through `<img>`, not inlined into the DOM or an `<iframe>`. In `<img>` the browser treats SVG as a static image: scripts do not run, external resources (fonts, linked images, stylesheets) are not fetched, and the document cannot reach the host page. That is the right default for files an agent wrote. The costs: no text selection, no interactive SVG, and external references inside the SVG render as missing. An interactive/sandboxed-iframe view can be added later as an alternative renderer if needed.

## Limits and known issues

- **Errors propagate, no fallback here.** If `url()` rejects, or the `<img>` fires `error` (corrupt file, MIME/extension mismatch the webview cannot decode), the component throws. The viewer host's `ErrorBoundary` catches it and the registry walks to the next candidate / "Open externally". There is no placeholder or retry inside the renderer by design.
- Animated GIF/WebP/AVIF play but there are no playback controls.
- Zoom is applied by resizing the element, so very large scales on very large images allocate a large layout box; the 8× cap keeps this bounded.
- Fit scale is read from the viewport at interaction time; resizing the window while at an explicit zoom does not change anything, while at "fit" the CSS `max-width/height` keeps the image fitted. The status line shows `fit` rather than a percentage in that mode, since a live percentage would need a `ResizeObserver` for little benefit.
- No pan-by-drag; scrolling is the browser's native overflow scroll.
- EXIF orientation is applied by the browser (`image-orientation: from-image` default), not by this renderer.
- Colour management is whatever the webview does; no ICC handling.

## Testing

Logic is in plain TypeScript and tested with `bun test` under `packages/renderers/image/test/`:

- `mime.test.ts` — `match()` scores each listed type 10 and everything else 0.
- `format.test.ts` — `formatBytes` boundaries.
- `zoom.test.ts` — step navigation, saturation, clamping, fit scale, no-upscale.

The Solid component is not unit-tested (`bun test` cannot run Solid JSX). Exercise it in the `@prism/ui` dev harness against `MemoryProvider`, which ships `assets/pixel.png` (1×1 transparent PNG — checkerboard visible through it) and `assets/logo.svg`; a corrupt fixture (e.g. `.png` containing text) demonstrates the error path handing off to the host.
