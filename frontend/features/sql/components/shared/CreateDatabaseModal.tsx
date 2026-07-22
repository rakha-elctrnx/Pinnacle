import { AlertTriangle, Check, Database, Loader2, X, ChevronDown, ChevronRight } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useDataExplorerContext } from '../../../_shared/context/DataExplorerContext'
import { useConnectionStore } from '../../../_shared/store/connectionStore'
import { getConnPayloadWithPassword } from '../../../_shared/utils'
import { executeSql } from '../../clients/sql'
import type { CreateDatabaseTarget } from '../../../_shared/types/shared'

type ModalPhase = 'confirm' | 'loading' | 'success' | 'error'

interface CreateDatabaseModalProps {
  target: CreateDatabaseTarget
  onClose: () => void
}

const inputClasses =
  'w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-body text-on-surface placeholder:text-on-surface/50 outline-none transition focus:border-outline focus:ring-2 focus:ring-primary/50'

interface SelectOption {
  value: string
  label: string
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
}
function CustomSelect({ value, onChange, options, placeholder }: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const inputValue = isSearching ? search : (selected?.label ?? '')

  return (
    <div ref={ref} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => {
          setIsSearching(true)
          setSearch(e.target.value)
          setOpen(true)
          if (e.target.value === '') {
            onChange('')
          }
        }}
        onFocus={() => {
          setIsSearching(true)
          setSearch('')
          setOpen(true)
        }}
        onBlur={() => {
          setIsSearching(false)
          setSearch('')
        }}
        placeholder={placeholder ?? 'Search...'}
        className={`${inputClasses} ${!value ? 'text-text-muted' : ''}`}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border-default bg-bg-base shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-body text-text-muted">No options</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(opt.value)
                  setIsSearching(false)
                  setSearch('')
                  setOpen(false)
                  inputRef.current?.blur()
                }}
                className={`w-full px-3 py-2 text-left text-body transition hover:bg-bg-subtle ${
                  opt.value === value ? 'bg-primary-subtle text-primary' : 'text-on-surface'
                }`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function CreateDatabaseModal({
  target,
  onClose,
}: CreateDatabaseModalProps) {
  const explorerData = useDataExplorerContext()
  const [phase, setPhase] = useState<ModalPhase>('confirm')
  const [dbName, setDbName] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Postgres options
  const [owner, setOwner] = useState('')
  const [template, setTemplate] = useState('')
  const [encoding, setEncoding] = useState('')
  const [ownerRoles, setOwnerRoles] = useState<SelectOption[]>([])
  const [templateOptions, setTemplateOptions] = useState<SelectOption[]>([])
  const [encodingOptions, setEncodingOptions] = useState<SelectOption[]>([])

  // MySQL options
  const [characterSet, setCharacterSet] = useState('')
  const [collation, setCollation] = useState('')

  const isPostgres = target.connectionType === 'postgresql'
  const isValid = /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(dbName.trim()) && phase === 'confirm'

  // Fetch available PG options (roles, templates, encodings)
  useEffect(() => {
    if (!isPostgres) return
    const conn = useConnectionStore.getState().items.find(
      (c) => c.id === target.connectionId,
    )
    if (!conn) return
    ;(async () => {
      try {
        const payload = await getConnPayloadWithPassword(conn)
        const [rolesRes, templatesRes, encodingsRes] = await Promise.all([
          executeSql({ connection: payload, sql: 'SELECT rolname FROM pg_roles ORDER BY rolname' }),
          executeSql({ connection: payload, sql: "SELECT datname FROM pg_database WHERE datistemplate = true ORDER BY datname" }),
          executeSql({ connection: payload, sql: "SELECT DISTINCT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE encoding IS NOT NULL AND pg_encoding_to_char(encoding) IS NOT NULL ORDER BY enc" }),
        ])
        if (rolesRes.rows?.length) {
          const roles = rolesRes.rows.map((r: Record<string, unknown>) => ({
            value: String(r.rolname ?? ''),
            label: String(r.rolname ?? ''),
          }))
          setOwnerRoles([{ value: '', label: 'Default' }, ...roles])
        }
        if (templatesRes.rows?.length) {
          const tpls = templatesRes.rows.map((r: Record<string, unknown>) => ({
            value: String(r.datname ?? ''),
            label: String(r.datname ?? ''),
          }))
          setTemplateOptions([{ value: '', label: 'Default (template1)' }, ...tpls])
        }
        const knownEncodings = [
          'UTF8', 'LATIN1', 'LATIN9', 'WIN1252', 'WIN1251',
          'SQL_ASCII', 'EUC_JP', 'EUC_KR', 'UNICODE', 'MULE_INTERNAL',
        ]
        const fetched = encodingsRes.rows?.length
          ? encodingsRes.rows.map((r: Record<string, unknown>) => String(r.enc ?? ''))
          : []
        const merged = [...new Set([...fetched, ...knownEncodings])]
          .filter(Boolean)
          .map((v) => ({ value: v, label: v }))
        setEncodingOptions([{ value: '', label: 'Default (UTF8)' }, ...merged])
      } catch {
        // silently fail — static fallbacks used
      }
    })()
  }, [isPostgres, target.connectionId])

  const handleSubmit = async () => {
    if (!isValid) return

    setPhase('loading')
    setErrorMessage(null)

    try {
      const conn = useConnectionStore.getState().items.find(
        (c) => c.id === target.connectionId,
      )
      if (!conn) {
        throw new Error('Connection profile not found.')
      }

      const basePayload = await getConnPayloadWithPassword(conn)
      let sql = ''

      if (isPostgres) {
        const name = dbName.trim().replace(/"/g, '""')
        sql = `CREATE DATABASE "${name}"`
        if (owner.trim()) {
          sql += ` OWNER "${owner.trim().replace(/"/g, '""')}"`
        }
        if (template.trim()) {
          sql += ` TEMPLATE "${template.trim().replace(/"/g, '""')}"`
        }
        if (encoding.trim()) {
          sql += ` ENCODING '${encoding.trim().replace(/'/g, "''")}'`
        }
        sql += ';'
      } else {
        const name = dbName.trim().replace(/\\/g, '\\\\').replace(/`/g, '\\`')
        sql = `CREATE DATABASE \`${name}\``
        if (characterSet.trim()) {
          sql += ` CHARACTER SET ${characterSet.trim()}`
        }
        if (collation.trim()) {
          sql += ` COLLATE ${collation.trim()}`
        }
        sql += ';'
      }

      await executeSql({ connection: basePayload, sql })
      await explorerData.explorerData.refreshConnectionData(
        target.connectionId,
        conn,
      )
      setPhase('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={phase !== 'loading' ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border-default bg-bg-base shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-subtle">
              <Database size={16} className="text-primary" />
            </span>
            <h2 className="text-subheading">Create Database</h2>
          </div>
          {phase !== 'loading' && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-subtle hover:text-text-secondary"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {phase === 'confirm' && (
            <>
              {/* Connection identity card */}
              <div className="rounded-lg border border-border-default bg-bg-subtle p-3">
                <p className="mb-2 text-label">Connection</p>
                <div className="flex items-center gap-2 text-body">
                  <Database size={13} className="shrink-0 text-text-muted" />
                  <span className="text-body-secondary">Connection:</span>
                  <span className="text-body">{target.connectionName}</span>
                </div>
              </div>

              {/* Database name */}
              <div>
                <label className="mb-1.5 block text-label text-text-secondary">
                  Database Name
                </label>
                <input
                  type="text"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  placeholder="e.g. my_database"
                  className={inputClasses}
                  autoFocus
                />
                {dbName.trim() && !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(dbName.trim()) && (
                  <p className="mt-1 flex items-center gap-1 text-caption text-danger">
                    <AlertTriangle size={12} />
                    Name must start with a letter or underscore and contain only
                    letters, numbers, underscores, or hyphens.
                  </p>
                )}
              </div>

              {/* Advanced Options */}
              <div className="rounded-lg border border-border-default bg-bg-base">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex w-full items-center gap-1 px-3.5 py-3 text-label text-text-secondary transition-colors hover:bg-bg-subtle"
                >
                  {showAdvanced ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  Advanced Options
                </button>

                {showAdvanced && (
                  <div className="space-y-3 border-t border-border-default px-3.5 py-3">
                    {isPostgres ? (
                      <>
                        <div>
                          <label className="mb-1.5 block text-label text-text-secondary">
                            Owner
                          </label>
                          <CustomSelect
                            value={owner}
                            onChange={setOwner}
                            options={ownerRoles.length > 1 ? ownerRoles : [
                              { value: '', label: 'Default' },
                              { value: 'postgres', label: 'postgres' },
                            ]}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-label text-text-secondary">
                            Template
                          </label>
                          <CustomSelect
                            value={template}
                            onChange={setTemplate}
                            options={templateOptions.length > 0 ? templateOptions : [
                              { value: '', label: 'Default (template1)' },
                              { value: 'template0', label: 'template0' },
                              { value: 'template1', label: 'template1' },
                            ]}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-label text-text-secondary">
                            Encoding
                          </label>
                          <CustomSelect
                            value={encoding}
                            onChange={setEncoding}
                            options={encodingOptions.length > 0 ? encodingOptions : [
                              { value: '', label: 'Default (UTF8)' },
                              { value: 'UTF8', label: 'UTF8' },
                              { value: 'LATIN1', label: 'LATIN1' },
                              { value: 'LATIN9', label: 'LATIN9' },
                              { value: 'WIN1252', label: 'WIN1252' },
                              { value: 'WIN1251', label: 'WIN1251' },
                              { value: 'SQL_ASCII', label: 'SQL_ASCII' },
                              { value: 'EUC_JP', label: 'EUC_JP' },
                              { value: 'EUC_KR', label: 'EUC_KR' },
                              { value: 'UNICODE', label: 'UNICODE' },
                              { value: 'MULE_INTERNAL', label: 'MULE_INTERNAL' },
                            ]}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="mb-1.5 block text-label text-text-secondary">
                            Character Set
                          </label>
                          <CustomSelect
                            value={characterSet}
                            onChange={setCharacterSet}
                            options={[
                              { value: '', label: 'Default (utf8mb4)' },
                              { value: 'utf8mb4', label: 'utf8mb4' },
                              { value: 'utf8', label: 'utf8' },
                              { value: 'latin1', label: 'latin1' },
                              { value: 'latin2', label: 'latin2' },
                              { value: 'ascii', label: 'ascii' },
                              { value: 'ucs2', label: 'ucs2' },
                              { value: 'utf16', label: 'utf16' },
                              { value: 'utf32', label: 'utf32' },
                              { value: 'big5', label: 'big5' },
                              { value: 'gbk', label: 'gbk' },
                              { value: 'eucjp', label: 'eucjp' },
                              { value: 'euckr', label: 'euckr' },
                              { value: 'gb18030', label: 'gb18030' },
                            ]}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-label text-text-secondary">
                            Collation
                          </label>
                          <CustomSelect
                            value={collation}
                            onChange={setCollation}
                            options={[
                              { value: '', label: 'Default (utf8mb4_0900_ai_ci)' },
                              { value: 'utf8mb4_unicode_ci', label: 'utf8mb4_unicode_ci' },
                              { value: 'utf8mb4_general_ci', label: 'utf8mb4_general_ci' },
                              { value: 'utf8mb4_0900_ai_ci', label: 'utf8mb4_0900_ai_ci' },
                              { value: 'utf8_general_ci', label: 'utf8_general_ci' },
                              { value: 'utf8_unicode_ci', label: 'utf8_unicode_ci' },
                              { value: 'latin1_swedish_ci', label: 'latin1_swedish_ci' },
                              { value: 'latin1_general_ci', label: 'latin1_general_ci' },
                              { value: 'ascii_general_ci', label: 'ascii_general_ci' },
                              { value: 'big5_chinese_ci', label: 'big5_chinese_ci' },
                              { value: 'gbk_chinese_ci', label: 'gbk_chinese_ci' },
                              { value: 'utf16_unicode_ci', label: 'utf16_unicode_ci' },
                              { value: 'utf32_unicode_ci', label: 'utf32_unicode_ci' },
                            ]}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-body-secondary">
                Creating database <span className="text-mono">{dbName.trim()}</span>
                ...
              </p>
            </div>
          )}

          {phase === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-subtle">
                <Check size={20} className="text-success" />
              </span>
              <div className="text-center">
                <p className="text-subheading">Database created successfully</p>
                <p className="mt-1 text-body-secondary">
                  <span className="text-mono">{dbName.trim()}</span> has been
                  created on {target.connectionName}.
                </p>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-subtle">
                <X size={20} className="text-danger" />
              </span>
              <div className="text-center">
                <p className="text-subheading">Failed to create database</p>
                <p className="mt-1 max-w-sm text-caption text-danger">
                  {errorMessage}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border-default px-5 py-3">
          {phase === 'confirm' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border-default px-3.5 py-1.5 text-label text-text-secondary transition-colors hover:bg-bg-subtle"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!isValid}
                className="rounded-lg bg-primary px-3.5 py-1.5 text-label text-text-inverse transition-colors hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Database
              </button>
            </>
          )}

          {phase === 'success' && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-bg-muted px-3.5 py-1.5 text-label text-text-inverse transition-colors hover:bg-border-strong"
            >
              Done
            </button>
          )}

          {phase === 'error' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border-default px-3.5 py-1.5 text-label text-text-secondary transition-colors hover:bg-bg-subtle"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase('confirm')
                  setErrorMessage(null)
                }}
                className="rounded-lg bg-primary px-3.5 py-1.5 text-label text-text-inverse transition-colors hover:bg-primary/80"
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}