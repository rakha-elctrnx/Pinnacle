import { save } from '@tauri-apps/plugin-dialog'


export interface ConnectionPayload {
  type: string
  host: string
  port: number
  username: string
  password: string
  database: string
  ssl: boolean
}

/**
 * Show a native save dialog and return the chosen path, or null if cancelled.
 */
export async function showExportSaveDialog(
  suggestedFilename: string,
): Promise<string | null> {
  // Extract the extension from the suggested filename for the file filter.
  // Using extensions: ['*'] causes macOS to append a literal ".*" to the name.
  const ext = suggestedFilename.includes('.')
    ? suggestedFilename.split('.').pop() ?? '*'
    : '*'
  return save({
    defaultPath: suggestedFilename,
    filters: [
      { name: 'All Files', extensions: [ext] },
    ],
  })
}