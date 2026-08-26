import type { Artifact, Renderer } from '@prism/core'
import type { Component } from 'solid-js'

/** The Solid component type every renderer in this UI resolves to. */
export type RendererView = Component<{ artifact: Artifact }>

/** A core `Renderer` whose `load()` yields a Solid component. */
export type SolidRenderer = Renderer<RendererView>
