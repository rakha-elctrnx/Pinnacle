import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { testConnection } from '../../../services/tauriClient'
import type { ConnectionProfile, ConnectionType } from '../../../types/domain'
import type { WizardStep, TestConnectionResult } from '../types'
import { databaseTypeOptions, defaultPortByType, defaultInitialDatabaseByType } from '../constants'
import { isSqlConnectionType } from '../utils'

interface ConnectionWizardModalProps {
  editingId: string | null
  existingProfile: ConnectionProfile | null
  onSave: (profile: ConnectionProfile) => void
  onClose: () => void
}

export function ConnectionWizardModal({
  editingId,
  existingProfile,
  onSave,
  onClose,
}: ConnectionWizardModalProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [newType, setNewType] = useState<ConnectionType>(existingProfile?.type ?? 'postgresql')
  const [newName, setNewName] = useState(existingProfile?.name ?? '')
  const [newHost, setNewHost] = useState(existingProfile?.host ?? 'localhost')
  const [newPort, setNewPort] = useState(String(existingProfile?.port ?? defaultPortByType.postgresql))
  const [newInitialDatabase, setNewInitialDatabase] = useState(
    existingProfile?.database ?? defaultInitialDatabaseByType.postgresql,
  )
  const [newUser, setNewUser] = useState(existingProfile?.username ?? '')
  const [newPassword, setNewPassword] = useState(existingProfile?.password ?? '')
  const [newSsl, setNewSsl] = useState(existingProfile?.ssl ?? false)
  const [newTags, setNewTags] = useState(existingProfile?.tags.join(', ') ?? 'Development')
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [testConnectionResult, setTestConnectionResult] = useState<TestConnectionResult | null>(null)

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
    setNewTags('Development')
    setIsTestingConnection(false)
    setTestConnectionResult(null)
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
  }

  const handleTestConnection = async () => {
    if (!newHost.trim() || !newPort.trim() || !newInitialDatabase.trim()) {
      setTestConnectionResult({
        kind: 'error',
        message: 'Please complete host, port, and database before testing.',
      })
      return
    }

    if (!isSqlConnectionType(newType)) {
      setTestConnectionResult({
        kind: 'success',
        message: 'Connector validated locally. Deep test is enabled for PostgreSQL/MySQL in this MVP.',
      })
      return
    }

    const parsedPort = Number(newPort)
    setIsTestingConnection(true)
    setTestConnectionResult(null)

    try {
      const result = await testConnection({
        type: newType,
        host: newHost.trim(),
        port: Number.isFinite(parsedPort) ? parsedPort : defaultPortByType[newType],
        username: newUser.trim(),
        password: newPassword,
        database: newInitialDatabase.trim() || defaultInitialDatabaseByType[newType],
        ssl: newSsl,
      })

      setTestConnectionResult({
        kind: result.ok ? 'success' : 'error',
        message: result.message,
      })
    } catch (error) {
      setTestConnectionResult({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Failed to test connection.',
      })
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleSave = () => {
    if (!newName.trim() || !newHost.trim() || !newPort.trim() || !newInitialDatabase.trim()) {
      return
    }

    const now = new Date().toISOString()
    const parsedPort = Number(newPort)
    const savedId = editingId ?? crypto.randomUUID()
    const tags = newTags
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    onSave({
      id: savedId,
      name: newName.trim(),
      type: newType,
      host: newHost.trim(),
      port: Number.isFinite(parsedPort) ? parsedPort : defaultPortByType[newType],
      username: newUser.trim(),
      password: newPassword,
      database: newInitialDatabase.trim() || defaultInitialDatabaseByType[newType],
      ssl: newSsl,
      encryptedPasswordRef:
        newPassword.length > 0
          ? 'stronghold://pending'
          : (existingProfile?.encryptedPasswordRef ?? 'stronghold://empty'),
      tags: tags.length > 0 ? tags : ['Ungrouped'],
      favorite: existingProfile?.favorite ?? false,
      createdAt: existingProfile?.createdAt ?? now,
      updatedAt: now,
    })

    handleClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <section className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {editingId ? 'Edit Connection' : 'Connection Wizard'}
            </h3>
            <p className="text-sm text-slate-500">
              Step {step} of 4: {['Select Type', 'Connection Info', 'Test Connection', 'Save Connection'][step - 1]}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X size={14} />
          </button>
        </header>

        {step === 1 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {databaseTypeOptions.map((option) => {
              const active = option.value === newType
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleChangeType(option.value)}
                  className={[
                    'rounded-xl border px-3 py-3 text-left transition',
                    active ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className="flex items-start gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white">
                      <img src={option.logoSrc} alt={option.label} className="h-4 w-4 object-contain" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                      <span className="block text-xs text-slate-500">{option.hint}</span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Name"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={newHost}
                onChange={(event) => setNewHost(event.target.value)}
                placeholder="Host"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={newPort}
                onChange={(event) => setNewPort(event.target.value)}
                placeholder="Port"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={newInitialDatabase}
                onChange={(event) => setNewInitialDatabase(event.target.value)}
                placeholder="Database"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={newUser}
                onChange={(event) => setNewUser(event.target.value)}
                placeholder="Username"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Password"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={newTags}
                onChange={(event) => setNewTags(event.target.value)}
                placeholder="Tags (comma separated)"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={newSsl}
                  onChange={(event) => setNewSsl(event.target.checked)}
                />
                SSL Enabled
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Run connection test before saving this profile.</p>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTestingConnection}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
            >
              {isTestingConnection ? 'Testing...' : 'Test Connection'}
            </button>
            {testConnectionResult && (
              <p
                className={[
                  'rounded-lg border px-3 py-2 text-sm',
                  testConnectionResult.kind === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700',
                ].join(' ')}
              >
                {testConnectionResult.kind === 'success' ? (
                  <Check size={14} className="mr-1 inline" />
                ) : null}
                {testConnectionResult.message}
              </p>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p>
              <span className="font-semibold">Type:</span> {newType}
            </p>
            <p>
              <span className="font-semibold">Name:</span> {newName || '-'}
            </p>
            <p>
              <span className="font-semibold">Host:</span> {newHost}:{newPort}
            </p>
            <p>
              <span className="font-semibold">Database:</span> {newInitialDatabase}
            </p>
            <p>
              <span className="font-semibold">Username:</span> {newUser || '-'}
            </p>
            <p>
              <span className="font-semibold">SSL:</span> {newSsl ? 'Enabled' : 'Disabled'}
            </p>
            <p>
              <span className="font-semibold">Tags:</span> {newTags || '-'}
            </p>
          </div>
        )}

        <footer className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s))}
            disabled={step === 1}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Back
          </button>

          <div className="flex gap-2">
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s < 4 ? ((s + 1) as WizardStep) : s))}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Save Connection
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}