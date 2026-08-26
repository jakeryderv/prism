import type { ArtifactHead } from '@prism/core'
import { matchMime } from '@prism/core'

/** Raster and vector types the webview's <img> element decodes natively. */
export const IMAGE_MIMES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-icon',
  'image/avif',
  'image/svg+xml',
]

export const IMAGE_SCORE = 10

export const match: (head: ArtifactHead) => number = matchMime(IMAGE_MIMES, IMAGE_SCORE)
