/**
 * Lazy directory tree. Children are fetched per directory on first expand and cached;
 * file events patch the cache incrementally so a loaded directory never has to be
 * re-listed. Unloaded directories ignore events (they will list fresh when expanded).
 *
 * Ordering matches `MemoryProvider.list`: directories first, then by name.
 * Directories are never pruned when they empty — real filesystems keep empty dirs.
 */
import { basename, dirname, type Entry, type FileEvent, type WorkspaceProvider } from '@prism/core'

export interface TreeNode extends Entry {
  /** Set when the file was deleted but an open tab keeps it visible (struck-through). */
  deleted?: boolean
}

export interface TreeState {
  /** dir path ('' = root) → sorted children. Present only once loaded. */
  children: ReadonlyMap<string, readonly TreeNode[]>
  expanded: ReadonlySet<string>
}

export function createTree(): TreeState {
  return { children: new Map(), expanded: new Set() }
}

export function compareEntries(a: Entry, b: Entry): number {
  return a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)
}

export function isLoaded(state: TreeState, dir: string): boolean {
  return state.children.has(dir)
}

export function childrenOf(state: TreeState, dir: string): readonly TreeNode[] {
  return state.children.get(dir) ?? []
}

export function setChildren(state: TreeState, dir: string, entries: readonly Entry[]): TreeState {
  const children = new Map(state.children)
  children.set(dir, [...entries].sort(compareEntries))
  return { ...state, children }
}

export function setExpanded(state: TreeState, dir: string, expanded: boolean): TreeState {
  if (state.expanded.has(dir) === expanded) return state
  const next = new Set(state.expanded)
  if (expanded) next.add(dir)
  else next.delete(dir)
  return { ...state, expanded: next }
}

function withChildren(
  state: TreeState,
  dir: string,
  fn: (list: readonly TreeNode[]) => readonly TreeNode[] | undefined,
): TreeState {
  const current = state.children.get(dir)
  if (!current) return state
  const next = fn(current)
  if (!next || next === current) return state
  const children = new Map(state.children)
  children.set(dir, next)
  return { ...state, children }
}

function insertSorted(list: readonly TreeNode[], node: TreeNode): readonly TreeNode[] {
  const out = list.filter((n) => n.path !== node.path)
  const i = out.findIndex((n) => compareEntries(node, n) < 0)
  if (i === -1) out.push(node)
  else out.splice(i, 0, node)
  return out
}

/** Insert or replace `node` in its parent, creating ancestor dir entries in loaded dirs. */
export function upsertNode(state: TreeState, node: TreeNode): TreeState {
  const parent = dirname(node.path)
  let next = withChildren(state, parent, (list) => insertSorted(list, node))
  // If the parent directory itself is new to a loaded grandparent, surface it.
  if (parent !== '' && !isLoaded(state, parent)) {
    const grand = dirname(parent)
    if (isLoaded(state, grand) && !childrenOf(state, grand).some((n) => n.path === parent)) {
      next = upsertNode(next, {
        path: parent,
        name: basename(parent),
        kind: 'dir',
        size: 0,
        mtime: node.mtime,
      })
    }
  }
  return next
}

export function removeNode(state: TreeState, path: string): TreeState {
  const parent = dirname(path)
  let next = withChildren(state, parent, (list) =>
    list.some((n) => n.path === path) ? list.filter((n) => n.path !== path) : undefined,
  )
  if (next.children.has(path) || next.expanded.has(path)) {
    const children = new Map(next.children)
    children.delete(path)
    const expanded = new Set(next.expanded)
    expanded.delete(path)
    next = { children, expanded }
  }
  return next
}

export function markDeleted(state: TreeState, path: string): TreeState {
  return withChildren(state, dirname(path), (list) => {
    const i = list.findIndex((n) => n.path === path)
    if (i === -1) return undefined
    const node = list[i] as TreeNode
    if (node.deleted) return undefined
    const out = list.slice()
    out[i] = { ...node, deleted: true }
    return out
  })
}

export function findNode(state: TreeState, path: string): TreeNode | undefined {
  return childrenOf(state, dirname(path)).find((n) => n.path === path)
}

/**
 * Apply a file event to loaded directories. `deleted` removes the node unless
 * `keepDeleted` is true, in which case it is flagged instead (an open tab keeps it visible).
 */
export function applyTreeEvent(
  state: TreeState,
  ev: FileEvent,
  opts: { keepDeleted?: boolean } = {},
): TreeState {
  if (ev.kind === 'deleted') {
    return opts.keepDeleted ? markDeleted(state, ev.path) : removeNode(state, ev.path)
  }
  const existing = findNode(state, ev.path)
  const node: TreeNode = {
    path: ev.path,
    name: basename(ev.path),
    kind: 'file',
    size: ev.size ?? existing?.size ?? 0,
    mtime: ev.timestamp,
  }
  return upsertNode(state, node)
}

/**
 * Owns a `TreeState` and knows how to fill it from a provider. Framework-free; the
 * Solid layer subscribes and mirrors `state` into a signal.
 */
export class TreeModel {
  private current = createTree()
  private listeners = new Set<(s: TreeState) => void>()
  private pending = new Map<string, Promise<void>>()

  constructor(private readonly provider: Pick<WorkspaceProvider, 'list'>) {}

  get state(): TreeState {
    return this.current
  }

  subscribe(cb: (s: TreeState) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  update(fn: (s: TreeState) => TreeState): void {
    const next = fn(this.current)
    if (next === this.current) return
    this.current = next
    for (const l of this.listeners) l(next)
  }

  /** Expand a directory, listing it on first use. Errors from `list` propagate. */
  expand(dir: string): Promise<void> {
    this.update((s) => setExpanded(s, dir, true))
    if (isLoaded(this.current, dir)) return Promise.resolve()
    let p = this.pending.get(dir)
    if (!p) {
      p = this.provider
        .list(dir)
        .then((entries) => this.update((s) => setChildren(s, dir, entries)))
        .finally(() => this.pending.delete(dir))
      this.pending.set(dir, p)
    }
    return p
  }

  collapse(dir: string): void {
    this.update((s) => setExpanded(s, dir, false))
  }

  toggle(dir: string): Promise<void> {
    if (this.current.expanded.has(dir)) {
      this.collapse(dir)
      return Promise.resolve()
    }
    return this.expand(dir)
  }

  apply(ev: FileEvent, opts: { keepDeleted?: boolean } = {}): void {
    this.update((s) => applyTreeEvent(s, ev, opts))
  }

  remove(path: string): void {
    this.update((s) => removeNode(s, path))
  }
}
