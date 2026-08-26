import { describe, expect, test } from 'bun:test'
import type { FileEvent } from '@prism/core'
import {
  activateTab,
  applyTabsEvent,
  closeTab,
  emptyTabs,
  hasTab,
  openTab,
} from '../src/store/tabs'

const ev = (kind: FileEvent['kind'], path: string): FileEvent => ({ kind, path, timestamp: 1 })

describe('tabs', () => {
  test('open appends and activates', () => {
    const s = openTab(openTab(emptyTabs, 'a'), 'b')
    expect(s.tabs.map((t) => t.path)).toEqual(['a', 'b'])
    expect(s.active).toBe('b')
  })

  test('reopening an open path activates it without duplicating', () => {
    const s = openTab(openTab(openTab(emptyTabs, 'a'), 'b'), 'a')
    expect(s.tabs.map((t) => t.path)).toEqual(['a', 'b'])
    expect(s.active).toBe('a')
    expect(openTab(s, 'a')).toBe(s) // no-op returns same object
  })

  test('activate only known tabs', () => {
    const s = openTab(openTab(emptyTabs, 'a'), 'b')
    expect(activateTab(s, 'a').active).toBe('a')
    expect(activateTab(s, 'zzz')).toBe(s)
  })

  test('closing the active tab activates the right neighbor, else the left', () => {
    let s = openTab(openTab(openTab(emptyTabs, 'a'), 'b'), 'c')
    s = activateTab(s, 'b')
    s = closeTab(s, 'b')
    expect(s.active).toBe('c')
    s = closeTab(s, 'c')
    expect(s.active).toBe('a')
    s = closeTab(s, 'a')
    expect(s.active).toBeNull()
    expect(s.tabs).toEqual([])
  })

  test('closing an inactive tab keeps the active one', () => {
    const s = closeTab(openTab(openTab(emptyTabs, 'a'), 'b'), 'a')
    expect(s.active).toBe('b')
    expect(closeTab(s, 'nope')).toBe(s)
  })

  test('deleted event flags the tab; created clears it; unrelated paths ignored', () => {
    let s = openTab(emptyTabs, 'a')
    s = applyTabsEvent(s, ev('deleted', 'a'))
    expect(s.tabs[0]?.deleted).toBe(true)
    expect(hasTab(s, 'a')).toBe(true)
    expect(applyTabsEvent(s, ev('deleted', 'a'))).toBe(s)
    s = applyTabsEvent(s, ev('created', 'a'))
    expect(s.tabs[0]?.deleted).toBe(false)
    expect(applyTabsEvent(s, ev('modified', 'other'))).toBe(s)
  })
})
