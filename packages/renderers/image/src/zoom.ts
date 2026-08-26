/**
 * Zoom model for the image view. Pure, so it is unit-tested without a DOM.
 * `'fit'` scales the image down (never up) to the viewport; a number is an explicit scale
 * where 1 = natural size.
 */
export type Zoom = 'fit' | number

export type Size = { width: number; height: number }

export const ZOOM_STEPS: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]
export const MIN_ZOOM = ZOOM_STEPS[0] as number
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1] as number

const EPS = 1e-9

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return MIN_ZOOM
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
}

/** Smallest step strictly above `scale`, or MAX_ZOOM when already at the top. */
export function nextZoom(scale: number): number {
  const s = clampZoom(scale)
  return ZOOM_STEPS.find((step) => step > s + EPS) ?? MAX_ZOOM
}

/** Largest step strictly below `scale`, or MIN_ZOOM when already at the bottom. */
export function prevZoom(scale: number): number {
  const s = clampZoom(scale)
  let out = MIN_ZOOM
  for (const step of ZOOM_STEPS) if (step < s - EPS) out = step
  return out
}

/** Scale that fits `natural` inside `viewport` without upscaling. */
export function fitScale(natural: Size, viewport: Size): number {
  if (natural.width <= 0 || natural.height <= 0) return 1
  if (viewport.width <= 0 || viewport.height <= 0) return 1
  return Math.min(1, viewport.width / natural.width, viewport.height / natural.height)
}

/** Resolve the effective scale for a zoom state given the current geometry. */
export function effectiveScale(zoom: Zoom, natural: Size, viewport: Size): number {
  return zoom === 'fit' ? fitScale(natural, viewport) : zoom
}

export function formatPercent(scale: number): string {
  return `${Math.round(scale * 100)}%`
}
