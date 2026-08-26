import { describe, expect, test } from 'bun:test'
import {
  type ArtifactHead,
  DEFAULT_MAX_SIZE,
  matchMime,
  matchMimePrefix,
  type Renderer,
  RendererRegistry,
} from '../src'

type View = { name: string }
const r = (id: string, match: Renderer['match'], maxSize?: number): Renderer<View> => ({
  id,
  displayName: id,
  match,
  ...(maxSize === undefined ? {} : { maxSize }),
  load: async () => ({ name: id }),
})
const head = (mime: string, size = 100, path = 'f'): ArtifactHead => ({ path, mime, size })

function registry() {
  return new RendererRegistry<View>()
    .register(r('text', matchMimePrefix('text/', 1), 5_000))
    .register(r('markdown', matchMime(['text/markdown'], 10)))
    .register(r('json-tree', matchMime(['application/json'], 10), 1_000))
    .register(r('json-code', matchMime(['application/json'], 5)))
    .register(r('image', matchMime(['image/png', 'image/jpeg'])))
}

describe('register', () => {
  test('duplicate id throws; unregister', () => {
    const reg = registry()
    expect(() => reg.register(r('text', () => 0))).toThrow(/already registered/)
    expect(reg.unregister('text')).toBe(true)
    expect(reg.unregister('text')).toBe(false)
    expect(reg.get('text')).toBeUndefined()
    expect(reg.all().map((x) => x.id)).not.toContain('text')
  })
})

describe('candidates', () => {
  test('sorted by score, ties keep registration order', () => {
    const ids = registry()
      .candidates(head('application/json'))
      .map((c) => `${c.renderer.id}:${c.score}`)
    expect(ids).toEqual(['json-tree:10', 'json-code:5'])
    const reg = new RendererRegistry<View>().register(r('a', () => 3)).register(r('b', () => 3))
    expect(reg.candidates(head('x')).map((c) => c.renderer.id)).toEqual(['a', 'b'])
  })
})

describe('resolve', () => {
  test('best match wins, alternatives listed best-first', () => {
    const res = registry().resolve(head('text/markdown'))
    expect(res.kind).toBe('render')
    if (res.kind !== 'render') throw new Error()
    expect(res.renderer.id).toBe('markdown')
    expect(res.score).toBe(10)
    expect(res.alternatives.map((a) => a.id)).toEqual(['text'])
  })
  test('unsupported when nothing matches', () => {
    expect(registry().resolve(head('application/pdf'))).toEqual({ kind: 'unsupported' })
  })
  test('too-large only when no fitting renderer remains', () => {
    const reg = registry()
    // json-tree caps at 1000; json-code has the default cap → falls through to it
    const mid = reg.resolve(head('application/json', 2_000))
    expect(mid.kind).toBe('render')
    if (mid.kind !== 'render') throw new Error()
    expect(mid.renderer.id).toBe('json-code')
    expect(mid.alternatives).toEqual([])
    // both exceeded → too-large reports the most permissive limit, not the best score
    const huge = reg.resolve(head('application/json', DEFAULT_MAX_SIZE + 1))
    expect(huge).toMatchObject({ kind: 'too-large', maxSize: DEFAULT_MAX_SIZE })
    if (huge.kind !== 'too-large') throw new Error()
    expect(huge.renderer.id).toBe('json-code')
  })
  test('registry default max size is configurable', () => {
    const reg = new RendererRegistry<View>({ defaultMaxSize: 10 }).register(r('any', () => 1))
    expect(reg.resolve(head('x', 10)).kind).toBe('render')
    expect(reg.resolve(head('x', 11)).kind).toBe('too-large')
    expect(reg.limitFor(r('own', () => 1, 99))).toBe(99)
  })
  test('exclude skips failed renderers and can exhaust to unsupported', () => {
    const reg = registry()
    const second = reg.resolve(head('application/json'), { exclude: ['json-tree'] })
    if (second.kind !== 'render') throw new Error()
    expect(second.renderer.id).toBe('json-code')
    expect(reg.resolve(head('application/json'), { exclude: ['json-tree', 'json-code'] })).toEqual({
      kind: 'unsupported',
    })
  })
  test('prefer picks an applicable, fitting renderer; ignored otherwise', () => {
    const reg = registry()
    const pref = reg.resolve(head('application/json'), { prefer: 'json-code' })
    if (pref.kind !== 'render') throw new Error()
    expect(pref.renderer.id).toBe('json-code')
    expect(pref.alternatives.map((a) => a.id)).toEqual(['json-tree'])
    const na = reg.resolve(head('application/json'), { prefer: 'image' })
    if (na.kind !== 'render') throw new Error()
    expect(na.renderer.id).toBe('json-tree')
    const big = reg.resolve(head('application/json', 2_000), { prefer: 'json-tree' })
    if (big.kind !== 'render') throw new Error()
    expect(big.renderer.id).toBe('json-code')
  })
  test('load is lazy and returns the view', async () => {
    let loads = 0
    const reg = new RendererRegistry<View>().register({
      id: 'lazy',
      displayName: 'Lazy',
      match: () => 1,
      load: async () => {
        loads++
        return { name: 'lazy' }
      },
    })
    const res = reg.resolve(head('x'))
    expect(loads).toBe(0)
    if (res.kind !== 'render') throw new Error()
    expect(await res.renderer.load()).toEqual({ name: 'lazy' })
    expect(loads).toBe(1)
  })
})

describe('match helpers', () => {
  test('matchMime / matchMimePrefix', () => {
    expect(matchMime(['a/b'])(head('a/b'))).toBe(10)
    expect(matchMime(['a/b'], 3)(head('a/c'))).toBe(0)
    expect(matchMimePrefix('text/')(head('text/x-rust'))).toBe(1)
    expect(matchMimePrefix('text/')(head('image/png'))).toBe(0)
  })
})
