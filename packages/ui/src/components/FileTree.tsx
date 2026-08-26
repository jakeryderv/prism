import { type Component, createEffect, For, Show } from 'solid-js'
import { useWorkspace } from '../context'
import { childrenOf, type TreeNode } from '../store/tree'

const Node: Component<{ node: TreeNode; depth: number }> = (props) => {
  const ws = useWorkspace()
  const isDir = () => props.node.kind === 'dir'
  const expanded = () => ws.tree().expanded.has(props.node.path)
  const active = () => ws.tabs().active === props.node.path
  const onClick = () => {
    if (isDir()) void ws.treeModel.toggle(props.node.path)
    else if (!props.node.deleted) ws.openPath(props.node.path)
  }
  return (
    <>
      <button
        type="button"
        class="prism-tree-row"
        classList={{ 'is-active': active(), 'is-deleted': !!props.node.deleted }}
        style={{ 'padding-left': `${8 + props.depth * 14}px` }}
        onClick={onClick}
        title={props.node.path}
      >
        <span class="prism-tree-icon">{isDir() ? (expanded() ? '▾' : '▸') : '·'}</span>
        <span class="prism-tree-name">{props.node.name}</span>
      </button>
      <Show when={isDir() && expanded()}>
        <Dir dir={props.node.path} depth={props.depth + 1} />
      </Show>
    </>
  )
}

const Dir: Component<{ dir: string; depth: number }> = (props) => {
  const ws = useWorkspace()
  const nodes = () => childrenOf(ws.tree(), props.dir)
  return <For each={nodes()}>{(node) => <Node node={node} depth={props.depth} />}</For>
}

export const FileTree: Component = () => {
  const ws = useWorkspace()
  createEffect(() => {
    void ws.treeModel.expand('')
  })
  return (
    <nav class="prism-tree" aria-label="Files">
      <div class="prism-panel-title" title={ws.provider.root}>
        Files
      </div>
      <Dir dir="" depth={0} />
    </nav>
  )
}
