import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  FolderOpen,
  Loader2,
  Plug,
  Plus,
  Settings,
  Shield,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  workspace?: string
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
  const [detailTab, setDetailTab] = useState<'general' | 'advanced'>('general')
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
  const [newWorkspace, setNewWorkspace] = useState(() => {
    if (existingProfile?.folderId) {
      const f = folders.find((folder) => folder.id === existingProfile.folderId)
      if (f) return f.name
    }
    return existingProfile?.tags[0] ?? ''
  })
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
  const [statementTimeoutSecs, setStatementTimeoutSecs] = useState(
    existingProfile?.statementTimeoutMs
      ? (existingProfile.statementTimeoutMs / 1000).toString()
      : '',
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
  // Workspaces list combining existing folders and tags
  const existingWorkspaces = useMemo(() => {
    const folderNames = folders.map((f) => f.name)
    return [...new Set([...folderNames, ...existingGroups])].filter(Boolean)
  }, [folders, existingGroups])

  const filteredWorkspaces = useMemo(() => {
    const query = newWorkspace.trim().toLowerCase()
    if (!query) return existingWorkspaces
    return existingWorkspaces.filter((w) => w.toLowerCase().includes(query))
  }, [existingWorkspaces, newWorkspace])

  const isNewWorkspaceValue =
    newWorkspace.trim() !== '' &&
    !existingWorkspaces.some(
      (w) => w.toLowerCase() === newWorkspace.trim().toLowerCase(),
    )
  // Inline validation for step 2 fields.
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
      if (newWorkspace.trim() === '') {
        errors.workspace = 'Workspace is required'
      }
    }
    return errors
  }, [step, newType, newHost, newPort, newInitialDatabase, newWorkspace])

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
    setDetailTab('general')
    setNewType('postgresql')
    setNewName('')
    setNewHost('localhost')
    setNewPort(String(defaultPortByType.postgresql))
    setNewInitialDatabase(defaultInitialDatabaseByType.postgresql)
    setNewUser('')
    setNewPassword('')
    setNewSsl(false)
    setNewSslMode('prefer')
    setNewWorkspace('')
    setNewClientKeyPath('')
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
    setStatementTimeoutSecs('')
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
        statementTimeoutMs: statementTimeoutSecs
          ? Number(statementTimeoutSecs) * 1000
          : undefined,
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
      else if (newType === 'mongodb') {
        const { mongoTestConnection } = await import(
          '../../../mongodb/clients/mongodb'
        )
        const result = await mongoTestConnection(payload)
        setTestConnectionResult({
          kind: result.ok ? 'success' : 'error',
          message: result.message,
        })
      }
      // ELSE IF NOT IMPLEMENTED, SHOW GENERIC SUCCESS
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
    const workspaceName = newWorkspace.trim()
    const matchedFolder = folders.find(
      (f) => f.name.toLowerCase() === workspaceName.toLowerCase(),
    )
    const folderId = matchedFolder ? matchedFolder.id : null
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
        statementTimeoutMs: statementTimeoutSecs
          ? Number(statementTimeoutSecs) * 1000
          : undefined,
        passwordRef: newPassword.length > 0 ? `keyring://${savedId}` : '',
        tags: workspaceName ? [workspaceName] : [],
        folderId,
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
    'w-full rounded-lg border border-border-default bg-bg-base px-3 py-2 text-body text-text-primary placeholder:text-text-muted outline-none transition focus:border-border-focus focus:ring-2 focus:ring-focus-ring'

  const inputErrorClasses =
    'w-full rounded-lg border border-border-danger bg-bg-base px-3 py-2 text-body text-text-primary placeholder:text-text-muted outline-none transition focus:border-border-danger focus:ring-2 focus:ring-danger-ring'

  const content = (
    <section
      className={
        embedded
          ? 'flex flex-col w-full h-full overflow-hidden bg-bg-base text-text-primary'
          : 'flex flex-col w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-bg-base border border-border-default text-text-primary shadow-2xl ring-1 ring-black/5'
      }
    >
      {/* Header */}
      <header data-tauri-drag-region className="flex shrink-0 items-center justify-between border-b border-border-default px-5 py-3.5">
        <div data-tauri-drag-region className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-bg-subtle border border-border-default text-primary">
            <Database size={16} />
          </div>
          <div>
            <h3 className="text-subheading font-semibold text-text-primary">
              {editingId ? 'Edit Connection' : 'New Connection'}
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="cursor-pointer rounded-lg p-1 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={16} />
        </button>
      </header>
      {/* Step 1: Select Database Type */}
      {step === 1 && (
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
          <p className="mb-3 text-caption text-text-muted">
            Choose the database you want to connect to.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {databaseTypeOptions.map((option) => {
              const active = option.value === newType
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleChangeType(option.value)}
                  className={[
                    'group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer',
                    active
                      ? 'border-border-focus bg-primary-subtle shadow-xs ring-1 ring-border-focus'
                      : 'border-border-default bg-bg-base hover:border-border-strong hover:bg-bg-subtle',
                  ].join(' ')}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
                      active
                        ? 'bg-primary/10 text-primary shadow-xs'
                        : 'bg-bg-subtle text-text-secondary group-hover:bg-bg-muted'
                    }`}
                  >
                    {(() => {
                      const Icon = option.Icon
                      return <Icon size={22} />
                    })()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-label font-medium ${active ? 'text-primary font-semibold' : 'text-text-primary'}`}
                    >
                      {option.label}
                    </span>
                    <span className="block text-micro text-text-muted truncate">
                      {option.hint}
                    </span>
                  </span>
                  {active && (
                    <span className="ml-auto grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-primary">
                      <Check
                        size={11}
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
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
          {/* Contextual selected type row */}
          <div className="mb-3 flex items-center justify-between rounded-lg border border-border-default bg-bg-subtle px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded bg-bg-base border border-border-default text-primary">
                {selectedOption &&
                  (() => {
                    const Icon = selectedOption.Icon
                    return <Icon size={14} />
                  })()}
              </span>
              <span className="text-label font-medium text-text-primary">
                {selectedOption?.label}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-caption text-primary hover:underline cursor-pointer font-medium"
            >
              Change
            </button>
          </div>
          {/* Navigation Tabs (General vs Advance) */}
          <div className="mb-3 flex border-b border-border-default">
            <button
              type="button"
              onClick={() => setDetailTab('general')}
              className={`pb-2 px-3 text-label font-medium border-b-2 transition-colors cursor-pointer ${
                detailTab === 'general'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setDetailTab('advanced')}
              className={`pb-2 px-3 text-label font-medium border-b-2 transition-colors cursor-pointer ${
                detailTab === 'advanced'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              Advanced
            </button>
          </div>
          <div className="space-y-3">
            {detailTab === 'general' ? (
              <>
                {/* Name */}
                <div>
                  <label className="mb-1 block text-caption text-text-secondary font-medium">
                    Connection Name <span className="text-danger">*</span>
                  </label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className={fieldErrors.name ? inputErrorClasses : inputClasses}
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
                      <label className="mb-1 block text-caption text-text-secondary font-medium">
                        Host <span className="text-danger">*</span>
                      </label>
                      <input
                        value={newHost}
                        onChange={(e) => setNewHost(e.target.value)}
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
                      <label className="mb-1 block text-caption text-text-secondary font-medium">
                        Port <span className="text-danger">*</span>
                      </label>
                      <input
                        value={newPort}
                        onChange={(e) => setNewPort(e.target.value)}
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

                {/* Database — "File Path" for SQLite with file picker */}
                <div>
                  <label className="mb-1 block text-caption text-text-secondary font-medium">
                    {newType === 'sqlite' ? 'File Path' : 'Database'}{' '}
                    <span className="text-danger">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={newInitialDatabase}
                      onChange={(e) => setNewInitialDatabase(e.target.value)}
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
                        className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-subtle px-3 py-2 text-text-primary transition hover:bg-bg-hover cursor-pointer"
                        title="Browse for SQLite file"
                      >
                        <FolderOpen size={16} />
                      </button>
                    )}
                  </div>
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
                    <div className="flex-1">
                      <label className="mb-1 block text-caption text-text-secondary font-medium">
                        Username
                      </label>
                      <input
                        value={newUser}
                        onChange={(e) => setNewUser(e.target.value)}
                        className={inputClasses}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-caption text-text-secondary font-medium">
                        Password
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className={inputClasses}
                      />
                    </div>
                  </div>
                )}

                {/* Workspace section (Single select/tag style) */}
                <div>
                  <label className="mb-1 block text-caption text-text-secondary font-medium">
                    Workspace <span className="text-danger">*</span>
                  </label>
                  <div className="relative" ref={groupDropdownRef}>
                    <input
                      ref={groupInputRef}
                      value={newWorkspace}
                      onChange={(e) => {
                        setNewWorkspace(e.target.value)
                        setGroupDropdownOpen(true)
                      }}
                      onFocus={() => setGroupDropdownOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setGroupDropdownOpen(false)
                        }
                      }}
                      className={
                        fieldErrors.workspace
                          ? `${inputErrorClasses} pr-8`
                          : `${inputClasses} pr-8`
                      }
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setGroupDropdownOpen((prev) => !prev)
                        if (!groupDropdownOpen) groupInputRef.current?.focus()
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary cursor-pointer"
                    >
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${groupDropdownOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {groupDropdownOpen &&
                      (filteredWorkspaces.length > 0 || isNewWorkspaceValue) && (
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-auto rounded-lg border border-border-default bg-bg-base py-1 shadow-lg backdrop-blur-sm">
                          {filteredWorkspaces.map((ws) => (
                            <button
                              key={ws}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault()
                                setNewWorkspace(ws)
                                setGroupDropdownOpen(false)
                              }}
                              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-body transition hover:bg-bg-hover ${
                                ws === newWorkspace
                                  ? 'bg-primary-subtle text-primary font-medium'
                                  : 'text-text-primary'
                              }`}
                            >
                              <span className="truncate">{ws}</span>
                              {ws === newWorkspace && (
                                <Check
                                  size={12}
                                  className="ml-auto shrink-0 text-primary"
                                />
                              )}
                            </button>
                          ))}
                          {isNewWorkspaceValue && (
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault()
                                setGroupDropdownOpen(false)
                              }}
                              className="flex w-full items-center gap-2 border-t border-border-default px-3 py-1.5 text-left text-body text-primary transition hover:bg-primary-subtle"
                            >
                              <Plus size={12} className="shrink-0" />
                              <span className="truncate">
                                Create "{newWorkspace.trim()}"
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                  </div>
                  {fieldErrors.workspace && (
                    <p className="mt-1 flex items-center gap-1 text-caption text-danger">
                      <AlertTriangle size={11} />
                      {fieldErrors.workspace}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>

            {/* SSL Mode */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <label className="text-caption text-text-secondary font-medium">
                Security & Encryption
              </label>
              {isSqlType ? (
                <select
                  value={newSslMode}
                  onChange={(e) => setNewSslMode(e.target.value as SslMode)}
                  className={`${inputClasses} w-auto`}
                  title="SSL Mode"
                >
                  <option value="disable">SSL: Disable</option>
                  <option value="prefer">SSL: Prefer</option>
                  <option value="require">SSL: Require</option>
                  <option value="verify-ca">SSL: Verify-CA</option>
                  <option value="verify-full">SSL: Verify-Full</option>
                </select>
              ) : (
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-caption text-text-secondary select-none">
                  <span
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      newSsl ? 'bg-primary' : 'bg-bg-muted border border-border-default'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={newSsl}
                      onChange={(e) => setNewSsl(e.target.checked)}
                      className="sr-only"
                    />
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-text-inverse shadow-xs transition-transform ${
                        newSsl ? 'translate-x-4.5' : 'translate-x-1'
                      }`}
                    />
                  </span>
                  SSL Encryption
                </label>
              )}
            </div>

            {/* Certificate file pickers — SQL types in verify-ca / verify-full (mTLS) */}
            {isSqlType && sslNeedsCerts && (
              <div className="space-y-2 rounded-lg border border-border-default bg-bg-subtle px-3 py-2.5">
                <p className="text-caption text-text-muted">
                  Certificate paths (loaded by the backend at connect time)
                </p>
                <div className="flex gap-2">
                  <input
                    value={newCaCertPath}
                    onChange={(e) => setNewCaCertPath(e.target.value)}
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
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-base px-3 py-2 text-text-primary transition hover:bg-bg-hover cursor-pointer"
                    title="Browse for CA certificate"
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={newClientCertPath}
                    onChange={(e) => setNewClientCertPath(e.target.value)}
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
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-base px-3 py-2 text-text-primary transition hover:bg-bg-hover cursor-pointer"
                    title="Browse for client certificate"
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={newClientKeyPath}
                    onChange={(e) => setNewClientKeyPath(e.target.value)}
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
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-base px-3 py-2 text-text-primary transition hover:bg-bg-hover cursor-pointer"
                    title="Browse for client key"
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* SSH Tunnel (optional, collapsible) */}
            {newType !== 'sqlite' && (
              <div className="rounded-lg border border-border-default bg-bg-base">
                <button
                  type="button"
                  onClick={() => setSshExpanded((v) => !v)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-caption font-medium text-text-secondary transition hover:bg-bg-subtle cursor-pointer"
                >
                  <Shield size={14} className="shrink-0 text-text-muted" />
                  <span className="flex-1 text-left">SSH Tunnel</span>
                  {sshEnabled && (
                    <span className="rounded bg-primary-subtle px-1.5 py-0.5 text-micro text-primary font-medium">
                      Enabled
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    className={`text-text-muted transition-transform ${sshExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {sshExpanded && (
                  <div className="space-y-2.5 border-t border-border-default px-3 py-2.5 bg-bg-subtle/50">
                    <label className="flex items-center gap-2 text-caption text-text-secondary select-none cursor-pointer">
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
                          <div className="flex-1">
                            <label className="mb-1 block text-caption text-text-muted">
                              SSH Host
                            </label>
                            <input
                              value={sshHost}
                              onChange={(e) => setSshHost(e.target.value)}
                              className={inputClasses}
                            />
                          </div>
                          <div className="w-20">
                            <label className="mb-1 block text-caption text-text-muted">
                              Port
                            </label>
                            <input
                              value={sshPort}
                              onChange={(e) => setSshPort(e.target.value)}
                              className={inputClasses}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-caption text-text-muted">
                            SSH Username
                          </label>
                          <input
                            value={sshUser}
                            onChange={(e) => setSshUser(e.target.value)}
                            className={inputClasses}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-caption text-text-muted">
                            Authentication Method
                          </label>
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
                        </div>
                        {sshAuthMethod === 'privateKey' && (
                          <div>
                            <label className="mb-1 block text-caption text-text-muted">
                              Private Key Path
                            </label>
                            <div className="flex gap-2">
                              <input
                                value={sshPrivateKeyPath}
                                onChange={(e) =>
                                  setSshPrivateKeyPath(e.target.value)
                                }
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
                                className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-base px-3 py-2 text-text-primary transition hover:bg-bg-hover cursor-pointer"
                                title="Browse for private key file"
                              >
                                <FolderOpen size={16} />
                              </button>
                            </div>
                          </div>
                        )}
                        {sshAuthMethod === 'password' && (
                          <div>
                            <label className="mb-1 block text-caption text-text-muted">
                              SSH Password
                            </label>
                            <input
                              type="password"
                              value={sshPassword}
                              onChange={(e) => setSshPassword(e.target.value)}
                              className={inputClasses}
                            />
                          </div>
                        )}
                        {sshAuthMethod === 'privateKey' && (
                          <div>
                            <label className="mb-1 block text-caption text-text-muted">
                              Key Passphrase (optional)
                            </label>
                            <input
                              type="password"
                              value={keyPassphrase}
                              onChange={(e) => setKeyPassphrase(e.target.value)}
                              className={inputClasses}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Advanced (pool config; postgresql + mysql only) */}
            {(newType === 'postgresql' || newType === 'mysql') && (
              <div className="rounded-lg border border-border-default bg-bg-base">
                <button
                  type="button"
                  onClick={() => setAdvancedExpanded((v) => !v)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-caption font-medium text-text-secondary transition hover:bg-bg-subtle cursor-pointer"
                >
                  <Settings size={14} className="shrink-0 text-text-muted" />
                  <span className="flex-1 text-left">Advanced Settings</span>
                  <ChevronDown
                    size={14}
                    className={`text-text-muted transition-transform ${advancedExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {advancedExpanded && (
                  <div className="space-y-2.5 border-t border-border-default px-3 py-2.5 bg-bg-subtle/50">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="mb-1 block text-caption text-text-muted">
                          Pool Size
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={poolSize}
                          onChange={(e) => setPoolSize(e.target.value)}
                          className={inputClasses}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="mb-1 block text-caption text-text-muted">
                          Statement Timeout (s)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={statementTimeoutSecs}
                          onChange={(e) => setStatementTimeoutSecs(e.target.value)}
                          className={inputClasses}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="mb-1 block text-caption text-text-muted">
                          Idle Timeout (s)
                        </label>
                        <input
                          type="number"
                          min={30}
                          max={3600}
                          value={idleTimeoutSecs}
                          onChange={(e) => setIdleTimeoutSecs(e.target.value)}
                          className={inputClasses}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
              </>
            )}

            {/* Test connection result banner */}
            {testConnectionResult && (
              <div
                className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-caption ${
                  testConnectionResult.kind === 'success'
                    ? 'border-border-success bg-success-subtle text-success-text'
                    : 'border-border-danger bg-danger-subtle text-danger'
                }`}
              >
                {testConnectionResult.kind === 'success' ? (
                  <Check size={14} className="mt-0.5 shrink-0 text-success-text" />
                ) : (
                  <X size={14} className="mt-0.5 shrink-0 text-danger" />
                )}
                <span>{testConnectionResult.message}</span>
              </div>
            )}

            {/* Skip test override for new SQL/ES connections */}
            {needsTestGate && !isTestPassed && (
              <label className="flex items-center gap-2 text-caption text-text-muted select-none cursor-pointer">
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

      {/* Footer */}
      <footer className="flex shrink-0 items-center justify-between border-t border-border-default px-5 py-3 bg-bg-base">
        <button
          type="button"
          onClick={() => setStep(1)}
          disabled={step === 1}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-label font-medium text-text-secondary transition hover:bg-bg-hover hover:text-text-primary disabled:invisible"
        >
          <ChevronLeft size={14} />
          Back
        </button>

        {step === 1 ? (
          <button
            type="button"
            onClick={() => setStep(2)}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-label font-medium text-text-inverse shadow-xs transition hover:bg-primary-hover active:bg-primary-hover"
          >
            Continue
            <ChevronRight size={14} />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTestingConnection}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-subtle px-3 py-2 text-label font-medium text-text-primary transition hover:bg-bg-hover hover:border-border-strong cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTestingConnection ? (
                <>
                  <Loader2 size={14} className="animate-spin text-primary" />
                  Testing…
                </>
              ) : (
                <>
                  <Plug size={14} className="text-text-muted" />
                  Test Connection
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || !newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-label font-semibold text-text-inverse shadow-xs transition hover:bg-primary-hover active:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check size={14} />
              {editingId ? 'Update' : 'Save'}
            </button>
          </div>
        )}
      </footer>
    </section>
  )

  if (embedded) {
    return content
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        data-tauri-drag-region
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg">
        {content}
      </div>
    </div>
  )
}
