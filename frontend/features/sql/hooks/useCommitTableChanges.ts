/**
 * useCommitTableChanges — TanStack Query mutation hook
 *
 * Wraps the commit_table_changes Tauri command so TableDetailPage
 * can call it from a mutation and track loading/success/error state.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { commitTableChanges } from '../clients/sql'
import type { CommitTableChangesPayload } from '../types/sql'

export function useCommitTableChanges(connectionId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CommitTableChangesPayload) => commitTableChanges(payload),
    onSuccess: (_data, variables) => {
      // Invalidate table data queries so the UI refreshes after commit
      queryClient.invalidateQueries({ queryKey: ['table-data', variables.tableName] })
    },
    meta: { connectionId },
  })
}
