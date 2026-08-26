/**
 * The provider interface: the boundary between renderers/UI and wherever files live.
 * See docs/architecture.md and ADR-0004. Paths are workspace-relative, POSIX-style,
 * with no leading slash; the workspace root is ''.
 */

export interface Entry {
  path: string
  name: string
  kind: 'file' | 'dir'
  size: number
  /** Unix epoch milliseconds. */
  mtime: number
}

export interface Artifact {
  path: string
  mime: string
  size: number
  /** Identity of this content. Renderers key reloads on this, not on path. */
  revision: string
  read(): Promise<Uint8Array>
  readText(): Promise<string>
  /** A URL the webview can fetch (img, iframe, PDF.js). Provider-specific scheme. */
  url(): Promise<string>
}

export type FileEventKind = 'created' | 'modified' | 'deleted'

export interface FileEvent {
  kind: FileEventKind
  path: string
  /** Unix epoch milliseconds. */
  timestamp: number
  size?: number
  /** Content hash when the provider can compute it cheaply. */
  hash?: string
}

export type Unsubscribe = () => void

export interface WorkspaceProvider {
  /** Absolute, provider-specific location of the workspace root; display only. */
  readonly root: string
  list(dir: string): Promise<Entry[]>
  stat(path: string): Promise<Entry>
  open(path: string): Promise<Artifact>
  watch(cb: (ev: FileEvent) => void): Unsubscribe
  openExternal(path: string): Promise<void>
}

export class ProviderError extends Error {
  constructor(
    readonly code: 'not-found' | 'is-directory' | 'not-directory' | 'unsupported',
    readonly path: string,
  ) {
    super(`${code}: ${path}`)
    this.name = 'ProviderError'
  }
}

/** Normalize a user/agent-supplied path to the canonical workspace-relative form. */
export function normalizePath(p: string): string {
  const parts: string[] = []
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

export function basename(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? p : p.slice(i + 1)
}

export function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

export function extname(p: string): string {
  const name = basename(p)
  const i = name.lastIndexOf('.')
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase()
}
