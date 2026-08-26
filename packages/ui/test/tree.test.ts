import { describe, expect, test } from 'bun:test'
import { type FileEvent, MemoryProvider, ProviderError } from '@prism/core'
import {
  applyTreeEvent,
  childrenOf,
  createTree,
  isLoaded,
  markDeleted,
  removeNode,
  setChildren,
  setExpanded,
  TreeModel,
} from '../src/store/tree'

const ev = (kind: FileEvent['kind'], path: string, size?: number): FileEvent => ({
  kind,
  path,
  timestamp: 100,
  ...(size === undefined ? {} : { size }),
})

function fixture() {
  return new MemoryProvider(
    { 'b.txt': 'b', 'a.txt': 'a', 'src/index.ts': 'x', 'src/lib/util.ts': 'y' },
    { now: () => 1 },
  )
}

const names = (s: ReturnType<typeof createTree>, dir: string) =>
  childrenOf(s, dir).map((n) => n.name)

describe('tree reducers', () => {
  test('setChildren sorts dirs first, then by name', () => {
    const s = setChildren(createTree(), '', [
      { path: 'z.txt', name: 'z.txt', kind: 'file', size: 1, mtime: 0 },
      { path: 'src', name: 'src', kind: 'dir', size: 0, mtime: 0 },
      { path: 'a.txt', name: 'a.txt', kind: 'file', size: 1, mtime: 0 },
    ])
    expect(names(s, '')).toEqual(['src', 'a.txt', 'z.txt'])
  })

  test('created inserts sorted into a loaded parent; ignored for unloaded parent', () => {
    let s = setChildren(createTree(), '', [
      { path: 'src', name: 'src', kind: 'dir', size: 0, mtime: 0 },
      { path: 'b.txt', name: 'b.txt', kind: 'file', size: 1, mtime: 0 },
    ])
    s = applyTreeEvent(s, ev('created', 'a.txt', 3))
    expect(names(s, '')).toEqual(['src', 'a.txt', 'b.txt'])
    expect(childrenOf(s, '')[1]?.size).toBe(3)
    const before = s
    s = applyTreeEvent(s, ev('created', 'src/new.ts'))
    expect(s).toBe(before)
    expect(isLoaded(s, 'src')).toBe(false)
  })

  test('created in a new nested dir surfaces the dir in a loaded grandparent', () => {
    let s = setChildren(createTree(), '', [])
    s = applyTreeEvent(s, ev('created', 'out/result.md'))
    expect(childrenOf(s, '')).toEqual([
      { path: 'out', name: 'out', kind: 'dir', size: 0, mtime: 100 },
    ])
    expect(isLoaded(s, 'out')).toBe(false) // will list fresh when expanded
  })

  test('modified updates size and mtime in place', () => {
    let s = setChildren(createTree(), '', [
      { path: 'a.txt', name: 'a.txt', kind: 'file', size: 1, mtime: 0 },
    ])
    s = applyTreeEvent(s, ev('modified', 'a.txt', 9))
    expect(childrenOf(s, '')).toEqual([
      { path: 'a.txt', name: 'a.txt', kind: 'file', size: 9, mtime: 100 },
    ])
    // modified without size keeps the old size
    s = applyTreeEvent(s, ev('modified', 'a.txt'))
    expect(childrenOf(s, '')[0]?.size).toBe(9)
  })

  test('deleted removes the node, or flags it with keepDeleted', () => {
    const base = setChildren(createTree(), '', [
      { path: 'a.txt', name: 'a.txt', kind: 'file', size: 1, mtime: 0 },
    ])
    expect(names(applyTreeEvent(base, ev('deleted', 'a.txt')), '')).toEqual([])
    const kept = applyTreeEvent(base, ev('deleted', 'a.txt'), { keepDeleted: true })
    expect(childrenOf(kept, '')[0]?.deleted).toBe(true)
    expect(markDeleted(kept, 'a.txt')).toBe(kept)
    expect(names(removeNode(kept, 'a.txt'), '')).toEqual([])
    expect(removeNode(base, 'missing')).toBe(base)
  })

  test('removing a dir drops its cached children and expansion', () => {
    let s = setChildren(createTree(), '', [
      { path: 'src', name: 'src', kind: 'dir', size: 0, mtime: 0 },
    ])
    s = setChildren(s, 'src', [{ path: 'src/i.ts', name: 'i.ts', kind: 'file', size: 1, mtime: 0 }])
    s = setExpanded(s, 'src', true)
    s = removeNode(s, 'src')
    expect(names(s, '')).toEqual([])
    expect(isLoaded(s, 'src')).toBe(false)
    expect(s.expanded.has('src')).toBe(false)
  })
})

describe('TreeModel', () => {
  test('expand lists lazily, caches, and notifies subscribers', async () => {
    const provider = fixture()
    let calls = 0
    const listing = provider.list.bind(provider)
    provider.list = (d) => {
      calls++
      return listing(d)
    }
    const model = new TreeModel(provider)
    const seen: number[] = []
    model.subscribe((s) => seen.push(s.children.size))
    await model.expand('')
    expect(names(model.state, '')).toEqual(['src', 'a.txt', 'b.txt'])
    await model.expand('src')
    expect(names(model.state, 'src')).toEqual(['lib', 'index.ts'])
    await model.expand('src')
    expect(calls).toBe(2)
    expect(seen.length).toBeGreaterThan(0)
  })

  test('toggle collapses without dropping cache; concurrent expands share one list', async () => {
    const model = new TreeModel(fixture())
    await Promise.all([model.expand(''), model.expand('')])
    expect(model.state.expanded.has('')).toBe(true)
    await model.toggle('')
    expect(model.state.expanded.has('')).toBe(false)
    expect(isLoaded(model.state, '')).toBe(true)
  })

  test('list errors propagate', async () => {
    const model = new TreeModel(fixture())
    await expect(model.expand('nope')).rejects.toBeInstanceOf(ProviderError)
  })

  test('events from the provider patch loaded dirs', async () => {
    const provider = fixture()
    const model = new TreeModel(provider)
    provider.watch((e) => model.apply(e))
    await model.expand('')
    provider.write('c.txt', 'c')
    provider.remove('a.txt')
    expect(names(model.state, '')).toEqual(['src', 'b.txt', 'c.txt'])
  })
})
