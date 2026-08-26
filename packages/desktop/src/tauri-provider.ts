/**
 * WorkspaceProvider backed by the Rust side of the Tauri app over IPC.
 * The only place in the workspace that talks to `@tauri-apps/*` for file access.
 *
 * Paths crossing IPC are workspace-relative POSIX ('' = root), exactly as `normalizePath`
 * produces them; Rust re-checks that every resolved path stays inside the workspace root.
 */
import {
  type Artifact,
  detectMime,
  type Entry,
  type FileEvent,
  normalizePath,
  ProviderError,
  type ProviderErrorCode,
  type Unsubscribe,
  type WorkspaceProvider,
} from '@prism/core'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

interface WorkspaceInfo {
  root: string
}

/** Wire shape of `AppError` on the Rust side (src-tauri/src/error.rs). */
interface WireError {
  code: ProviderErrorCode
  message: string
}

const CODES: ReadonlySet<string> = new Set<ProviderErrorCode>([
  'not-found',
  'is-directory',
  'not-directory',
  'unsupported',
  'forbidden',
  'io',
])

function isWireError(e: unknown): e is WireError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as WireError).message === 'string' &&
    CODES.has((e as WireError).code)
  )
}

/** Run a command and turn the Rust `{ code, message }` error into a `ProviderError`. */
async function call<T>(cmd: string, path: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (e) {
    if (isWireError(e)) throw new ProviderError(e.code, path, e.message)
    throw e
  }
}

const decoder = new TextDecoder()

/** Percent-encode each path segment but keep '/' so relative URL resolution sees real segments. */
export function encodePathForUrl(absolute: string): string {
  return absolute.split('/').map(encodeURIComponent).join('/')
}

export class TauriProvider implements WorkspaceProvider {
  private constructor(readonly root: string) {}

  /** Path given on the command line (or `PRISM_WORKSPACE`), if any. */
  static async initialPath(): Promise<string | null> {
    return invoke<string | null>('workspace_initial')
  }

  static async open(path: string): Promise<TauriProvider> {
    const info = await call<WorkspaceInfo>('workspace_open', path, { path })
    return new TauriProvider(info.root)
  }

  list(dir: string): Promise<Entry[]> {
    const d = normalizePath(dir)
    return call<Entry[]>('fs_list', d, { dir: d })
  }

  stat(path: string): Promise<Entry> {
    const p = normalizePath(path)
    return call<Entry>('fs_stat', p, { path: p })
  }

  async open(path: string): Promise<Artifact> {
    const p = normalizePath(path)
    const entry = await this.stat(p)
    if (entry.kind === 'dir') throw new ProviderError('is-directory', p)
    const absolute = `${this.root}/${p}`
    let bytes: Promise<Uint8Array> | undefined
    const read = () => {
      // One IPC round trip per artifact; the UI re-opens on `modified`, which yields a fresh
      // Artifact (and revision), so caching here never serves stale bytes.
      bytes ??= call<ArrayBuffer>('fs_read', p, { path: p }).then((buf) => new Uint8Array(buf))
      return bytes
    }
    return {
      path: p,
      mime: detectMime(p),
      size: entry.size,
      // Not a content hash: `Artifact.revision` is a plain field and hashing would cost a
      // read up front. size+mtime changes on every write, which is what re-render keys need.
      revision: `${entry.size}-${entry.mtime}`,
      read,
      readText: async () => decoder.decode(await read()),
      url: async () => `prism://localhost${encodePathForUrl(absolute)}`,
    }
  }

  watch(cb: (ev: FileEvent) => void): Unsubscribe {
    let stopped = false
    let unlisten: (() => void) | undefined
    void listen<FileEvent>('fs:event', (ev) => cb(ev.payload)).then((un) => {
      if (stopped) un()
      else unlisten = un
    })
    return () => {
      stopped = true
      unlisten?.()
    }
  }

  openExternal(path: string): Promise<void> {
    const p = normalizePath(path)
    return call<void>('open_external', p, { path: p })
  }
}

/** Write a line to the app's stderr; handy for verifying behaviour where screenshots are not. */
export function logLine(line: string): Promise<void> {
  return invoke('log_line', { line })
}
