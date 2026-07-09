import { emit, listen } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { ConnectionProfile } from '../types/domain'

/**
 * New Connection Window Service
 *
 * Manages the lifecycle of the native OS window for the new connection form.
 * This service opens a separate Tauri window (`new-connection`) instead
 * of rendering the form as an in-page modal.
 *
 * Communication flow:
 * 1. Main window calls `openNewConnectionWindow()` with initial payload
 * 2. New connection window listens for `new-connection-open` event and receives payload
 * 3. User fills form and clicks Save → new connection window emits `new-connection-save`
 * 4. Main window receives `new-connection-save` and calls the provided callback
 * 5. New connection window hides automatically
 *
 * For edit mode, pass `editingId` and `existingProfile` in the payload.
 * For create mode, pass `editingId: null` and `existingProfile: null`.
 */

interface NewConnectionOpenPayload {
  editingId: string | null
  existingProfile: ConnectionProfile | null
  existingGroups: string[]
  theme: 'light' | 'dark'
}

interface NewConnectionSavePayload {
  profile: ConnectionProfile
  password?: string
}

/**
 * Open the new connection window with the given initial state.
 *
 * @param payload - Initial new connection state (edit mode or create mode)
 * @param onSave - Callback invoked when user saves a connection
 * @param onClose - Callback invoked when user closes without saving
 * @returns Cleanup function to remove event listeners
 */
export async function openNewConnectionWindow(
  payload: NewConnectionOpenPayload,
  onSave: (profile: ConnectionProfile, password?: string) => void,
  onClose?: () => void,
): Promise<() => void> {
  const connWindow = await WebviewWindow.getByLabel('new-connection')

  if (!connWindow) {
    console.error('[NewConnectionService] new-connection window not found')
    return () => {}
  }

  // Set up listeners before showing the window
  const unlistenSave = await listen<NewConnectionSavePayload>(
    'new-connection-save',
    (event) => {
      const { profile, password } = event.payload
      onSave(profile, password)
      // Window hides itself after emitting new-connection-save
    },
  )

  const unlistenClose = await listen<unknown>('new-connection-close', () => {
    onClose?.()
    // Window hides itself after emitting new-connection-close
  })

  // Show and focus the window
  await connWindow.show()
  await connWindow.center()
  await connWindow.setFocus()

  // Emit the open event with the payload
  await emit('new-connection-open', payload)

  // Return cleanup function
  return () => {
    unlistenSave()
    unlistenClose()
  }
}

/**
 * Check if the new connection window is currently visible.
 */
export async function isNewConnectionWindowVisible(): Promise<boolean> {
  const connWindow = await WebviewWindow.getByLabel('new-connection')
  if (!connWindow) return false
  return await connWindow.isVisible()
}

/**
 * Close the new connection window programmatically (e.g., from main window).
 */
export async function closeNewConnectionWindow(): Promise<void> {
  const connWindow = await WebviewWindow.getByLabel('new-connection')
  if (!connWindow) return
  await connWindow.hide()
}
