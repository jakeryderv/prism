import { expect, test } from 'bun:test'
import { formatBytes } from '../src/format'

test('formatBytes', () => {
  expect(formatBytes(0)).toBe('0 B')
  expect(formatBytes(1023)).toBe('1023 B')
  expect(formatBytes(1024)).toBe('1.0 KiB')
  expect(formatBytes(1536)).toBe('1.5 KiB')
  expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MiB')
  expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GiB')
  expect(formatBytes(2048 * 1024 ** 3)).toBe('2048.0 GiB')
  expect(formatBytes(-1)).toBe('—')
  expect(formatBytes(Number.NaN)).toBe('—')
})
