import { describe, expect, test } from 'bun:test'
import {
  clampZoom,
  effectiveScale,
  fitScale,
  formatPercent,
  MAX_ZOOM,
  MIN_ZOOM,
  nextZoom,
  prevZoom,
  ZOOM_STEPS,
} from '../src/zoom'

describe('zoom steps', () => {
  test('steps are ascending and include 100%', () => {
    for (let i = 1; i < ZOOM_STEPS.length; i++)
      expect(ZOOM_STEPS[i]).toBeGreaterThan(ZOOM_STEPS[i - 1] as number)
    expect(ZOOM_STEPS).toContain(1)
  })

  test('nextZoom moves to the next step and saturates', () => {
    expect(nextZoom(1)).toBe(1.5)
    expect(nextZoom(1.2)).toBe(1.5)
    expect(nextZoom(0.33)).toBe(0.5)
    expect(nextZoom(MAX_ZOOM)).toBe(MAX_ZOOM)
    expect(nextZoom(100)).toBe(MAX_ZOOM)
  })

  test('prevZoom moves to the previous step and saturates', () => {
    expect(prevZoom(1)).toBe(0.75)
    expect(prevZoom(1.2)).toBe(1)
    expect(prevZoom(0.33)).toBe(0.25)
    expect(prevZoom(MIN_ZOOM)).toBe(MIN_ZOOM)
    expect(prevZoom(0)).toBe(MIN_ZOOM)
  })

  test('clampZoom bounds and rejects garbage', () => {
    expect(clampZoom(0.5)).toBe(0.5)
    expect(clampZoom(0.001)).toBe(MIN_ZOOM)
    expect(clampZoom(1e9)).toBe(MAX_ZOOM)
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM)
    expect(clampZoom(-3)).toBe(MIN_ZOOM)
  })
})

describe('fit', () => {
  const natural = { width: 2000, height: 1000 }
  test('scales down to the limiting dimension', () => {
    expect(fitScale(natural, { width: 1000, height: 1000 })).toBe(0.5)
    expect(fitScale(natural, { width: 1000, height: 250 })).toBe(0.25)
  })
  test('never upscales', () => {
    expect(fitScale({ width: 1, height: 1 }, { width: 800, height: 600 })).toBe(1)
  })
  test('degenerate sizes fall back to 1', () => {
    expect(fitScale({ width: 0, height: 0 }, { width: 800, height: 600 })).toBe(1)
    expect(fitScale(natural, { width: 0, height: 0 })).toBe(1)
  })
  test('effectiveScale resolves fit vs explicit', () => {
    expect(effectiveScale('fit', natural, { width: 1000, height: 1000 })).toBe(0.5)
    expect(effectiveScale(2, natural, { width: 1000, height: 1000 })).toBe(2)
  })
})

test('formatPercent', () => {
  expect(formatPercent(1)).toBe('100%')
  expect(formatPercent(0.333)).toBe('33%')
  expect(formatPercent(2.5)).toBe('250%')
})
