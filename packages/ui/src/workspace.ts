/**
 * Solid-side workspace state. Owns the signals, subscribes to `provider.watch` once,
 * and routes events to the tree, activity, and tabs stores in `./store`.
 */
import type { Artifact, FileEvent, WorkspaceProvider } from '@prism/core'
import { type Accessor, createSignal, onCleanup } from 'solid-js'
import {
  type ActivityState,
  activateTab,
  applyTabsEvent,
  closeTab as closeTabState,
  createActivity,
  emptyTabs,
  hasTab,
  openTab,
  pushEvent,
  setFollow as setFollowState,
  shouldAutoOpen,
  type TabsState,
  type TreeModel as TreeModelType,
  type TreeState,
} from './store'
import { TreeModel } from './store/tree'

export type ArtifactSlot =
  | { status: 'loading' }
  | { status: 'ready'; artifact: Artifact }
  | { status: 'error'; error: unknown }

export interface Workspace {
  provider: WorkspaceProvider
  tree: Accessor<TreeState>
  treeModel: TreeModelType
  tabs: Accessor<TabsState>
  activity: Accessor<ActivityState>
  follow: Accessor<boolean>
  setFollow(follow: boolean): void
  /** Open (or activate) a tab and load its artifact. */
  openPath(path: string): void
  closeTab(path: string): void
  activate(path: string): void
  /**
   * Reactive artifact for a path. Re-opened via `provider.open` whenever a `modified`
   * event arrives, so consumers observe a new `Artifact` with a new `revision`.
   */
  artifactFor(path: string): Accessor<ArtifactSlot | undefined>
  dispose(): void
}

export function createWorkspace(provider: WorkspaceProvider): Workspace {
  const treeModel = new TreeModel(provider)
  const [tree, setTree] = createSignal(treeModel.state)
  const unsubTree = treeModel.subscribe(setTree)
  const [tabs, setTabs] = createSignal(emptyTabs)
  const [activity, setActivity] = createSignal(createActivity())
  const slots = new Map<string, ReturnType<typeof createSignal<ArtifactSlot | undefined>>>()

  function slot(path: string) {
    let s = slots.get(path)
    if (!s) {
      s = createSignal<ArtifactSlot | undefined>(undefined)
      slots.set(path, s)
    }
    return s
  }

  function load(path: string): void {
    const [get, set] = slot(path)
    if (get() === undefined) set({ status: 'loading' })
    provider.open(path).then(
      (artifact) => set({ status: 'ready', artifact }),
      (error: unknown) => set({ status: 'error', error }),
    )
  }

  function openPath(path: string): void {
    setTabs((s) => openTab(s, path))
    if (slot(path)[0]() === undefined) load(path)
  }

  function closeTab(path: string): void {
    const wasDeleted = tabs().tabs.find((t) => t.path === path)?.deleted
    setTabs((s) => closeTabState(s, path))
    slots.delete(path)
    if (wasDeleted) treeModel.remove(path)
  }

  function onEvent(ev: FileEvent): void {
    const open = hasTab(tabs(), ev.path)
    treeModel.apply(ev, { keepDeleted: open })
    setActivity((s) => pushEvent(s, ev))
    setTabs((s) => applyTabsEvent(s, ev))
    if (ev.kind !== 'deleted' && slots.has(ev.path)) load(ev.path)
    if (shouldAutoOpen(ev, activity().follow)) openPath(ev.path)
  }

  const unwatch = provider.watch(onEvent)
  const dispose = () => {
    unwatch()
    unsubTree()
  }
  onCleanup(dispose)

  return {
    provider,
    tree,
    treeModel,
    tabs,
    activity,
    follow: () => activity().follow,
    setFollow: (f) => setActivity((s) => setFollowState(s, f)),
    openPath,
    closeTab,
    activate: (path) => setTabs((s) => activateTab(s, path)),
    artifactFor: (path) => slot(path)[0],
    dispose,
  }
}
