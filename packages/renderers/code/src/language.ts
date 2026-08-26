import { type ArtifactHead, basename, extname, isTextMime } from '@prism/core'

/**
 * Maps an artifact to a Monaco language id. Pure and dependency-free so it can be
 * unit-tested with bun:test without loading Monaco. Extension wins over MIME because
 * core collapses several languages into one MIME (e.g. `.scss` is `text/css`-ish) and
 * because the MIME table upstream is coarser than Monaco's grammars.
 */

export const PLAINTEXT = 'plaintext'

/** Extension → Monaco language id. Only ids Monaco ships a grammar for. */
const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  jsonl: 'json',
  ndjson: 'json',
  ipynb: 'json',
  gltf: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  // Monaco has no TOML grammar; INI is the closest approximation.
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  properties: 'ini',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'mdx',
  py: 'python',
  pyi: 'python',
  rs: 'rust',
  go: 'go',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  xsl: 'xml',
  plist: 'xml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  sql: 'sql',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  scala: 'scala',
  pl: 'perl',
  ps1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'proto',
  tf: 'hcl',
  hcl: 'hcl',
  dockerfile: 'dockerfile',
  clj: 'clojure',
  ex: 'elixir',
  exs: 'elixir',
  jl: 'julia',
  rst: 'restructuredtext',
  sol: 'sol',
  wgsl: 'wgsl',
}

/** Extensionless well-known filenames (lower-cased). */
const BY_NAME: Record<string, string> = {
  dockerfile: 'dockerfile',
}

/** MIME → Monaco language id, for the MIME types core's detector emits. */
const BY_MIME: Record<string, string> = {
  'text/typescript': 'typescript',
  'text/tsx': 'typescript',
  'text/javascript': 'javascript',
  'text/jsx': 'javascript',
  'application/json': 'json',
  'application/x-ndjson': 'json',
  'application/x-ipynb+json': 'json',
  'model/gltf+json': 'json',
  'application/yaml': 'yaml',
  'application/toml': 'ini',
  'text/markdown': 'markdown',
  'text/x-python': 'python',
  'text/x-rust': 'rust',
  'text/x-go': 'go',
  'text/css': 'css',
  'text/html': 'html',
  'application/xml': 'xml',
  'image/svg+xml': 'xml',
  'text/x-shellscript': 'shell',
  'application/sql': 'sql',
  'text/x-java': 'java',
  'text/x-c': 'c',
  'text/x-c++': 'cpp',
  'text/x-csharp': 'csharp',
  'text/x-ruby': 'ruby',
  'text/x-php': 'php',
  'text/x-dockerfile': 'dockerfile',
}

export function languageForPath(path: string): string | undefined {
  const name = basename(path).toLowerCase()
  const byName = BY_NAME[name]
  if (byName) return byName
  const ext = extname(path)
  return ext ? BY_EXTENSION[ext] : undefined
}

export function languageForMime(mime: string): string | undefined {
  return BY_MIME[mime]
}

/** Monaco language id for an artifact; `plaintext` when nothing better is known. */
export function detectLanguage(head: Pick<ArtifactHead, 'path' | 'mime'>): string {
  return languageForPath(head.path) ?? languageForMime(head.mime) ?? PLAINTEXT
}

/**
 * Match score: 0 for non-text, 1 for any text (universal fallback), 5 when a real
 * grammar applies. Higher-scoring dedicated renderers (Markdown, JSON tree) win; this
 * one stays available as the "view as code" alternative.
 */
export function matchCode(head: ArtifactHead): number {
  if (!isTextMime(head.mime)) return 0
  return detectLanguage(head) === PLAINTEXT ? 1 : 5
}
