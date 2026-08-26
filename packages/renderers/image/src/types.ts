import type { Artifact, Renderer } from '@prism/core'
import type { Component } from 'solid-js'

// Same aliases @prism/ui exports; declared locally because renderers may not import @prism/ui.
export type RendererView = Component<{ artifact: Artifact }>
export type SolidRenderer = Renderer<RendererView>
