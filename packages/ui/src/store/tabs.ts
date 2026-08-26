/**
 * Tab strip state, keyed by workspace path. Pure functions over an immutable state
 * object so it can be tested without Solid and wrapped in a signal by `createWorkspace`.
 *
 * Deleted files: the tab stays open and is flagged `deleted` (struck-through in the UI)
 * so the user sees the file vanish rather than the tab silently closing; a later
 * `created` for the same path clears the flag. Closing the tab removes it.
 */
import type { FileEvent } from '@prism/core'

export interface Tab {
  path: string
  deleted: boolean
}

export interface TabsState {
  tabs: readonly Tab[]
  active: string | null
}

export const emptyTabs: TabsState = { tabs: [], active: null }

export function openTab(state: TabsState, path: string): TabsState {
  if (state.tabs.some((t) => t.path === path)) {
    return state.active === path ? state : { ...state, active: path }
  }
  return { tabs: [...state.tabs, { path, deleted: false }], active: path }
}

export function activateTab(state: TabsState, path: string): TabsState {
  if (state.active === path || !state.tabs.some((t) => t.path === path)) return state
  return { ...state, active: path }
}

export function closeTab(state: TabsState, path: string): TabsState {
  const idx = state.tabs.findIndex((t) => t.path === path)
  if (idx === -1) return state
  const tabs = state.tabs.filter((t) => t.path !== path)
  let active = state.active
  if (active === path) {
    // Prefer the tab to the right, then the one to the left.
    const neighbor = tabs[idx] ?? tabs[idx - 1]
    active = neighbor?.path ?? null
  }
  return { tabs, active }
}

export function hasTab(state: TabsState, path: string): boolean {
  return state.tabs.some((t) => t.path === path)
}

export function applyTabsEvent(state: TabsState, ev: FileEvent): TabsState {
  const idx = state.tabs.findIndex((t) => t.path === ev.path)
  if (idx === -1) return state
  const tab = state.tabs[idx] as Tab
  const deleted = ev.kind === 'deleted'
  if (tab.deleted === deleted) return state
  const tabs = state.tabs.slice()
  tabs[idx] = { ...tab, deleted }
  return { ...state, tabs }
}
