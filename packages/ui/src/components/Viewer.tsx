import type { Artifact, Resolution } from '@prism/core'
import {
  type Component,
  createMemo,
  createResource,
  createSignal,
  ErrorBoundary,
  For,
  Match,
  Show,
  Switch,
} from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { useProvider, useRegistry, useWorkspace } from '../context'
import type { RendererView, SolidRenderer } from '../types'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

const OpenExternally: Component<{ path: string }> = (props) => {
  const provider = useProvider()
  const [error, setError] = createSignal<string>()
  const open = () => {
    setError(undefined)
    provider.openExternal(props.path).catch((e: unknown) => setError(errorMessage(e)))
  }
  return (
    <div class="prism-open-external">
      <button type="button" onClick={open}>
        Open externally
      </button>
      <Show when={error()}>{(msg) => <span class="prism-error">{msg()}</span>}</Show>
    </div>
  )
}

/** Renders one artifact: resolves a renderer, lazy-loads it, and walks the fallback chain. */
const ArtifactView: Component<{ artifact: Artifact }> = (props) => {
  const registry = useRegistry()
  // Renderers that threw for this revision. Keyed by revision so a rewrite retries them.
  const [failed, setFailed] = createSignal<{ revision: string; ids: string[] }>({
    revision: '',
    ids: [],
  })
  const [prefer, setPrefer] = createSignal<string>()
  const [notice, setNotice] = createSignal<string>()

  const exclude = () => (failed().revision === props.artifact.revision ? failed().ids : [])

  const resolution = createMemo<Resolution<RendererView>>(() => {
    const p = prefer()
    return registry.resolve(
      { path: props.artifact.path, mime: props.artifact.mime, size: props.artifact.size },
      { exclude: exclude(), ...(p === undefined ? {} : { prefer: p }) },
    )
  })

  function fail(renderer: SolidRenderer, err: unknown) {
    const rev = props.artifact.revision
    setFailed((f) => ({
      revision: rev,
      ids: f.revision === rev ? [...f.ids, renderer.id] : [renderer.id],
    }))
    setNotice(`${renderer.displayName} failed: ${errorMessage(err)}`)
  }

  const tooLarge = () => {
    const r = resolution()
    return r.kind === 'too-large' ? r : undefined
  }
  const renderable = () => {
    const r = resolution()
    return r.kind === 'render' ? r : undefined
  }

  return (
    <div class="prism-artifact">
      <Show when={notice()}>{(msg) => <div class="prism-notice">{msg()}</div>}</Show>
      <Switch>
        <Match when={resolution().kind === 'unsupported'}>
          <div class="prism-message">
            <p>
              No renderer for <code>{props.artifact.path}</code> ({props.artifact.mime}).
            </p>
            <OpenExternally path={props.artifact.path} />
          </div>
        </Match>
        <Match when={tooLarge()}>
          {(r) => {
            return (
              <div class="prism-message">
                <p>
                  <code>{props.artifact.path}</code> is {formatBytes(props.artifact.size)}; the
                  limit for {r().renderer.displayName} is {formatBytes(r().maxSize)}.
                </p>
                <OpenExternally path={props.artifact.path} />
              </div>
            )
          }}
        </Match>
        <Match when={renderable()}>
          {(r) => {
            return (
              <>
                <Show when={r().alternatives.length > 0}>
                  <label class="prism-view-as">
                    view as
                    <select
                      value={r().renderer.id}
                      onChange={(e) => setPrefer(e.currentTarget.value)}
                    >
                      <For each={[r().renderer, ...r().alternatives]}>
                        {(alt) => <option value={alt.id}>{alt.displayName}</option>}
                      </For>
                    </select>
                  </label>
                </Show>
                <Show when={`${props.artifact.revision}:${r().renderer.id}`} keyed>
                  <RendererHost renderer={r().renderer} artifact={props.artifact} onError={fail} />
                </Show>
              </>
            )
          }}
        </Match>
      </Switch>
    </div>
  )
}

/** Mounted fresh per revision+renderer (see the keyed `Show` above). */
const RendererHost: Component<{
  renderer: SolidRenderer
  artifact: Artifact
  onError: (renderer: SolidRenderer, err: unknown) => void
}> = (props) => {
  // Props are stable for the lifetime of this keyed instance (see the keyed `Show`).
  const renderer = props.renderer
  const [view] = createResource(() => renderer.load())
  return (
    <ErrorBoundary
      fallback={(err) => {
        queueMicrotask(() => props.onError(renderer, err))
        return <div class="prism-message">Switching renderer…</div>
      }}
    >
      <Show
        when={view()}
        fallback={<div class="prism-loading">Loading {renderer.displayName}…</div>}
      >
        {(component) => (
          <div class="prism-renderer" data-renderer={renderer.id}>
            <Dynamic component={component()} artifact={props.artifact} />
          </div>
        )}
      </Show>
    </ErrorBoundary>
  )
}

export const Viewer: Component = () => {
  const ws = useWorkspace()
  const active = () => ws.tabs().active
  const slot = createMemo(() => {
    const path = active()
    return path === null ? undefined : ws.artifactFor(path)()
  })
  const openError = () => {
    const s = slot()
    return s?.status === 'error' ? { error: s.error } : undefined
  }
  const ready = () => {
    const s = slot()
    return s?.status === 'ready' ? s.artifact : undefined
  }
  return (
    <div class="prism-viewer">
      <Switch fallback={<div class="prism-message prism-empty">Open a file to preview it.</div>}>
        <Match when={slot()?.status === 'loading'}>
          <div class="prism-loading">Opening {active()}…</div>
        </Match>
        <Match when={openError()}>
          {(s) => (
            <div class="prism-message">
              <p class="prism-error">
                Could not open <code>{active()}</code>: {errorMessage(s().error)}
              </p>
            </div>
          )}
        </Match>
        <Match when={ready()} keyed>
          {(artifact) => <ArtifactView artifact={artifact} />}
        </Match>
      </Switch>
    </div>
  )
}
