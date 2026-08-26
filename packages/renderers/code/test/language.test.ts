import { describe, expect, test } from 'bun:test'
import { detectMime } from '@prism/core'
import {
  detectLanguage,
  languageForMime,
  languageForPath,
  matchCode,
  PLAINTEXT,
} from '../src/language'

const head = (path: string, size = 10) => ({ path, mime: detectMime(path), size })

describe('languageForPath', () => {
  test.each([
    ['src/index.ts', 'typescript'],
    ['src/App.tsx', 'typescript'],
    ['lib/util.mjs', 'javascript'],
    ['Component.jsx', 'javascript'],
    ['package.json', 'json'],
    ['tsconfig.jsonc', 'json'],
    ['events.jsonl', 'json'],
    ['notebook.ipynb', 'json'],
    ['config.yaml', 'yaml'],
    ['config.yml', 'yaml'],
    ['Cargo.toml', 'ini'],
    ['README.md', 'markdown'],
    ['main.py', 'python'],
    ['main.rs', 'rust'],
    ['main.go', 'go'],
    ['style.css', 'css'],
    ['style.scss', 'scss'],
    ['index.html', 'html'],
    ['build.sh', 'shell'],
    ['schema.sql', 'sql'],
    ['logo.svg', 'xml'],
    ['Main.java', 'java'],
    ['a.cpp', 'cpp'],
    ['a.h', 'c'],
    ['Dockerfile', 'dockerfile'],
    ['docker/Dockerfile', 'dockerfile'],
    ['main.tf', 'hcl'],
  ])('%s → %s', (path, lang) => {
    expect(languageForPath(path)).toBe(lang)
  })

  test('is case-insensitive on the extension', () => {
    expect(languageForPath('README.MD')).toBe('markdown')
  })

  test('unknown extension or no extension → undefined', () => {
    expect(languageForPath('notes.txt')).toBeUndefined()
    expect(languageForPath('Makefile')).toBeUndefined()
    expect(languageForPath('.gitignore')).toBeUndefined()
    expect(languageForPath('weird.xyz123')).toBeUndefined()
  })
})

describe('languageForMime', () => {
  test('covers core text MIME types', () => {
    expect(languageForMime('text/typescript')).toBe('typescript')
    expect(languageForMime('application/json')).toBe('json')
    expect(languageForMime('application/yaml')).toBe('yaml')
    expect(languageForMime('application/toml')).toBe('ini')
    expect(languageForMime('text/x-shellscript')).toBe('shell')
    expect(languageForMime('text/plain')).toBeUndefined()
    expect(languageForMime('image/png')).toBeUndefined()
  })
})

describe('detectLanguage', () => {
  test('extension wins, then MIME, then plaintext', () => {
    expect(detectLanguage({ path: 'a.ts', mime: 'text/plain' })).toBe('typescript')
    expect(detectLanguage({ path: 'noext', mime: 'application/json' })).toBe('json')
    expect(detectLanguage({ path: 'notes.txt', mime: 'text/plain' })).toBe(PLAINTEXT)
    expect(detectLanguage({ path: 'unknown', mime: 'text/plain' })).toBe(PLAINTEXT)
  })

  test('agrees with core detection for typical files', () => {
    expect(detectLanguage(head('src/index.ts'))).toBe('typescript')
    expect(detectLanguage(head('data/config.yaml'))).toBe('yaml')
    expect(detectLanguage(head('data/report.csv'))).toBe(PLAINTEXT)
  })
})

describe('matchCode', () => {
  test('0 for non-text', () => {
    expect(matchCode(head('assets/pixel.png'))).toBe(0)
    expect(matchCode({ path: 'blob', mime: 'application/octet-stream', size: 1 })).toBe(0)
    expect(matchCode(head('doc.pdf'))).toBe(0)
  })

  test('1 for text without a grammar (universal fallback)', () => {
    expect(matchCode(head('notes.txt'))).toBe(1)
    expect(matchCode(head('logs/agent.log'))).toBe(1)
    expect(matchCode(head('data/report.csv'))).toBe(1)
    expect(matchCode({ path: 'sniffed', mime: 'text/plain', size: 1 })).toBe(1)
  })

  test('5 when a Monaco grammar applies', () => {
    expect(matchCode(head('src/index.ts'))).toBe(5)
    expect(matchCode(head('package.json'))).toBe(5)
    expect(matchCode(head('README.md'))).toBe(5)
    expect(matchCode(head('assets/logo.svg'))).toBe(5)
    expect(matchCode(head('Dockerfile'))).toBe(5)
  })

  test('ignores size (the registry enforces maxSize)', () => {
    expect(matchCode(head('src/index.ts', 1024 ** 3))).toBe(5)
  })
})
