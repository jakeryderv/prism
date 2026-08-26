import { describe, expect, test } from 'bun:test'
import { IMAGE_MIMES, IMAGE_SCORE, match } from '../src/mime'

const head = (mime: string) => ({ path: 'x', mime, size: 1 })

describe('match', () => {
  test('scores every listed image type at IMAGE_SCORE', () => {
    for (const mime of IMAGE_MIMES) expect(match(head(mime))).toBe(IMAGE_SCORE)
    expect(IMAGE_MIMES).toContain('image/svg+xml')
    expect(IMAGE_SCORE).toBe(10)
  })

  test('rejects non-image and unlisted image types', () => {
    for (const mime of ['text/plain', 'application/pdf', 'image/tiff', 'image/heic', '']) {
      expect(match(head(mime))).toBe(0)
    }
  })
})
