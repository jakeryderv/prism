import type { Artifact, Renderer } from '@prism/core'
import type { Component } from 'solid-js'
import { matchCode } from './language'

// Same shape as @prism/ui's types; declared locally because renderers may not import ui.
export type RendererView = Component<{ artifact: Artifact }>
export type SolidRenderer = Renderer<RendererView>

export { detectLanguage, languageForMime, languageForPath, matchCode } from './language'

/** Monaco gets sluggish past this; the registry reports too-large above it. */
export const CODE_MAX_SIZE = 20 * 1024 * 1024

export const codeRenderer: SolidRenderer = {
  id: 'code',
  displayName: 'Code',
  match: matchCode,
  maxSize: CODE_MAX_SIZE,
  // CodeView is the only module that imports monaco-editor, so the whole editor and its
  // worker stay out of the initial bundle until the first code artifact is opened.
  load: async () => (await import('./CodeView')).CodeView,
}

export default codeRenderer
