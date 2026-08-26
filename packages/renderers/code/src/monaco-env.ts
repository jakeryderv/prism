/**
 * One-time Monaco environment setup. The `?worker` import is a Vite feature (see
 * docs/renderers/code.md); Monaco 0.56's exports map resolves
 * `monaco-editor/editor/editor.worker.js` to the ESM base worker.
 */
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

let installed = false

export function ensureMonacoEnvironment(): void {
  if (installed) return
  installed = true

  // The base editor worker serves every label. Language workers (json, css, html,
  // typescript) are not wired; the features that need them are switched off below.
  self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

  // JSON tokenization runs in the main thread; everything else in this mode is
  // worker-backed, so keep only tokens.
  monaco.json.jsonDefaults.setModeConfiguration({ tokens: true })
  monaco.json.jsonDefaults.setDiagnosticsOptions({ validate: false })
  for (const defaults of [
    monaco.typescript.typescriptDefaults,
    monaco.typescript.javascriptDefaults,
    monaco.css.cssDefaults,
    monaco.css.scssDefaults,
    monaco.css.lessDefaults,
    monaco.html.htmlDefaults,
    monaco.html.handlebarDefaults,
    monaco.html.razorDefaults,
  ]) {
    defaults.setModeConfiguration({})
  }
}
