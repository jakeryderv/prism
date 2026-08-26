import { RendererRegistry } from '@prism/core'
import { codeRenderer } from '@prism/renderer-code'
import { imageRenderer } from '@prism/renderer-image'
import { PrismProvider, type RendererView, Workspace } from '@prism/ui'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { type Component, createSignal, Match, onMount, Show, Switch } from 'solid-js'
import { debugEnabled, logLine, TauriProvider } from './tauri-provider'

const registry = new RendererRegistry<RendererView>().register(codeRenderer).register(imageRenderer)

export const App: Component = () => {
  const [provider, setProvider] = createSignal<TauriProvider>()
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)

  const openWorkspace = async (path: string) => {
    setBusy(true)
    setError(undefined)
    try {
      const p = await TauriProvider.open(path)
      await logLine(`workspace opened: ${p.root}`)
      // Dev aid: with PRISM_DEBUG=1 the Rust watcher logs what it emits; echo what the UI
      // actually received next to it so the two can be compared in one stderr stream.
      if (await debugEnabled()) p.watch((ev) => void logLine(`fs:event ${ev.kind} ${ev.path}`))
      setProvider(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const pick = async () => {
    const chosen = await openDialog({ directory: true, multiple: false, title: 'Open workspace' })
    if (typeof chosen === 'string') await openWorkspace(chosen)
  }

  onMount(async () => {
    const initial = await TauriProvider.initialPath()
    if (initial) await openWorkspace(initial)
  })

  return (
    <Switch>
      <Match when={provider()}>
        {(p) => (
          <PrismProvider provider={p()} registry={registry}>
            <Workspace />
          </PrismProvider>
        )}
      </Match>
      <Match when={!provider()}>
        <div style={{ height: '100%', display: 'grid', 'place-items': 'center' }}>
          <div style={{ display: 'grid', gap: '12px', 'justify-items': 'center' }}>
            <button
              type="button"
              disabled={busy()}
              onClick={pick}
              style={{
                font: 'inherit',
                'font-size': '15px',
                padding: '8px 18px',
                background: '#353945',
                color: 'inherit',
                border: '1px solid #33363e',
                'border-radius': '6px',
                cursor: 'pointer',
              }}
            >
              Open folder…
            </button>
            <Show when={error()}>{(msg) => <div style={{ color: '#f28b82' }}>{msg()}</div>}</Show>
          </div>
        </div>
      </Match>
    </Switch>
  )
}
