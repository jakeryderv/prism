import { extname } from './provider'

/**
 * File-type detection: extension first, then magic bytes for a handful of
 * binary formats, then a text/binary heuristic. Returns a MIME type; renderers
 * match on MIME (and may refine on extension for e.g. code languages).
 */

const BY_EXTENSION: Record<string, string> = {
  // text / code
  txt: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  jsonl: 'application/x-ndjson',
  ndjson: 'application/x-ndjson',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  toml: 'application/toml',
  xml: 'application/xml',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  jsx: 'text/jsx',
  ts: 'text/typescript',
  mts: 'text/typescript',
  cts: 'text/typescript',
  tsx: 'text/tsx',
  py: 'text/x-python',
  rs: 'text/x-rust',
  go: 'text/x-go',
  java: 'text/x-java',
  c: 'text/x-c',
  h: 'text/x-c',
  cpp: 'text/x-c++',
  hpp: 'text/x-c++',
  cs: 'text/x-csharp',
  rb: 'text/x-ruby',
  php: 'text/x-php',
  sh: 'text/x-shellscript',
  bash: 'text/x-shellscript',
  zsh: 'text/x-shellscript',
  sql: 'application/sql',
  ipynb: 'application/x-ipynb+json',
  svg: 'image/svg+xml',
  // binary
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  sqlite: 'application/vnd.sqlite3',
  db: 'application/vnd.sqlite3',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  stl: 'model/stl',
  obj: 'model/obj',
  gltf: 'model/gltf+json',
  glb: 'model/gltf-binary',
  step: 'model/step',
  stp: 'model/step',
  usd: 'model/vnd.usd',
  usdz: 'model/vnd.usdz+zip',
  wasm: 'application/wasm',
}

/** Well-known extensionless filenames. */
const BY_NAME: Record<string, string> = {
  dockerfile: 'text/x-dockerfile',
  makefile: 'text/x-makefile',
  license: 'text/plain',
  readme: 'text/plain',
  '.gitignore': 'text/plain',
  '.env': 'text/plain',
}

interface Magic {
  bytes: number[]
  offset?: number
  mime: string
}

const MAGIC: Magic[] = [
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png' },
  { bytes: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif' },
  { bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], mime: 'application/pdf' },
  { bytes: [0x50, 0x4b, 0x03, 0x04], mime: 'application/zip' },
  { bytes: [0x1f, 0x8b], mime: 'application/gzip' },
  { bytes: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66], mime: 'application/vnd.sqlite3' },
  { bytes: [0x00, 0x61, 0x73, 0x6d], mime: 'application/wasm' },
  { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8, mime: 'image/webp' },
]

export const BINARY_MIME = 'application/octet-stream'

export function mimeFromPath(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  const byName = BY_NAME[name]
  if (byName) return byName
  const ext = extname(path)
  return ext ? BY_EXTENSION[ext] : undefined
}

export function mimeFromBytes(bytes: Uint8Array): string | undefined {
  for (const m of MAGIC) {
    const off = m.offset ?? 0
    if (bytes.length < off + m.bytes.length) continue
    let ok = true
    for (let i = 0; i < m.bytes.length; i++) {
      if (bytes[off + i] !== m.bytes[i]) {
        ok = false
        break
      }
    }
    if (ok) return m.mime
  }
  return undefined
}

/**
 * Heuristic: looks at up to the first 8 KiB. NUL bytes, or a high proportion of
 * control characters, mean binary.
 */
export function looksLikeText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8192)
  if (n === 0) return true
  let suspicious = 0
  for (let i = 0; i < n; i++) {
    const b = bytes[i] as number
    if (b === 0) return false
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c) suspicious++
  }
  return suspicious / n < 0.05
}

/**
 * Detect the MIME type of a file. A known extension wins, except that magic bytes
 * for a *different* well-known binary format override it (an `.md` that is really a
 * PNG is a PNG). Unknown extensions fall back to sniffing, then text/plain or binary.
 */
export function detectMime(path: string, bytes?: Uint8Array): string {
  const fromPath = mimeFromPath(path)
  const fromBytes = bytes ? mimeFromBytes(bytes) : undefined
  if (fromBytes && fromBytes !== 'application/zip') return fromBytes
  if (fromPath) return fromPath
  if (fromBytes) return fromBytes
  if (!bytes) return BINARY_MIME
  return looksLikeText(bytes) ? 'text/plain' : BINARY_MIME
}

export function isTextMime(mime: string): boolean {
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/x-ndjson' ||
    mime === 'application/yaml' ||
    mime === 'application/toml' ||
    mime === 'application/xml' ||
    mime === 'application/sql' ||
    mime === 'application/x-ipynb+json' ||
    mime === 'image/svg+xml' ||
    mime === 'model/gltf+json' ||
    mime === 'model/obj'
  )
}
