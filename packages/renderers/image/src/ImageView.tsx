import type { Artifact } from '@prism/core'
import { type Component, createResource, createSignal, Show } from 'solid-js'
import { formatBytes } from './format'
import { effectiveScale, formatPercent, nextZoom, prevZoom, type Size, type Zoom } from './zoom'

const CHECKER =
  'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)'

/**
 * Shows an image artifact via <img src={artifact.url()}>. SVG goes through <img> too, which
 * is a sandbox: scripts and external references do not run (see docs/renderers/image.md).
 * Failures (url() rejecting, decode errors) are thrown so the host's ErrorBoundary falls back.
 * The URL is never revoked here; its lifetime belongs to the provider.
 */
export const ImageView: Component<{ artifact: Artifact }> = (props) => {
  // Reading `url()` inside JSX rethrows a rejection into the host's ErrorBoundary.
  const [url] = createResource(
    () => props.artifact,
    (a) => a.url(),
  )
  const [natural, setNatural] = createSignal<Size>()
  const [zoom, setZoom] = createSignal<Zoom>('fit')
  const [loadError, setLoadError] = createSignal<Error>()
  let viewport: HTMLDivElement | undefined

  const viewportSize = (): Size =>
    viewport
      ? { width: viewport.clientWidth, height: viewport.clientHeight }
      : { width: 0, height: 0 }

  // Read at interaction time (not tracked): fit depends on the live viewport size.
  const currentScale = () => {
    const n = natural()
    return n ? effectiveScale(zoom(), n, viewportSize()) : 1
  }

  const imgStyle = () => {
    const n = natural()
    const z = zoom()
    if (z === 'fit' || !n) {
      return { 'max-width': '100%', 'max-height': '100%', 'object-fit': 'contain' as const }
    }
    return { width: `${n.width * z}px`, height: `${n.height * z}px`, 'max-width': 'none' }
  }

  const onLoad = (e: Event) => {
    const img = e.currentTarget as HTMLImageElement
    setNatural({ width: img.naturalWidth, height: img.naturalHeight })
  }
  const onError = () => setLoadError(new Error(`image failed to decode: ${props.artifact.path}`))

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', 'min-height': '0' }}>
      <Show when={loadError()}>
        {(err) => {
          throw err()
        }}
      </Show>
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          'align-items': 'center',
          padding: '0.25rem 0.5rem',
          'font-size': '0.85rem',
          'border-bottom': '1px solid rgba(128,128,128,0.3)',
        }}
      >
        <button type="button" onClick={() => setZoom('fit')} disabled={zoom() === 'fit'}>
          Fit
        </button>
        <button type="button" onClick={() => setZoom(1)} disabled={zoom() === 1}>
          100%
        </button>
        <button type="button" onClick={() => setZoom(prevZoom(currentScale()))} title="Zoom out">
          −
        </button>
        <button type="button" onClick={() => setZoom(nextZoom(currentScale()))} title="Zoom in">
          +
        </button>
        <span style={{ 'margin-left': 'auto', opacity: 0.8 }}>
          <Show when={natural()} fallback="loading…">
            {(n) => (
              <>
                {n().width}×{n().height} · {formatBytes(props.artifact.size)} ·{' '}
                {zoom() === 'fit' ? 'fit' : formatPercent(zoom() as number)}
              </>
            )}
          </Show>
        </span>
      </div>
      <div
        ref={viewport}
        style={{
          flex: '1',
          'min-height': '0',
          overflow: 'auto',
          display: 'grid',
          'place-items': 'center',
          'background-color': '#fff',
          'background-image': CHECKER,
          'background-size': '16px 16px',
          'background-position': '0 0, 0 8px, 8px -8px, -8px 0',
        }}
      >
        <img
          src={url()}
          alt={props.artifact.path}
          onLoad={onLoad}
          onError={onError}
          style={imgStyle()}
        />
      </div>
    </div>
  )
}
