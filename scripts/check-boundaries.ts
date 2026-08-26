/**
 * Enforces the dependency rule from docs/architecture.md:
 *   packages/renderers/* and packages/ui/src may import only @prism/core (plus their own deps).
 *   packages/ui/dev (the Vite harness) is exempt: it composes ui + renderers on purpose.
 *   @tauri-apps/* may appear only in packages/desktop.
 * Currently a placeholder that succeeds while there are no packages; grows with them.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..', 'packages')
const forbidden: Array<{ dir: string; pattern: RegExp }> = [
  { dir: 'renderers', pattern: /from ['"]@(tauri-apps|prism\/(desktop|server|ui))/ },
  // ui/src may not depend on renderers; ui/dev (the harness) may, and is exempted in walk().
  { dir: 'ui', pattern: /from ['"]@(tauri-apps|prism\/(desktop|server|renderer-))/ },
]

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === 'target') continue
    const p = join(dir, name)
    if (p === join(root, 'ui', 'dev')) continue // dev harness wires renderers in on purpose
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

let failures = 0
for (const { dir, pattern } of forbidden) {
  for (const file of walk(join(root, dir))) {
    const text = await Bun.file(file).text()
    if (pattern.test(text)) {
      console.error(`boundary violation: ${file} matches ${pattern}`)
      failures++
    }
  }
}
if (failures) process.exit(1)
console.log('boundaries ok')
