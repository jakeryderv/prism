import { match } from './mime'
import type { SolidRenderer } from './types'

export { formatBytes } from './format'
export { IMAGE_MIMES, IMAGE_SCORE, match } from './mime'
export type { RendererView, SolidRenderer } from './types'
export * from './zoom'

export const imageRenderer: SolidRenderer = {
  id: 'image',
  displayName: 'Image',
  match,
  // Equal to the registry default; explicit so the limit is visible here.
  maxSize: 50 * 1024 * 1024,
  load: async () => (await import('./ImageView')).ImageView,
}

export default imageRenderer
