import type { Artifact } from './provider'

/** The subset of an artifact a renderer may inspect to decide whether it applies. */
export type ArtifactHead = Pick<Artifact, 'path' | 'mime' | 'size'>

/**
 * Renderer contract. `TView` is the UI framework's component type; core stays
 * framework-agnostic and the UI package fixes it (Solid `Component<{ artifact }>`).
 * `load` is async so heavy dependencies (Monaco, PDF.js) stay out of the initial bundle.
 */
export interface Renderer<TView = unknown> {
  id: string
  displayName: string
  /** 0 = does not apply; higher = better match. Ties resolve by registration order. */
  match(head: ArtifactHead): number
  /** Bytes. Overrides the registry default; the registry enforces it, the renderer never sees larger. */
  maxSize?: number
  load(): Promise<TView>
}

export type Resolution<TView = unknown> =
  | {
      kind: 'render'
      renderer: Renderer<TView>
      score: number
      /** Other applicable renderers, best first — for a "view as" switcher. */
      alternatives: Renderer<TView>[]
    }
  | {
      /**
       * Something matched, but the artifact exceeds every matching renderer's limit.
       * `renderer`/`maxSize` are the most permissive of them.
       */
      kind: 'too-large'
      renderer: Renderer<TView>
      maxSize: number
    }
  | { kind: 'unsupported' }

export interface ResolveOptions {
  /** Renderer ids to skip — e.g. ones that threw for this artifact. */
  exclude?: Iterable<string>
  /** Renderer id the user explicitly chose; used if it applies and fits. */
  prefer?: string
}

export interface RegistryOptions {
  /** Applied to renderers that do not set their own `maxSize`. Default 50 MiB. */
  defaultMaxSize?: number
}

export const DEFAULT_MAX_SIZE = 50 * 1024 * 1024

/**
 * Owns renderer selection and the fallback policy (docs/architecture.md → Registry).
 * Renderers never decide fallbacks themselves.
 */
export class RendererRegistry<TView = unknown> {
  private renderers: Renderer<TView>[] = []
  private readonly defaultMaxSize: number

  constructor(opts: RegistryOptions = {}) {
    this.defaultMaxSize = opts.defaultMaxSize ?? DEFAULT_MAX_SIZE
  }

  register(renderer: Renderer<TView>): this {
    if (this.renderers.some((r) => r.id === renderer.id)) {
      throw new Error(`renderer already registered: ${renderer.id}`)
    }
    this.renderers.push(renderer)
    return this
  }

  unregister(id: string): boolean {
    const n = this.renderers.length
    this.renderers = this.renderers.filter((r) => r.id !== id)
    return this.renderers.length !== n
  }

  get(id: string): Renderer<TView> | undefined {
    return this.renderers.find((r) => r.id === id)
  }

  all(): readonly Renderer<TView>[] {
    return this.renderers
  }

  limitFor(renderer: Renderer<TView>): number {
    return renderer.maxSize ?? this.defaultMaxSize
  }

  /** Every applicable renderer with its score, best first. Ignores size. */
  candidates(head: ArtifactHead): { renderer: Renderer<TView>; score: number }[] {
    const out: { renderer: Renderer<TView>; score: number }[] = []
    for (const renderer of this.renderers) {
      const score = renderer.match(head)
      if (score > 0) out.push({ renderer, score })
    }
    // stable sort: ties keep registration order
    return out.sort((a, b) => b.score - a.score)
  }

  resolve(head: ArtifactHead, opts: ResolveOptions = {}): Resolution<TView> {
    const excluded = new Set(opts.exclude ?? [])
    const applicable = this.candidates(head).filter((c) => !excluded.has(c.renderer.id))
    if (applicable.length === 0) return { kind: 'unsupported' }

    const fits = applicable.filter((c) => head.size <= this.limitFor(c.renderer))
    if (fits.length === 0) {
      // Report the most permissive limit: that is the number the user needs to know.
      let best = applicable[0] as (typeof applicable)[number]
      for (const c of applicable)
        if (this.limitFor(c.renderer) > this.limitFor(best.renderer)) best = c
      return { kind: 'too-large', renderer: best.renderer, maxSize: this.limitFor(best.renderer) }
    }

    const preferredIdx = opts.prefer ? fits.findIndex((c) => c.renderer.id === opts.prefer) : -1
    const chosen = fits[preferredIdx === -1 ? 0 : preferredIdx] as (typeof fits)[number]
    return {
      kind: 'render',
      renderer: chosen.renderer,
      score: chosen.score,
      alternatives: fits.filter((c) => c !== chosen).map((c) => c.renderer),
    }
  }
}

/** Convenience for the common "match a set of MIME types at one score" case. */
export function matchMime(mimes: readonly string[], score = 10): Renderer['match'] {
  const set = new Set(mimes)
  return (head) => (set.has(head.mime) ? score : 0)
}

/** Match any MIME with the given prefix, e.g. `text/`. */
export function matchMimePrefix(prefix: string, score = 1): Renderer['match'] {
  return (head) => (head.mime.startsWith(prefix) ? score : 0)
}
