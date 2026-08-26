import { describe, expect, test } from 'bun:test'
import type { FileEvent } from '@prism/core'
import {
  createActivity,
  pushEvent,
  relativeTime,
  setFollow,
  shouldAutoOpen,
} from '../src/store/activity'

const ev = (i: number, kind: FileEvent['kind'] = 'modified'): FileEvent => ({
  kind,
  path: `f${i}`,
  timestamp: i,
})

describe('activity', () => {
  test('events are newest first', () => {
    let s = createActivity()
    for (let i = 0; i < 3; i++) s = pushEvent(s, ev(i))
    expect(s.events.map((e) => e.path)).toEqual(['f2', 'f1', 'f0'])
  })

  test('ring buffer drops the oldest beyond cap', () => {
    let s = createActivity({ cap: 3 })
    for (let i = 0; i < 10; i++) s = pushEvent(s, ev(i))
    expect(s.events.map((e) => e.path)).toEqual(['f9', 'f8', 'f7'])
    expect(createActivity().cap).toBe(500)
  })

  test('follow flag', () => {
    const s = createActivity()
    expect(s.follow).toBe(false)
    expect(setFollow(s, false)).toBe(s)
    expect(setFollow(s, true).follow).toBe(true)
  })

  test('shouldAutoOpen only for created/modified while following', () => {
    expect(shouldAutoOpen(ev(1, 'created'), true)).toBe(true)
    expect(shouldAutoOpen(ev(1, 'modified'), true)).toBe(true)
    expect(shouldAutoOpen(ev(1, 'deleted'), true)).toBe(false)
    expect(shouldAutoOpen(ev(1, 'created'), false)).toBe(false)
  })

  test('relativeTime buckets', () => {
    const now = 1_000_000_000
    expect(relativeTime(now, now)).toBe('just now')
    expect(relativeTime(now - 30_000, now)).toBe('30s ago')
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5m ago')
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(relativeTime(now - 48 * 3_600_000, now)).toBe('2d ago')
  })
})
