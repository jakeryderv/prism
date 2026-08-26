import { describe, expect, test } from 'bun:test'
import { type FileEvent, MemoryProvider, normalizePath, ProviderError } from '../src'

function fixture() {
  let t = 1000
  const p = new MemoryProvider(
    {
      'README.md': '# Prism',
      'src/index.ts': 'export {}',
      'src/util/a.ts': 'a',
      'out/chart.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    },
    { now: () => (t += 1) },
  )
  return p
}

describe('normalizePath', () => {
  test('canonical form', () => {
    expect(normalizePath('/a//b/./c/')).toBe('a/b/c')
    expect(normalizePath('a\\b')).toBe('a/b')
    expect(normalizePath('a/../b')).toBe('b')
    expect(normalizePath('../../x')).toBe('x')
    expect(normalizePath('')).toBe('')
  })
})

describe('list', () => {
  test('root: dirs first, then files, sorted', async () => {
    const names = (await fixture().list('')).map((e) => `${e.kind}:${e.name}`)
    expect(names).toEqual(['dir:out', 'dir:src', 'file:README.md'])
  })
  test('nested dir', async () => {
    const entries = await fixture().list('src')
    expect(entries.map((e) => e.path)).toEqual(['src/util', 'src/index.ts'])
    expect(entries[0]?.kind).toBe('dir')
  })
  test('errors', async () => {
    const p = fixture()
    await expect(p.list('nope')).rejects.toBeInstanceOf(ProviderError)
    await expect(p.list('README.md')).rejects.toMatchObject({ code: 'not-directory' })
  })
})

describe('stat', () => {
  test('file and dir', async () => {
    const p = fixture()
    expect(await p.stat('src/index.ts')).toMatchObject({ kind: 'file', size: 9, name: 'index.ts' })
    expect(await p.stat('src')).toMatchObject({ kind: 'dir', name: 'src' })
    expect(await p.stat('')).toMatchObject({ kind: 'dir', path: '' })
    await expect(p.stat('missing')).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('open', () => {
  test('artifact fields and reads', async () => {
    const a = await fixture().open('README.md')
    expect(a).toMatchObject({ path: 'README.md', mime: 'text/markdown', size: 7 })
    expect(a.revision).toMatch(/^[0-9a-f]{16}$/)
    expect(await a.readText()).toBe('# Prism')
    expect((await a.read()).length).toBe(7)
  })
  test('binary detected by magic', async () => {
    const a = await fixture().open('out/chart.png')
    expect(a.mime).toBe('image/png')
    const url = await a.url()
    expect(url).toMatch(/^(blob:|data:image\/png;base64,)/)
    expect(await a.url()).toBe(url) // stable
  })
  test('revision tracks content, not path', async () => {
    const p = fixture()
    const r1 = (await p.open('README.md')).revision
    p.write('README.md', '# Prism v2')
    const r2 = (await p.open('README.md')).revision
    expect(r2).not.toBe(r1)
    p.write('copy.md', '# Prism')
    expect((await p.open('copy.md')).revision).toBe(r1)
  })
  test('errors', async () => {
    const p = fixture()
    await expect(p.open('src')).rejects.toMatchObject({ code: 'is-directory' })
    await expect(p.open('nope.txt')).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('watch', () => {
  test('emits created / modified / deleted with metadata', () => {
    const p = fixture()
    const events: FileEvent[] = []
    const stop = p.watch((e) => events.push(e))
    p.write('new.txt', 'x')
    p.write('new.txt', 'xy')
    p.remove('new.txt')
    stop()
    p.write('after.txt', 'ignored')
    expect(events.map((e) => e.kind)).toEqual(['created', 'modified', 'deleted'])
    expect(events[0]).toMatchObject({ path: 'new.txt', size: 1 })
    expect(events[1]?.hash).toMatch(/^[0-9a-f]{16}$/)
    expect(events[2]?.size).toBeUndefined()
    expect(events.every((e) => e.timestamp > 0)).toBe(true)
  })
  test('remove of missing path throws', () => {
    expect(() => fixture().remove('nope')).toThrow(ProviderError)
  })
})

test('openExternal is unsupported', async () => {
  await expect(fixture().openExternal('README.md')).rejects.toMatchObject({ code: 'unsupported' })
})
