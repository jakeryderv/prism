import { basename } from '@prism/core'
import { type Component, For } from 'solid-js'
import { useWorkspace } from '../context'

export const Tabs: Component = () => {
  const ws = useWorkspace()
  return (
    <div class="prism-tabs" role="tablist">
      <For each={ws.tabs().tabs}>
        {(tab) => (
          <div
            class="prism-tab"
            classList={{ 'is-active': ws.tabs().active === tab.path, 'is-deleted': tab.deleted }}
            role="tab"
            aria-selected={ws.tabs().active === tab.path}
            title={tab.path}
          >
            <button type="button" class="prism-tab-label" onClick={() => ws.activate(tab.path)}>
              {basename(tab.path)}
            </button>
            <button
              type="button"
              class="prism-tab-close"
              aria-label={`Close ${tab.path}`}
              onClick={() => ws.closeTab(tab.path)}
            >
              ×
            </button>
          </div>
        )}
      </For>
    </div>
  )
}
