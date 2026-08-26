import type { RendererRegistry, WorkspaceProvider } from '@prism/core'
import { createContext, type ParentComponent, useContext } from 'solid-js'
import type { RendererView } from './types'
import { createWorkspace, type Workspace } from './workspace'

interface PrismContextValue {
  provider: WorkspaceProvider
  registry: RendererRegistry<RendererView>
  workspace: Workspace
}

const PrismContext = createContext<PrismContextValue>()

function usePrism(): PrismContextValue {
  const ctx = useContext(PrismContext)
  if (!ctx) throw new Error('missing <PrismProvider> above this component')
  return ctx
}

export const useProvider = (): WorkspaceProvider => usePrism().provider
export const useRegistry = (): RendererRegistry<RendererView> => usePrism().registry
export const useWorkspace = (): Workspace => usePrism().workspace

/** Supplies the provider, registry, and a workspace built on them to everything below. */
export const PrismProvider: ParentComponent<{
  provider: WorkspaceProvider
  registry: RendererRegistry<RendererView>
}> = (props) => {
  // Props are read once by design: swapping provider/registry means a new app root.
  const value: PrismContextValue = {
    provider: props.provider,
    registry: props.registry,
    workspace: createWorkspace(props.provider),
  }
  return <PrismContext.Provider value={value}>{props.children}</PrismContext.Provider>
}
