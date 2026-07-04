import { emitTo, listen } from '@tauri-apps/api/event'
import { LogicalPosition } from '@tauri-apps/api/dpi'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'

interface TableDesignerOpenPayload {
  mode: 'create' | 'edit'
  schema: string
  database: string
  connectionPayload: ConnectionPayload
  tableName?: string
  /** Optional — auto-detected from document if omitted. */
  theme?: 'light' | 'dark'
}

const WINDOW_LABEL = 'table-designer'

async function getOrCreateWindow(): Promise<{ win: WebviewWindow; isNew: boolean }> {
  const existing = await WebviewWindow.getByLabel(WINDOW_LABEL)
  if (existing) return { win: existing, isNew: false }

  const { promise, resolve, reject } = Promise.withResolvers<WebviewWindow>()
  const win = new WebviewWindow(WINDOW_LABEL, {
    url: '/table-designer',
    title: 'Table Designer',
    hiddenTitle: true,
    titleBarStyle: 'overlay',
    trafficLightPosition: new LogicalPosition(14, 14),
    width: 900,
    height: 700,
    minWidth: 720,
    minHeight: 500,
    resizable: true,
    visible: true,
    center: true,
    decorations: true,
    alwaysOnTop: true,
    focus: true,
    minimizable: false,
    fullscreen: false,
  })
  win.once('tauri://created', () => resolve(win))
  win.once('tauri://error', (e) => reject(new Error(`Failed to create designer window: ${e.payload}`)))
  const createdWin = await promise
  return { win: createdWin, isNew: true }
}

/**
 * Open the table designer in a separate window.
 * Creates the Tauri webview on first call; reuses it afterwards.
 *
 * @param payload - Designer window initial state
 * @param onSaved - Called when user saves a table (DDL executed successfully)
 * @param onClose - Called when user closes the window without saving
 * @returns Cleanup function to remove event listeners
 */
export async function openDesignerWindow(
  payload: TableDesignerOpenPayload,
  onSaved?: (tableName: string) => void,
  onClose?: () => void,
): Promise<() => void> {
  const { win } = await getOrCreateWindow()

  // Set up ready listener BEFORE showing window to avoid race condition
  const { promise: ready, resolve: resolveReady, reject: rejectReady } = Promise.withResolvers<void>()
  const timer = setTimeout(() => rejectReady(new Error('Timeout waiting for designer window to be ready')), 5000)
  const unlistenReady = await listen<unknown>('table-designer-ready', () => {
    clearTimeout(timer)
    resolveReady()
  })

  // Now show and focus the window
  await win.show()
  await win.center()
  await win.setFocus()

  // Wait for child to signal readiness
  await ready
  unlistenReady()

  const unlistenSave = listen<{ tableName?: string }>('table-designer-saved', (event) => {
    if (event.payload.tableName) {
      onSaved?.(event.payload.tableName)
    }
  })

  const unlistenClose = listen<unknown>('table-designer-close', () => {
    onClose?.()
  })

  const theme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'dark'
  await emitTo('table-designer', 'table-designer-open', { ...payload, theme })

  const [saveDone, closeDone] = await Promise.all([unlistenSave, unlistenClose])
  return () => {
    saveDone()
    closeDone()
  }
}

/**
 * Check if the designer window is currently visible.
 */
export async function isDesignerWindowVisible(): Promise<boolean> {
  const win = await WebviewWindow.getByLabel(WINDOW_LABEL)
  if (!win) return false
  return win.isVisible()
}

/**
 * Close the designer window programmatically.
 */
export async function closeDesignerWindow(): Promise<void> {
  const win = await WebviewWindow.getByLabel(WINDOW_LABEL)
  if (!win) return
  await win.hide()
}
