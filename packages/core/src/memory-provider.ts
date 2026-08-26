import { detectMime } from './file-type'
import { fnv1a64 } from './hash'
import {
  type Artifact,
  basename,
  type Entry,
  type FileEvent,
  normalizePath,
  ProviderError,
  type Unsubscribe,
  type WorkspaceProvider,
} from './provider'

interface Stored {
  bytes: Uint8Array
  mtime: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * In-memory WorkspaceProvider for tests and component stories. Directories are
 * implicit (derived from file paths). `write`/`remove` mutate and emit events,
 * which lets tests drive the same watcher path the real providers use.
 */
export class MemoryProvider implements WorkspaceProvider {
  readonly root: string
  private files = new Map<string, Stored>()
  private listeners = new Set<(ev: FileEvent) => void>()
  private now: () => number

  constructor(
    initial: Record<string, string | Uint8Array> = {},
    opts: { root?: string; now?: () => number } = {},
  ) {
    this.root = opts.root ?? 'memory://'
    this.now = opts.now ?? Date.now
    for (const [p, v] of Object.entries(initial)) this.put(p, v)
  }

  // --- mutation (test-facing) ---

  write(path: string, content: string | Uint8Array): void {
    const p = normalizePath(path)
    const existed = this.files.has(p)
    const s = this.put(p, content)
    this.emit({
      kind: existed ? 'modified' : 'created',
      path: p,
      timestamp: s.mtime,
      size: s.bytes.length,
      hash: fnv1a64(s.bytes),
    })
  }

  remove(path: string): void {
    const p = normalizePath(path)
    if (!this.files.delete(p)) throw new ProviderError('not-found', p)
    this.emit({ kind: 'deleted', path: p, timestamp: this.now() })
  }

  // --- WorkspaceProvider ---

  async list(dir: string): Promise<Entry[]> {
    const d = normalizePath(dir)
    if (d !== '' && this.files.has(d)) throw new ProviderError('not-directory', d)
    const prefix = d === '' ? '' : `${d}/`
    const seen = new Map<string, Entry>()
    for (const [p, s] of this.files) {
      if (!p.startsWith(prefix)) continue
      const rest = p.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) {
        seen.set(rest, { path: p, name: rest, kind: 'file', size: s.bytes.length, mtime: s.mtime })
      } else {
        const name = rest.slice(0, slash)
        const path = prefix + name
        const prev = seen.get(name)
        const mtime = Math.max(prev?.mtime ?? 0, s.mtime)
        seen.set(name, { path, name, kind: 'dir', size: 0, mtime })
      }
    }
    if (d !== '' && seen.size === 0) throw new ProviderError('not-found', d)
    return [...seen.values()].sort((a, b) =>
      a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name.localeCompare(b.name),
    )
  }

  async stat(path: string): Promise<Entry> {
    const p = normalizePath(path)
    const s = this.files.get(p)
    if (s) return { path: p, name: basename(p), kind: 'file', size: s.bytes.length, mtime: s.mtime }
    if (p === '') return { path: '', name: '', kind: 'dir', size: 0, mtime: 0 }
    const children = await this.list(p) // throws not-found
    const mtime = Math.max(0, ...children.map((c) => c.mtime))
    return { path: p, name: basename(p), kind: 'dir', size: 0, mtime }
  }

  async open(path: string): Promise<Artifact> {
    const p = normalizePath(path)
    const s = this.files.get(p)
    if (!s) {
      if (p === '' || (await this.isDir(p))) throw new ProviderError('is-directory', p)
      throw new ProviderError('not-found', p)
    }
    const bytes = s.bytes
    let objectUrl: string | undefined
    return {
      path: p,
      mime: detectMime(p, bytes),
      size: bytes.length,
      revision: fnv1a64(bytes),
      read: async () => bytes,
      readText: async () => decoder.decode(bytes),
      url: async () => {
        if (typeof URL.createObjectURL === 'function') {
          objectUrl ??= URL.createObjectURL(new Blob([bytes as BlobPart]))
          return objectUrl
        }
        return `data:${detectMime(p, bytes)};base64,${toBase64(bytes)}`
      },
    }
  }

  watch(cb: (ev: FileEvent) => void): Unsubscribe {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  async openExternal(path: string): Promise<void> {
    throw new ProviderError('unsupported', normalizePath(path))
  }

  // --- internals ---

  private put(path: string, content: string | Uint8Array): Stored {
    const bytes = typeof content === 'string' ? encoder.encode(content) : content
    const s = { bytes, mtime: this.now() }
    this.files.set(normalizePath(path), s)
    return s
  }

  private async isDir(p: string): Promise<boolean> {
    const prefix = `${p}/`
    for (const k of this.files.keys()) if (k.startsWith(prefix)) return true
    return false
  }

  private emit(ev: FileEvent): void {
    for (const l of this.listeners) l(ev)
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
