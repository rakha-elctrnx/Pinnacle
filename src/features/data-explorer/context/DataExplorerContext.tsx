import { createContext, useContext } from 'react'
import type { DataExplorerOrchestratorResult } from '../hooks/useDataExplorerOrchestrator'

/**
 * DataExplorerContext exposes the orchestrator's full result to every
 * region (header, navigation strip, sidebar, workspace, inspector,
 * footer) without prop drilling.
 *
 * The provider is mounted exactly once at the DataExplorerLayout level
 * so a single orchestrator instance is shared across the entire shell.
 */
const DataExplorerContext = createContext<DataExplorerOrchestratorResult | null>(null)

/** Internal provider component — prefer the named export from `DataExplorerLayout`. */
export const DataExplorerContextProvider = DataExplorerContext.Provider

/**
 * Hook used by region components to access orchestrator state.
 *
 * Throws a descriptive error when called outside of a DataExplorerLayout
 * subtree so misuse is caught early during development.
 */
export function useDataExplorerContext(): DataExplorerOrchestratorResult {
  const ctx = useContext(DataExplorerContext)
  if (!ctx) {
    throw new Error(
      'useDataExplorerContext() must be used within a <DataExplorerLayout>. ' +
        'Wrap the consuming component tree with the layout to provide the orchestrator context.',
    )
  }
  return ctx
}
