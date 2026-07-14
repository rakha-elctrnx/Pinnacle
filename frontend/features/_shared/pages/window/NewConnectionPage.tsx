import { useEffect, useMemo, useState, useRef } from 'react'
import { listen, emit } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { ConnectionProfile, ConnectionType } from '../../types/domain'
import type { ConnectionStep, TestConnectionResult } from '../../types/shared'
import {
  databaseTypeOptions,
  defaultPortByType,
  defaultInitialDatabaseByType,
} from '../../constants'
import { elasticTestConnection } from '../../../elasticsearch/clients/elasticsearch'
import { testConnection } from '../../../sql/clients/sql'
import { redisTestConnection } from '../../../redis/clients/redis'
import {
  isSqlConnectionType,
  isElasticsearchType,
  isRedisConnectionType,
} from '../../utils'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plug,
  Plus,
  X,
} from 'lucide-react'
import { CustomTitlebar } from '../../components/layout/CustomTitlebar'

/**
 * NewConnectionPage — standalone page rendered inside the dedicated
 * `new-connection` Tauri window.
 *
 * Responsibilities:
 * - Receive initial new connection payload (edit mode + existing groups) from
 *   the main window via the `new-connection-open` event.
 * - Render the connection form UI directly (embedded mode, no overlay).
 * - Forward the saved profile back to the main window via
 *   `new-connection-save`, then close the new connection window.
 * - Close the new connection window when the user cancels via `new-connection-close`.
 *
 * This page is mounted at `/new-connection` and is only loaded by the
 * secondary Tauri webview window labelled `new-connection` (configured
 * in `tauri.conf.json`).
 */

interface NewConnectionOpenPayload {
  editingId: string | null
  existingProfile: ConnectionProfile | null
  existingGroups: string[]
  theme: 'light' | 'dark'
}

interface FieldError {
  host?: string
  port?: string
  database?: string
  name?: string
}

export function NewConnectionPage() {
  const [openPayload, setOpenPayload] =
    useState<NewConnectionOpenPayload | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Sync theme from the main window (this webview may not share localStorage).
  useEffect(() => {
    let mounted = true
    const unlistenPromise = listen<{ theme: 'light' | 'dark' }>(
      'theme-changed',
      (event) => {
        if (!mounted) return
        document.documentElement.setAttribute('data-theme', event.payload.theme)
      },
    )
    return () => {
      mounted = false
      unlistenPromise.then((fn) => fn())
    }
  }, [])

  // Listen for the open event from the main window.
  useEffect(() => {
    let mounted = true

    const setup = async () => {
      const unlisten = await listen<NewConnectionOpenPayload>(
        'new-connection-open',
        (event) => {
          if (!mounted) return
          // Apply theme from main window immediately
          document.documentElement.setAttribute(
            'data-theme',
            event.payload.theme,
          )
          setOpenPayload(event.payload)
          setIsReady(true)
        },
      )

      // Tell the main window we are ready to receive the payload.
      await emit('new-connection-ready', {})

      return unlisten
    }

    let unlistenFn: (() => void) | null = null
    setup().then((fn) => {
      unlistenFn = fn
    })

    return () => {
      mounted = false
      unlistenFn?.()
    }
  }, [])

  // Intercept native window close (X button, Cmd+W) so the main
  // window is notified and can reset isAddModalOpen.
  useEffect(() => {
    const win = getCurrentWindow()
    const unlistenPromise = win.onCloseRequested(async (event) => {
      event.preventDefault()
      await emit('new-connection-close', {})
      try {
        await win.hide()
      } catch {
        // Window may already be hidden
      }
    })

    return () => {
      unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  const handleClose = async () => {
    await emit('new-connection-close', {})
    try {
      await getCurrentWindow().hide()
    } catch {
      // Ignore — window may already be hidden.
    }
    // Reset local state so form unmounts and starts fresh on next open
    setIsReady(false)
    setOpenPayload(null)
  }

  const handleSave = async (profile: ConnectionProfile, password?: string) => {
    await emit('new-connection-save', { profile, password })
    try {
      await getCurrentWindow().hide()
    } catch {
      // Ignore — window may already be hidden.
    }
    // Reset local state so form unmounts and starts fresh on next open
    setIsReady(false)
    setOpenPayload(null)
  }

  // Derive props for the modal. When no payload has arrived yet we still
  // render the modal in "create" mode with empty groups so the window
  // never flashes an empty state once the payload arrives.
  const editingId = openPayload?.editingId ?? null
  const existingProfile = openPayload?.existingProfile ?? null
  const existingGroups = useMemo(
    () => openPayload?.existingGroups ?? [],
    [openPayload],
  )

  return (
    <div className="h-screen w-screen bg-bg-base text-text-primary">
      {isReady || openPayload ? (
        <ConnectionFormEmbedded
          editingId={editingId}
          existingProfile={existingProfile}
          existingGroups={existingGroups}
          onSave={handleSave}
          onClose={handleClose}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConnectionFormEmbedded — inlined connection form UI (always embedded)
// ---------------------------------------------------------------------------

interface ConnectionFormProps {
  editingId: string | null
  existingProfile: ConnectionProfile | null
  existingGroups: string[]
  onSave: (profile: ConnectionProfile, password?: string) => void
  onClose: () => void
}

function ConnectionFormEmbedded({
  editingId,
  existingProfile,
  existingGroups,
  onSave,
  onClose,
}: ConnectionFormProps) {
  const [step, setStep] = useState<ConnectionStep>(1)
  const [newType, setNewType] = useState<ConnectionType>(
    existingProfile?.type ?? 'postgresql',
  )
  const [newName, setNewName] = useState(existingProfile?.name ?? '')
  const [newHost, setNewHost] = useState(existingProfile?.host ?? 'localhost')
  const [newPort, setNewPort] = useState(
    String(existingProfile?.port ?? defaultPortByType.postgresql),
  )
  const [newInitialDatabase, setNewInitialDatabase] = useState(
    existingProfile?.database ?? defaultInitialDatabaseByType.postgresql,
  )
  const [newUser, setNewUser] = useState(existingProfile?.username ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [newSsl, setNewSsl] = useState(existingProfile?.ssl ?? false)
  const [newGroup, setNewGroup] = useState(existingProfile?.tags[0] ?? '')
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false)
  const groupInputRef = useRef<HTMLInputElement>(null)
  const groupDropdownRef = useRef<HTMLDivElement>(null)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [testConnectionResult, setTestConnectionResult] =
    useState<TestConnectionResult | null>(null)
  const [skipTest, setSkipTest] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldError>({})

  // Close group dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        groupDropdownRef.current &&
        !groupDropdownRef.current.contains(e.target as Node) &&
        groupInputRef.current &&
        !groupInputRef.current.contains(e.target as Node)
      ) {
        setGroupDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filtered groups for the dropdown (unique, non-empty, matching input)
  const filteredGroups = useMemo(() => {
    const query = newGroup.trim().toLowerCase()
    const unique = [...new Set(existingGroups.filter(Boolean))]
    if (!query) return unique
    return unique.filter((g) => g.toLowerCase().includes(query))
  }, [existingGroups, newGroup])

  const isNewGroupValue =
    newGroup.trim() !== '' && !existingGroups.includes(newGroup.trim())

  // Inline validation for step 2 fields
  const validateFields = useMemo(() => {
    const errors: FieldError = {}
    if (step === 2) {
      const isSqlite = newType === 'sqlite'
      if (!isSqlite) {
        if (newHost.trim() === '') {
          errors.host = 'Host is required'
        }
        const portNum = Number(newPort)
        if (newPort.trim() === '') {
          errors.port = 'Port is required'
        } else if (
          !Number.isFinite(portNum) ||
          portNum < 1 ||
          portNum > 65535
        ) {
          errors.port = 'Port must be 1–65535'
        }
      }
      if (isSqlite) {
        if (newInitialDatabase.trim() === '') {
          errors.database = 'File path is required'
        }
      } else if (newInitialDatabase.trim() === '') {
        errors.database = 'Database is required'
      }
    }
    return errors
  }, [step, newType, newHost, newPort, newInitialDatabase])

  const isTestPassed = testConnectionResult?.kind === 'success'
  const isSqlType = isSqlConnectionType(newType)
  const isEsType = isElasticsearchType(newType)
  const isRedisType = isRedisConnectionType(newType)
  const needsTestGate = (isSqlType || isEsType || isRedisType) && !editingId
  const selectedOption = databaseTypeOptions.find((o) => o.value === newType)
  const canSave = needsTestGate
    ? (isTestPassed || skipTest) && Object.keys(validateFields).length === 0
    : Object.keys(validateFields).length === 0

  const resetForm = () => {
    setStep(1)
    setNewType('postgresql')
    setNewName('')
    setNewHost('localhost')
    setNewPort(String(defaultPortByType.postgresql))
    setNewInitialDatabase(defaultInitialDatabaseByType.postgresql)
    setNewUser('')
    setNewPassword('')
    setNewSsl(false)
    setNewGroup('')
    setGroupDropdownOpen(false)
    setIsTestingConnection(false)
    setTestConnectionResult(null)
    setSkipTest(false)
    setFieldErrors({})
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleChangeType = (type: ConnectionType) => {
    setNewType(type)
    setNewPort(String(defaultPortByType[type]))
    setNewInitialDatabase(defaultInitialDatabaseByType[type])
    setTestConnectionResult(null)
    setSkipTest(false)
    setFieldErrors({})
  }

  const handleTestConnection = async () => {
    const errors = validateFields
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setTestConnectionResult({
        kind: 'error',
        message: 'Please fix the highlighted fields before testing.',
      })
      return
    }

    const parsedPort = Number(newPort)
    setIsTestingConnection(true)
    setTestConnectionResult(null)

    try {
      const payload = {
        type: newType,
        host: newHost.trim(),
        port: Number.isFinite(parsedPort)
          ? parsedPort
          : defaultPortByType[newType],
        username: newUser.trim(),
        password: newPassword,
        database:
          newInitialDatabase.trim() || defaultInitialDatabaseByType[newType],
        ssl: newType === 'redis' && Number(newPort) === 6380 ? true : newSsl,
      }
      if (isEsType) {
        await elasticTestConnection(payload)
        setTestConnectionResult({
          kind: 'success',
          message: `Connected to Elasticsearch cluster at ${newHost.trim()}:${parsedPort}.`,
        })
      } else if (isSqlType) {
        const result = await testConnection(payload)
        setTestConnectionResult({
          kind: result.ok ? 'success' : 'error',
          message: result.message,
        })
      } else if (isRedisType) {
        const result = await redisTestConnection(payload)
        setTestConnectionResult({
          kind: result.ok ? 'success' : 'error',
          message: result.message,
        })
      } else {
        setTestConnectionResult({
          kind: 'success',
          message:
            'Connector validated locally (deep test not available for this type).',
        })
      }
    } catch (error) {
      setTestConnectionResult({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to test connection.',
      })
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleSave = () => {
    const errors = validateFields
    setFieldErrors(errors)
    if (!newName.trim()) {
      setFieldErrors((prev) => ({
        ...prev,
        name: 'Connection name is required',
      }))
      return
    }
    if (Object.keys(errors).length > 0) return

    const now = new Date().toISOString()
    const parsedPort = Number(newPort)
    const savedId = editingId ?? crypto.randomUUID()
    const group = newGroup.trim()

    onSave(
      {
        id: savedId,
        name: newName.trim(),
        type: newType,
        host: newHost.trim(),
        port: Number.isFinite(parsedPort)
          ? parsedPort
          : defaultPortByType[newType],
        username: newUser.trim(),
        database:
          newInitialDatabase.trim() || defaultInitialDatabaseByType[newType],
        ssl: newType === 'redis' && Number(newPort) === 6380 ? true : newSsl,
        passwordRef: `keyring://${savedId}`,
        tags: group ? [group] : ['Ungrouped'],
        favorite: existingProfile?.favorite ?? false,
        createdAt: existingProfile?.createdAt ?? now,
        updatedAt: now,
      },
      newPassword,
    )

    handleClose()
  }

  const inputClasses =
    'w-full rounded-lg border border-border-default bg-bg-subtle/50 px-3 py-2.5 text-body text-text-primary placeholder:text-text-muted outline-none transition focus:border-border-focus focus:ring-2 focus:ring-focus-ring focus:bg-bg-base'

  const inputErrorClasses =
    'w-full rounded-lg border border-border-danger bg-danger-subtle/30 px-3 py-2.5 text-body text-text-primary placeholder:text-text-muted outline-none transition focus:border-border-danger focus:ring-2 focus:ring-danger-ring'

  return (
    <section className="flex flex-col w-full h-full overflow-hidden bg-bg-base">
      <CustomTitlebar
        title={editingId ? 'Edit Connection' : 'New Connection'}
      />

      {/* Scrollable content area — flex-1 pushes footer to bottom */}
      <div className="flex-1 overflow-y-auto">
        {/* Step Indicator */}
        <div className="flex items-center gap-3 px-6 pt-5">
          <div
            className={`flex items-center gap-2 text-label transition-colors ${step >= 1 ? 'text-primary' : 'text-text-muted'}`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-caption transition-all ${step === 1 ? 'bg-primary text-text-inverse shadow-sm' : step > 1 ? 'bg-primary-subtle text-primary' : 'bg-bg-muted text-text-muted'}`}
            >
              1
            </span>
            Database Type
          </div>
          <div
            className={`h-px flex-1 rounded-full transition-colors ${step >= 2 ? 'bg-primary/30' : 'bg-border-default'}`}
          />
          <div
            className={`flex items-center gap-2 text-label transition-colors ${step >= 2 ? 'text-primary' : 'text-text-muted'}`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-caption transition-all ${step === 2 ? 'bg-primary text-text-inverse shadow-sm' : 'bg-bg-muted text-text-muted'}`}
            >
              2
            </span>
            Connection Details
          </div>
        </div>

        {/* Step 1: Select Database Type */}
        {step === 1 && (
          <div className="px-6 py-5">
            <p className="mb-4 text-body text-text-muted">
              Choose the database you want to connect to.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {databaseTypeOptions.map((option) => {
                const active = option.value === newType
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleChangeType(option.value)}
                    className={[
                      'group relative flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all',
                      active
                        ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                        : 'border-border-default bg-bg-subtle/50 hover:border-border-strong hover:bg-bg-hover hover:shadow-xs',
                    ].join(' ')}
                  >
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg transition ${
                        active
                          ? 'bg-primary/10'
                          : 'bg-bg-muted/70 group-hover:bg-bg-subtle'
                      }`}
                    >
                      {(() => {
                        const Icon = option.Icon
                        return <Icon size={28} />
                      })()}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block text-subheading ${active ? 'text-primary' : 'text-text-primary'}`}
                      >
                        {option.label}
                      </span>
                      <span
                        className={`block text-caption ${active ? 'text-primary/70' : 'text-text-muted'}`}
                      >
                        {option.hint}
                      </span>
                    </span>
                    {active && (
                      <span className="ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary">
                        <Check
                          size={12}
                          className="text-text-inverse"
                          strokeWidth={3}
                        />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 2: Connection Details + Test */}
        {step === 2 && (
          <div className="px-6 py-5">
            {/* Selected type badge */}
            <div className="mb-5 flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-border-default bg-bg-subtle">
                {selectedOption &&
                  (() => {
                    const Icon = selectedOption.Icon
                    return <Icon size={18} />
                  })()}
              </span>
              <span className="text-subheading text-text-primary">
                {selectedOption?.label}
              </span>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="ml-auto text-label text-primary hover:text-primary-hover cursor-pointer hover:underline"
              >
                Change
              </button>
            </div>

            <div className="space-y-3">
              {/* Name */}
              <div>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Connection name"
                  className={
                    fieldErrors.name ? inputErrorClasses : inputClasses
                  }
                />
                {fieldErrors.name && (
                  <p className="mt-1 flex items-center gap-1 text-caption text-danger">
                    <AlertTriangle size={11} />
                    {fieldErrors.name}
                  </p>
                )}
              </div>
              {/* Host & Port — skipped for SQLite */}
              {newType !== 'sqlite' && (
                <div className="flex gap-2">
                  <div className="w-2/3">
                    <input
                      value={newHost}
                      onChange={(e) => setNewHost(e.target.value)}
                      placeholder="Host"
                      className={
                        fieldErrors.host
                          ? `${inputErrorClasses} w-full`
                          : `${inputClasses} w-full`
                      }
                    />
                    {fieldErrors.host && (
                      <p className="mt-1 flex items-center gap-1 text-caption text-danger">
                        <AlertTriangle size={11} />
                        {fieldErrors.host}
                      </p>
                    )}
                  </div>
                  <div className="w-1/3">
                    <input
                      value={newPort}
                      onChange={(e) => setNewPort(e.target.value)}
                      placeholder="Port"
                      className={
                        fieldErrors.port
                          ? `${inputErrorClasses} w-full`
                          : `${inputClasses} w-full`
                      }
                    />
                    {fieldErrors.port && (
                      <p className="mt-1 flex items-center gap-1 text-caption text-danger">
                        <AlertTriangle size={11} />
                        {fieldErrors.port}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Database — "File path" for SQLite */}
              <div>
                <input
                  value={newInitialDatabase}
                  onChange={(e) => setNewInitialDatabase(e.target.value)}
                  placeholder={newType === 'sqlite' ? 'File path' : 'Database'}
                  className={
                    fieldErrors.database ? inputErrorClasses : inputClasses
                  }
                />
                {fieldErrors.database && (
                  <p className="mt-1 flex items-center gap-1 text-caption text-danger">
                    <AlertTriangle size={11} />
                    {fieldErrors.database}
                  </p>
                )}
              </div>

              {/* Username & Password — skipped for SQLite */}
              {newType !== 'sqlite' && (
                <div className="flex gap-2">
                  <input
                    value={newUser}
                    onChange={(e) => setNewUser(e.target.value)}
                    placeholder="Username"
                    className={`${inputClasses} flex-1`}
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Password"
                    className={`${inputClasses} flex-1`}
                  />
                </div>
              )}

              {/* Group & SSL */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1" ref={groupDropdownRef}>
                  <input
                    ref={groupInputRef}
                    value={newGroup}
                    onChange={(e) => {
                      setNewGroup(e.target.value)
                      setGroupDropdownOpen(true)
                    }}
                    onFocus={() => setGroupDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setGroupDropdownOpen(false)
                      }
                    }}
                    placeholder="Group"
                    className={`${inputClasses} pr-8`}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setGroupDropdownOpen((prev) => !prev)
                      if (!groupDropdownOpen) groupInputRef.current?.focus()
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${groupDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {groupDropdownOpen &&
                    (filteredGroups.length > 0 || isNewGroupValue) && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-auto rounded-lg border border-border-default bg-bg-base py-1 shadow-lg backdrop-blur-sm">
                        {filteredGroups.map((group) => (
                          <button
                            key={group}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setNewGroup(group)
                              setGroupDropdownOpen(false)
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-body transition hover:bg-primary/10 ${
                              group === newGroup
                                ? 'bg-primary/10 text-primary'
                                : 'text-text-primary'
                            }`}
                          >
                            <span className="truncate">{group}</span>
                            {group === newGroup && (
                              <Check
                                size={12}
                                className="ml-auto shrink-0 text-primary"
                              />
                            )}
                          </button>
                        ))}
                        {isNewGroupValue && (
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setGroupDropdownOpen(false)
                            }}
                            className="flex w-full items-center gap-2 border-t border-border-default px-3 py-2 text-left text-body text-primary transition hover:bg-primary/10"
                          >
                            <Plus size={12} className="shrink-0" />
                            <span className="truncate">
                              Create "{newGroup.trim()}"
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-body text-text-secondary">
                  <span
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      newSsl ? 'bg-primary' : 'bg-border-strong'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={newSsl}
                      onChange={(e) => setNewSsl(e.target.checked)}
                      className="sr-only"
                    />
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                        newSsl ? 'translate-x-4.5' : 'translate-x-1'
                      }`}
                    />
                  </span>
                  SSL
                </label>
              </div>

              {/* Test Connection */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border-default bg-primary px-4 py-2.5 text-subheading text-text-inverse transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isTestingConnection ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Testing connection…
                    </>
                  ) : (
                    <>
                      <Plug size={15} />
                      Test Connection
                    </>
                  )}
                </button>

                {testConnectionResult && (
                  <div
                    className={`mt-2.5 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-body ${
                      testConnectionResult.kind === 'success'
                        ? 'border-success/30 bg-success/10 text-success-text'
                        : 'border-danger/30 bg-danger-subtle text-danger'
                    }`}
                  >
                    {testConnectionResult.kind === 'success' ? (
                      <Check size={15} className="mt-0.5 shrink-0" />
                    ) : (
                      <X size={15} className="mt-0.5 shrink-0" />
                    )}
                    <span className="leading-snug">
                      {testConnectionResult.message}
                    </span>
                  </div>
                )}
              </div>

              {/* Skip test override for new SQL/ES connections */}
              {needsTestGate && !isTestPassed && (
                <label className="flex items-center gap-2 text-label text-text-muted select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipTest}
                    onChange={(e) => setSkipTest(e.target.checked)}
                    className="accent-primary"
                  />
                  Skip test and save anyway (not recommended)
                </label>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between border-t border-border-default px-6 py-4 bg-bg-subtle/50">
        <button
          type="button"
          onClick={() => setStep(1)}
          disabled={step === 1}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3.5 py-2 text-subheading text-text-secondary transition hover:bg-bg-hover hover:text-text-primary disabled:invisible"
        >
          <ChevronLeft size={15} />
          Back
        </button>

        {step === 1 ? (
          <button
            type="button"
            onClick={() => setStep(2)}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-label text-text-inverse shadow-sm transition hover:bg-primary-hover active:bg-primary-hover"
          >
            Continue
            <ChevronRight size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-label text-text-inverse shadow-sm transition hover:bg-primary-hover active:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check size={15} />
            {editingId ? 'Update Connection' : 'Save Connection'}
          </button>
        )}
      </footer>
    </section>
  )
}
