/**
 * Dev harness: mounts the workspace on a MemoryProvider with fixtures, the real code and
 * image renderers, a trivial text renderer, and a deliberately broken markdown renderer so
 * the fallback path is visible.
 */
import { MemoryProvider, matchMime, matchMimePrefix, RendererRegistry } from '@prism/core'
import { codeRenderer } from '@prism/renderer-code'
import { imageRenderer } from '@prism/renderer-image'
import { type Component, createResource, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { PrismProvider, type RendererView, type SolidRenderer, Workspace } from '../src'

// 1x1 transparent PNG
const png = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

const provider = new MemoryProvider({
  'README.md': '# Prism\n\nAgent output viewer. This file uses the *broken* renderer first.\n',
  'notes.txt': 'Plain text fixture.\nSecond line.\n',
  'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2),
  'data/report.csv': 'id,name,score\n1,alpha,0.9\n2,beta,0.4\n',
  'data/config.yaml': 'name: prism\nwatch: true\n',
  'src/index.ts': 'export const answer = 42\n',
  'src/util/strings.ts': 'export const upper = (s: string) => s.toUpperCase()\n',
  'assets/pixel.png': png,
  'assets/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
  'logs/agent.log': 'boot\n',
})

const TextView: RendererView = (props) => {
  const [text] = createResource(
    () => props.artifact,
    (a) => a.readText(),
  )
  return <pre>{text()}</pre>
}

const text: SolidRenderer = {
  id: 'text',
  displayName: 'Text',
  match: (head) => (matchMimePrefix('text/')(head) || head.mime === 'application/json' ? 1 : 0),
  load: async () => TextView,
}

const broken: SolidRenderer = {
  id: 'broken',
  displayName: 'Broken markdown',
  match: matchMime(['text/markdown'], 20),
  load: async () => {
    const Broken: RendererView = () => {
      throw new Error('deliberately broken renderer')
    }
    return Broken
  },
}

const registry = new RendererRegistry<RendererView>()
  .register(codeRenderer)
  .register(imageRenderer)
  .register(text)
  .register(broken)

const App: Component = () => {
  const [running, setRunning] = createSignal(false)
  let timer: ReturnType<typeof setInterval> | undefined
  let tick = 0
  const step = () => {
    tick++
    const log = `logs/agent.log`
    switch (tick % 4) {
      case 0:
        provider.write(log, `boot\n${'step '.repeat(tick)}\n`)
        break
      case 1:
        provider.write(
          `out/result-${tick}.md`,
          `# Result ${tick}\n\nGenerated at ${new Date().toISOString()}\n`,
        )
        break
      case 2:
        provider.write('notes.txt', `Plain text fixture.\nEdited ${tick} times.\n`)
        break
      default: {
        const victim = `out/result-${tick - 2}.md`
        try {
          provider.remove(victim)
        } catch {
          provider.write(
            'data/report.csv',
            `id,name,score\n${tick},gamma,${Math.random().toFixed(2)}\n`,
          )
        }
      }
    }
  }
  const toggle = () => {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    } else {
      timer = setInterval(step, 1500)
      step()
    }
    setRunning(!!timer)
  }
  return (
    <>
      <div class="harness-bar">
        <strong>@prism/ui harness</strong>
        <button type="button" onClick={toggle}>
          {running() ? 'Stop agent' : 'Simulate agent'}
        </button>
      </div>
      <div class="harness-fill">
        <PrismProvider provider={provider} registry={registry}>
          <Workspace />
        </PrismProvider>
      </div>
    </>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
render(() => <App />, root)
