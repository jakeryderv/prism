import type { Component } from 'solid-js'
import { ActivityPanel } from './ActivityPanel'
import { FileTree } from './FileTree'
import { Tabs } from './Tabs'
import { Viewer } from './Viewer'

/** Default layout: tree | tabs + viewer | activity. Must be inside `<PrismProvider>`. */
export const Workspace: Component = () => (
  <div class="prism-workspace">
    <FileTree />
    <main class="prism-main">
      <Tabs />
      <Viewer />
    </main>
    <ActivityPanel />
  </div>
)
