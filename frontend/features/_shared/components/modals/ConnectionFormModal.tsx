import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Loader2,
  Plug,
  Plus,
  Shield,
  Settings,
  X,
} from 'lucide-react'
import { useState, useMemo, useRef, useEffect } from 'react'
import { FolderOpen } from 'lucide-react'
import type {
  ConnectionProfile,
  ConnectionType,
  Folder,
  SshAuthMethod,
  SslMode,
} from '../../types/domain'
import type { ConnectionStep, TestConnectionResult } from '../../types/shared'
import {
  databaseTypeOptions,
  defaultPortByType,
  defaultInitialDatabaseByType,
} from '../../constants'
import { elasticTestConnection } from '../../../elasticsearch/clients/elasticsearch'
import { testConnection } from '../../../sql/clients/sql'
import { redisTestConnection } from '../../../redis/clients/redis'
// UTILS CONNECTION TYPE
import {
  isSqlConnectionType,
  isElasticsearchType,
  isRedisConnectionType,
} from '../../utils'
interface FieldError {
  host?: string
  port?: string
  database?: string
  name?: string
}

interface ConnectionFormProps {
  editingId: string | null
  existingProfile: ConnectionProfile | null
  existingGroups: string[]
  folders?: Folder[]
  onSave: (
    profile: ConnectionProfile,
    password?: string,
    sshPassword?: string,
    keyPassphrase?: string,
  ) => void
  onClose: () => void
  embedded?: boolean
}

export function ConnectionFormModal({
  editingId,
  existingProfile,
  existingGroups,
  folders = [],
  onSave,
  onClose,
  embedded = false,
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
  const [newSslMode, setNewSslMode] = useState<SslMode>(
    existingProfile?.sslConfig?.mode ??
      (existingProfile?.ssl ? 'require' : 'prefer'),
  )
  const [newCaCertPath, setNewCaCertPath] = useState(
    existingProfile?.sslConfig?.caCertPath ?? '',
  )
  const [newClientCertPath, setNewClientCertPath] = useState(
    existingProfile?.sslConfig?.clientCertPath ?? '',
  )
  const [newClientKeyPath, setNewClientKeyPath] = useState(
    existingProfile?.sslConfig?.clientKeyPath ?? '',
  )
  const [newSsl, setNewSsl] = useState(existingProfile?.ssl ?? false)
  const [newFolderId, setNewFolderId] = useState<string | null>(existingProfile?.folderId ?? null)
  const [newGroup, setNewGroup] = useState(existingProfile?.tags[0] ?? '')
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false)
  const groupInputRef = useRef<HTMLInputElement>(null)
  const groupDropdownRef = useRef<HTMLDivElement>(null)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [testConnectionResult, setTestConnectionResult] =
    useState<TestConnectionResult | null>(null)
  const [skipTest, setSkipTest] = useState(false)
  // SSH tunnel config (secrets kept in component state, never in profile)
  const [sshEnabled, setSshEnabled] = useState(false)
  const [sshExpanded, setSshExpanded] = useState(false)
  const [sshHost, setSshHost] = useState(existingProfile?.ssh?.host ?? '')
  const [sshPort, setSshPort] = useState(
    String(existingProfile?.ssh?.port ?? 22),
  )
  const [sshUser, setSshUser] = useState(existingProfile?.ssh?.username ?? '')
  const [sshAuthMethod, setSshAuthMethod] = useState<SshAuthMethod>(
    existingProfile?.ssh?.authMethod ?? 'password',
  )
  const [sshPrivateKeyPath, setSshPrivateKeyPath] = useState(
    existingProfile?.ssh?.privateKeyPath ?? '',
  )
  const [sshPassword, setSshPassword] = useState('')
  const [keyPassphrase, setKeyPassphrase] = useState('')
  // Pool config (optional; backend defaults when undefined)
  const [advancedExpanded, setAdvancedExpanded] = useState(false)
  const [poolSize, setPoolSize] = useState(
    existingProfile?.poolSize?.toString() ?? '',
  )
  const [idleTimeoutSecs, setIdleTimeoutSecs] = useState(
    existingProfile?.idleTimeoutSecs?.toString() ?? '',
  )
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
  // Gate: (SQL,ES, REDIS)
  // require test-before-save for new connections
  const needsTestGate = (isSqlType || isEsType || isRedisType) && !editingId
  const canSave = needsTestGate
    ? (isTestPassed || skipTest) && Object.keys(validateFields).length === 0
    : Object.keys(validateFields).length === 0

  // SQL types use the mode-based sslConfig; others keep the boolean ssl toggle.
  const sslNeedsCerts =
    newSslMode === 'verify-ca' || newSslMode === 'verify-full'
  const sqlSslConfig = isSqlType
    ? {
        mode: newSslMode,
        caCertPath: newCaCertPath || undefined,
        clientCertPath: newClientCertPath || undefined,
        clientKeyPath: newClientKeyPath || undefined,
      }
    : undefined
  const effectiveSsl =
    newType === 'redis' && Number(newPort) === 6380
      ? true
      : isSqlType
        ? newSslMode !== 'disable'
        : newSsl

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
    setNewSslMode('prefer')
    setNewCaCertPath('')
    setNewClientCertPath('')
    setNewClientKeyPath('')
    setNewGroup('')
    setGroupDropdownOpen(false)
    setIsTestingConnection(false)
    setTestConnectionResult(null)
    setSkipTest(false)
    setFieldErrors({})
    setSshEnabled(false)
    setSshExpanded(false)
    setSshHost('')
    setSshPort('22')
    setSshUser('')
    setSshAuthMethod('password')
    setSshPrivateKeyPath('')
    setSshPassword('')
    setKeyPassphrase('')
    setAdvancedExpanded(false)
    setPoolSize('')
    setIdleTimeoutSecs('')
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
    // Sensible cloud default: postgres → prefer, mysql → require.
    if (type === 'postgresql') setNewSslMode('prefer')
    else if (type === 'mysql') setNewSslMode('require')
  }

  const handleTestConnection = async () => {
    // Validate fields first
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
      const sshConfig = sshEnabled
        ? {
            host: sshHost.trim(),
            port: Number(sshPort) || 22,
            username: sshUser.trim(),
            authMethod: sshAuthMethod,
            privateKeyPath:
              sshAuthMethod === 'privateKey' ? sshPrivateKeyPath : undefined,
          }
        : undefined
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
        ssl: effectiveSsl,
        sslConfig: sqlSslConfig,
        ssh: sshConfig,
      }
      // CONDITION CASE (SQL, ES, REDIS)
      // IF ELASTICSEARCH → CALL ELASTICSEARCH TEST
      if (isEsType) {
        await elasticTestConnection(payload)
        setTestConnectionResult({
          kind: 'success',
          message: `Connected to Elasticsearch cluster at ${newHost.trim()}:${parsedPort}.`,
        })
      }
      // ELSE IF SQL → CALL SQL TEST
      else if (isSqlType) {
        const result = await testConnection(
          payload,
          sshEnabled && sshAuthMethod === 'password' ? sshPassword : undefined,
          sshEnabled && sshAuthMethod === 'privateKey'
            ? keyPassphrase
            : undefined,
        )
        setTestConnectionResult({
          kind: result.ok ? 'success' : 'error',
          message: result.message,
        })
      }
      // ELSE IF REDIS → CALL REDIS TEST
      else if (isRedisType) {
        const result = await redisTestConnection(payload)
        setTestConnectionResult({
          kind: result.ok ? 'success' : 'error',
          message: result.message,
        })
      }
      // ELSE IF NOT IMPLEMENTED, SHOW GENERIC SUCCESS (for types without deep test)
      else {
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

    const sshConfig = sshEnabled
      ? {
          host: sshHost.trim(),
          port: Number(sshPort) || 22,
          username: sshUser.trim(),
          authMethod: sshAuthMethod,
          privateKeyPath:
            sshAuthMethod === 'privateKey' ? sshPrivateKeyPath : undefined,
        }
      : undefined

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
        ssl: effectiveSsl,
        sslConfig: sqlSslConfig,
        ssh: sshConfig,
        poolSize: poolSize ? Number(poolSize) : undefined,
        idleTimeoutSecs: idleTimeoutSecs ? Number(idleTimeoutSecs) : undefined,
        passwordRef: newPassword.length > 0 ? `keyring://${savedId}` : '',
        tags: group ? [group] : [],
        folderId: newFolderId,
        favorite: existingProfile?.favorite ?? false,
        createdAt: existingProfile?.createdAt ?? now,
        updatedAt: now,
      },
      newPassword.length > 0 ? newPassword : undefined,
      sshEnabled && sshAuthMethod === 'password' ? sshPassword : undefined,
      sshEnabled && sshAuthMethod === 'privateKey' ? keyPassphrase : undefined,
    )

    handleClose()
  }

  const selectedOption = databaseTypeOptions.find((o) => o.value === newType)

  const inputClasses =
    'w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-body text-on-surface placeholder:text-on-surface/50 outline-none transition focus:border-outline focus:ring-2 focus:ring-primary/50'

  const inputErrorClasses =
    'w-full rounded-lg border border-red-300 bg-white px-3 py-2.5 text-body text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100'

  const content = (
    <section
      className={
        embedded
          ? 'w-full h-full overflow-hidden bg-surface'
          : 'w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-black/5'
      }
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-surface/40 border border-outline-variant text-primary">
            <Database size={18} />
          </div>
          <div>
            <h3 className="text-heading text-on-surface">
              {editingId ? 'Edit Connection' : 'New Connection'}
            </h3>
            <p className="text-caption text-on-surface/70">Step {step} of 2</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="cursor-pointer rounded-lg p-1.5 text-on-surface/70 transition hover:bg-surface/40 hover:text-on-surface"
        >
          <X size={16} />
        </button>
      </header>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 px-6 pt-4">
        <div
          className={`flex items-center gap-1.5 text-label ${step >= 1 ? 'text-primary-container' : 'text-on-surface/70'}`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-micro ${step >= 1 ? 'bg-primary-container text-on-primary-container' : 'bg-surface-variant text-on-surface-variant'}`}
          >
            1
          </span>
          Database Type
        </div>
        <div
          className={`h-px flex-1 ${step >= 2 ? 'bg-primary-container' : 'bg-surface-variant'}`}
        />
        <div
          className={`flex items-center gap-1.5 text-label ${step >= 2 ? 'text-primary-container' : 'text-on-surface/70'}`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-micro ${step >= 2 ? 'bg-primary-container text-on-primary-container' : 'bg-surface-variant text-on-surface-variant'}`}
          >
            2
          </span>
          Connection Details
        </div>
      </div>

      {/* Step 1: Select Database Type */}
      {step === 1 && (
        <div className="px-6 py-5">
          <p className="mb-4 text-body text-on-surface/70">
            Choose the database you want to connect to.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {databaseTypeOptions.map((option) => {
              const active = option.value === newType
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleChangeType(option.value)}
                  className={[
                    'group flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all',
                    active
                      ? 'border-primary-container bg-primary-container/80 shadow-sm ring-1 ring-primary-container'
                      : 'border-surface-variant hover:border-surface-variant hover:bg-surface-variant',
                  ].join(' ')}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${
                      active
                        ? 'bg-blue-100/80 shadow-sm'
                        : 'bg-surface-variant/60 group-hover:bg-surface-container-low'
                    }`}
                  >
                    {(() => {
                      const Icon = option.Icon
                      return <Icon size={28} />
                    })()}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-subheading ${active ? 'text-on-primary-container' : 'text-on-surface/70'}`}
                    >
                      {option.label}
                    </span>
                    <span className="block text-caption text-on-surface/70">
                      {option.hint}
                    </span>
                  </span>
                  {active && (
                    <span className="ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary">
                      <Check
                        size={12}
                        className="text-on-primary"
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
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md border border-surface-variant bg-surface-variant">
              {selectedOption &&
                (() => {
                  const Icon = selectedOption.Icon
                  return <Icon size={16} />
                })()}
            </span>
            <span className="text-subheading text-on-surface">
              {selectedOption?.label}
            </span>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="ml-auto text-label text-primary-container hover:text-primary cursor-pointer hover:underline"
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
                className={fieldErrors.name ? inputErrorClasses : inputClasses}
              />
              {fieldErrors.name && (
                <p className="mt-1 flex items-center gap-1 text-caption text-red-500">
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
                    <p className="mt-1 flex items-center gap-1 text-caption text-red-500">
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
                    <p className="mt-1 flex items-center gap-1 text-caption text-red-500">
                      <AlertTriangle size={11} />
                      {fieldErrors.port}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Database — "File path" for SQLite with file picker */}
            <div>
              <div className="flex gap-2">
                <input
                  value={newInitialDatabase}
                  onChange={(e) => setNewInitialDatabase(e.target.value)}
                  placeholder={newType === 'sqlite' ? 'File path' : 'Database'}
                  className={
                    fieldErrors.database ? inputErrorClasses : inputClasses
                  }
                />
                {newType === 'sqlite' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const selected = await openDialog({
                        title: 'Select SQLite database file',
                        multiple: false,
                        directory: false,
                        filters: [
                          {
                            name: 'SQLite',
                            extensions: ['sqlite', 'db', 'sqlite3'],
                          },
                          { name: 'All files', extensions: ['*'] },
                        ],
                      })
                      if (typeof selected === 'string') {
                        setNewInitialDatabase(selected)
                      }
                    }}
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface-variant px-3 py-2.5 text-on-surface transition hover:bg-surface-container-low"
                    title="Browse for SQLite file"
                  >
                    <FolderOpen size={16} />
                  </button>
                )}
              </div>
              {fieldErrors.database && (
                <p className="mt-1 flex items-center gap-1 text-caption text-red-500">
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

            {/* Folder selector */}
            <div className="flex items-center gap-3">
              <select
                value={newFolderId ?? ''}
                onChange={(e) => setNewFolderId(e.target.value || null)}
                className={`${inputClasses} flex-1`}
                title="Folder"
              >
                <option value="">No folder (ungrouped)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

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
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${groupDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {groupDropdownOpen &&
                  (filteredGroups.length > 0 || isNewGroupValue) && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      {filteredGroups.map((group) => (
                        <button
                          key={group}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            setNewGroup(group)
                            setGroupDropdownOpen(false)
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-body transition hover:bg-blue-50 ${
                            group === newGroup
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-slate-700'
                          }`}
                        >
                          <span className="truncate">{group}</span>
                          {group === newGroup && (
                            <Check
                              size={12}
                              className="ml-auto shrink-0 text-blue-600"
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
                          className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-left text-body text-blue-600 transition hover:bg-blue-50"
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
              {isSqlType ? (
                <select
                  value={newSslMode}
                  onChange={(e) => setNewSslMode(e.target.value as SslMode)}
                  className={`${inputClasses} shrink-0 w-40`}
                  title="SSL Mode"
                >
                  <option value="disable">SSL: Disable</option>
                  <option value="prefer">SSL: Prefer</option>
                  <option value="require">SSL: Require</option>
                  <option value="verify-ca">SSL: Verify-CA</option>
                  <option value="verify-full">SSL: Verify-Full</option>
                </select>
              ) : (
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-body text-slate-600">
                  <span
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      newSsl ? 'bg-primary-container' : 'bg-outline-variant'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={newSsl}
                      onChange={(e) => setNewSsl(e.target.checked)}
                      className="sr-only"
                    />
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-on-surface shadow-sm transition-transform ${
                        newSsl ? 'translate-x-4.5' : 'translate-x-1'
                      }`}
                    />
                  </span>
                  SSL
                </label>
              )}
            </div>

            {/* Certificate file pickers — SQL types in verify-ca / verify-full (mTLS) */}
            {isSqlType && sslNeedsCerts && (
              <div className="space-y-2 rounded-lg border border-outline-variant bg-surface/40 px-3 py-2.5">
                <p className="text-caption text-on-surface/70">
                  Certificate paths (loaded by the backend at connect time)
                </p>
                <div className="flex gap-2">
                  <input
                    value={newCaCertPath}
                    onChange={(e) => setNewCaCertPath(e.target.value)}
                    placeholder="CA Certificate path"
                    className={`${inputClasses} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const selected = await openDialog({
                        title: 'Select CA certificate',
                        multiple: false,
                        directory: false,
                        filters: [
                          {
                            name: 'CA Certificate',
                            extensions: ['pem', 'crt', 'ca-bundle'],
                          },
                          { name: 'All files', extensions: ['*'] },
                        ],
                      })
                      if (typeof selected === 'string')
                        setNewCaCertPath(selected)
                    }}
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface-variant px-3 py-2.5 text-on-surface transition hover:bg-surface-container-low"
                    title="Browse for CA certificate"
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={newClientCertPath}
                    onChange={(e) => setNewClientCertPath(e.target.value)}
                    placeholder="Client Certificate path"
                    className={`${inputClasses} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const selected = await openDialog({
                        title: 'Select client certificate',
                        multiple: false,
                        directory: false,
                        filters: [
                          {
                            name: 'Client Certificate',
                            extensions: ['pem', 'crt'],
                          },
                          { name: 'All files', extensions: ['*'] },
                        ],
                      })
                      if (typeof selected === 'string')
                        setNewClientCertPath(selected)
                    }}
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface-variant px-3 py-2.5 text-on-surface transition hover:bg-surface-container-low"
                    title="Browse for client certificate"
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={newClientKeyPath}
                    onChange={(e) => setNewClientKeyPath(e.target.value)}
                    placeholder="Client Key path"
                    className={`${inputClasses} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const selected = await openDialog({
                        title: 'Select client key',
                        multiple: false,
                        directory: false,
                        filters: [
                          { name: 'Client Key', extensions: ['pem', 'key'] },
                          { name: 'All files', extensions: ['*'] },
                        ],
                      })
                      if (typeof selected === 'string')
                        setNewClientKeyPath(selected)
                    }}
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface-variant px-3 py-2.5 text-on-surface transition hover:bg-surface-container-low"
                    title="Browse for client key"
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* SSH Tunnel (optional, collapsible) */}
            {newType !== 'sqlite' && (
              <div className="rounded-lg border border-outline-variant">
                <button
                  type="button"
                  onClick={() => setSshExpanded((v) => !v)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-body text-on-surface/70 transition hover:bg-surface/40"
                >
                  <Shield size={15} className="shrink-0" />
                  <span className="flex-1 text-left">SSH Tunnel</span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${sshExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {sshExpanded && (
                  <div className="space-y-3 border-t border-outline-variant px-3 py-3">
                    <label className="flex items-center gap-2 text-body text-slate-600 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sshEnabled}
                        onChange={(e) => setSshEnabled(e.target.checked)}
                        className="accent-primary"
                      />
                      Connect via SSH tunnel
                    </label>
                    {sshEnabled && (
                      <>
                        <div className="flex gap-2">
                          <input
                            value={sshHost}
                            onChange={(e) => setSshHost(e.target.value)}
                            placeholder="SSH Host"
                            className={`${inputClasses} flex-1`}
                          />
                          <input
                            value={sshPort}
                            onChange={(e) => setSshPort(e.target.value)}
                            placeholder="Port"
                            className={`${inputClasses} w-24`}
                          />
                        </div>
                        <input
                          value={sshUser}
                          onChange={(e) => setSshUser(e.target.value)}
                          placeholder="SSH Username"
                          className={inputClasses}
                        />
                        <select
                          value={sshAuthMethod}
                          onChange={(e) =>
                            setSshAuthMethod(e.target.value as SshAuthMethod)
                          }
                          className={inputClasses}
                        >
                          <option value="password">Password</option>
                          <option value="privateKey">Private Key</option>
                          <option value="agent">SSH Agent</option>
                        </select>
                        {sshAuthMethod === 'privateKey' && (
                          <div className="flex gap-2">
                            <input
                              value={sshPrivateKeyPath}
                              onChange={(e) =>
                                setSshPrivateKeyPath(e.target.value)
                              }
                              placeholder="Private key path"
                              className={`${inputClasses} flex-1`}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const selected = await openDialog({
                                  title: 'Select SSH private key',
                                  multiple: false,
                                  directory: false,
                                })
                                if (typeof selected === 'string') {
                                  setSshPrivateKeyPath(selected)
                                }
                              }}
                              className="shrink-0 inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface-variant px-3 py-2.5 text-on-surface transition hover:bg-surface-container-low"
                              title="Browse for private key file"
                            >
                              <FolderOpen size={16} />
                            </button>
                          </div>
                        )}
                        {sshAuthMethod === 'password' && (
                          <input
                            type="password"
                            value={sshPassword}
                            onChange={(e) => setSshPassword(e.target.value)}
                            placeholder="SSH Password"
                            className={inputClasses}
                          />
                        )}
                        {sshAuthMethod === 'privateKey' && (
                          <input
                            type="password"
                            value={keyPassphrase}
                            onChange={(e) => setKeyPassphrase(e.target.value)}
                            placeholder="Key Passphrase"
                            className={inputClasses}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Advanced (pool config; postgresql + mysql only) */}
            {(newType === 'postgresql' || newType === 'mysql') && (
              <div className="rounded-lg border border-outline-variant">
                <button
                  type="button"
                  onClick={() => setAdvancedExpanded((v) => !v)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-body text-on-surface/70 transition hover:bg-surface/40"
                >
                  <Settings size={15} className="shrink-0" />
                  <span className="flex-1 text-left">Advanced</span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${advancedExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {advancedExpanded && (
                  <div className="space-y-3 border-t border-outline-variant px-3 py-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="mb-1 block text-label text-on-surface/70">
                          Pool Size
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={poolSize}
                          onChange={(e) => setPoolSize(e.target.value)}
                          placeholder="10"
                          className={inputClasses}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="mb-1 block text-label text-on-surface/70">
                          Idle Timeout (seconds)
                        </label>
                        <input
                          type="number"
                          min={30}
                          max={3600}
                          value={idleTimeoutSecs}
                          onChange={(e) => setIdleTimeoutSecs(e.target.value)}
                          placeholder="300"
                          className={inputClasses}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Test Connection */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConnection}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-outline-variant bg-primary px-4 py-2.5 text-subheading text-on-primary transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
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
                  className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-body ${
                    testConnectionResult.kind === 'success'
                      ? 'border-success/50 bg-success/20 text-success'
                      : 'border-error/50 bg-error/20 text-error'
                  }`}
                >
                  {testConnectionResult.kind === 'success' ? (
                    <Check size={14} className="mt-0.5 shrink-0" />
                  ) : (
                    <X size={14} className="mt-0.5 shrink-0" />
                  )}
                  <span>{testConnectionResult.message}</span>
                </div>
              )}
            </div>

            {/* Skip test override for new SQL/ES connections */}
            {needsTestGate && !isTestPassed && (
              <label className="flex items-center gap-2 text-label text-slate-500 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipTest}
                  onChange={(e) => setSkipTest(e.target.checked)}
                  className="accent-amber-500"
                />
                Skip test and save anyway (not recommended)
              </label>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="flex items-center justify-between border-t border-outline-variant px-6 py-4">
        <button
          type="button"
          onClick={() => setStep(1)}
          disabled={step === 1}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-2 text-subheading text-on-surface-variant transition hover:bg-outline-variant disabled:invisible"
        >
          <ChevronLeft size={15} />
          Back
        </button>

        {step === 1 ? (
          <button
            type="button"
            onClick={() => setStep(2)}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-primary-container px-5 py-2.5 text-label text-on-primary-container shadow-sm transition hover:bg-primary hover:text-on-primary active:bg-primary-dark active:text-on-primary"
          >
            Continue
            <ChevronRight size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-label text-white shadow-sm transition hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check size={15} />
            {editingId ? 'Update Connection' : 'Save Connection'}
          </button>
        )}
      </footer>
    </section>
  )

  if (embedded) {
    return content
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-shadow/30 p-4 backdrop-blur-sm">
      {content}
    </div>
  )
}
