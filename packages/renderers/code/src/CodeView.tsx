import type { Artifact } from '@prism/core'
import * as monaco from 'monaco-editor'
import { type Component, createResource, onCleanup, onMount, Show } from 'solid-js'
import { detectLanguage } from './language'
import { ensureMonacoEnvironment } from './monaco-env'

type RendererView = Component<{ artifact: Artifact }>

/** Owns one Monaco editor + model for the lifetime of the mount. */
const Editor: Component<{ value: string; language: string }> = (props) => {
  let host: HTMLDivElement | undefined
  onMount(() => {
    if (!host) throw new Error('editor host not mounted')
    ensureMonacoEnvironment()
    const model = monaco.editor.createModel(props.value, props.language)
    const editor = monaco.editor.create(host, {
      model,
      readOnly: true,
      domReadOnly: true,
      automaticLayout: true,
      wordWrap: 'off',
      minimap: { enabled: false },
      theme: 'vs-dark',
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      renderLineHighlight: 'none',
    })
    onCleanup(() => {
      editor.dispose()
      model.dispose()
    })
  })
  return <div ref={host} style={{ flex: '1 1 auto', 'min-height': '0' }} />
}

/**
 * The host remounts this component per artifact revision, so a single readText() at
 * mount is enough. A rejected read throws through the resource into the host's
 * ErrorBoundary so the registry can fall back.
 */
export const CodeView: RendererView = (props) => {
  const [text] = createResource(() => props.artifact.readText())
  const loaded = () => {
    const value = text()
    return value === undefined ? undefined : { value }
  }
  return (
    <div
      class="prism-code"
      style={{ display: 'flex', 'flex-direction': 'column', height: '100%', 'min-height': '0' }}
    >
      <Show when={loaded()}>
        {(t) => <Editor value={t().value} language={detectLanguage(props.artifact)} />}
      </Show>
    </div>
  )
}
