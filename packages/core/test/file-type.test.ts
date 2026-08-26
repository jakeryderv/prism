import { describe, expect, test } from 'bun:test'
import {
  BINARY_MIME,
  detectMime,
  isTextMime,
  looksLikeText,
  mimeFromBytes,
  mimeFromPath,
} from '../src'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const PDF = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ')
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])
const text = (s: string) => new TextEncoder().encode(s)

describe('mimeFromPath', () => {
  test('known extensions, case-insensitive', () => {
    expect(mimeFromPath('a/b/README.MD')).toBe('text/markdown')
    expect(mimeFromPath('x.Tsx')).toBe('text/tsx')
    expect(mimeFromPath('img.JPG')).toBe('image/jpeg')
  })
  test('well-known bare names', () => {
    expect(mimeFromPath('Dockerfile')).toBe('text/x-dockerfile')
    expect(mimeFromPath('src/.gitignore')).toBe('text/plain')
  })
  test('unknown or missing extension', () => {
    expect(mimeFromPath('weird.xyz')).toBeUndefined()
    expect(mimeFromPath('noext')).toBeUndefined()
    expect(mimeFromPath('.hidden')).toBeUndefined()
  })
})

describe('mimeFromBytes', () => {
  test('magic numbers', () => {
    expect(mimeFromBytes(PNG)).toBe('image/png')
    expect(mimeFromBytes(PDF)).toBe('application/pdf')
    expect(mimeFromBytes(WEBP)).toBe('image/webp')
    expect(mimeFromBytes(ZIP)).toBe('application/zip')
  })
  test('too short or no match', () => {
    expect(mimeFromBytes(new Uint8Array([0x89, 0x50]))).toBeUndefined()
    expect(mimeFromBytes(text('hello'))).toBeUndefined()
  })
})

describe('looksLikeText', () => {
  test('plain and unicode text', () => {
    expect(looksLikeText(text('hello\nworld\t✓'))).toBe(true)
    expect(looksLikeText(new Uint8Array())).toBe(true)
  })
  test('NUL or control-heavy bytes are binary', () => {
    expect(looksLikeText(new Uint8Array([0x68, 0x00, 0x69]))).toBe(false)
    expect(looksLikeText(new Uint8Array(100).fill(0x01))).toBe(false)
  })
})

describe('detectMime', () => {
  test('extension wins for text', () => {
    expect(detectMime('a.md', text('# hi'))).toBe('text/markdown')
    expect(detectMime('a.md')).toBe('text/markdown')
  })
  test('magic overrides a lying extension', () => {
    expect(detectMime('actually-a.png.md', PNG)).toBe('image/png')
    expect(detectMime('report.txt', PDF)).toBe('application/pdf')
  })
  test('zip magic does not override zip-based office formats', () => {
    expect(detectMime('sheet.xlsx', ZIP)).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    expect(detectMime('archive.bin', ZIP)).toBe('application/zip')
  })
  test('unknown extension falls back to sniffing', () => {
    expect(detectMime('notes.xyz', text('just text'))).toBe('text/plain')
    expect(detectMime('blob.xyz', new Uint8Array([0, 1, 2, 3]))).toBe(BINARY_MIME)
    expect(detectMime('blob.xyz')).toBe(BINARY_MIME)
  })
})

describe('isTextMime', () => {
  test('classifies', () => {
    expect(isTextMime('text/x-rust')).toBe(true)
    expect(isTextMime('application/json')).toBe(true)
    expect(isTextMime('image/svg+xml')).toBe(true)
    expect(isTextMime('image/png')).toBe(false)
    expect(isTextMime('application/pdf')).toBe(false)
  })
})
