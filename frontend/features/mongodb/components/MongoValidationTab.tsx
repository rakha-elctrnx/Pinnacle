import { useState, useEffect } from 'react'
import { ShieldCheck, Save } from 'lucide-react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import { mongoGetValidation, mongoSetValidation } from '../clients/mongodb'

interface Props {
  payload: ConnectionPayload | null
  database: string
  collection: string
}

export function MongoValidationTab({ payload, database, collection }: Props) {
  const [validatorText, setValidatorText] = useState(
    '{\n  "$jsonSchema": {}\n}',
  )
  const [level, setLevel] = useState('strict')
  const [action, setAction] = useState('error')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!payload) return
    let isMounted = true
    mongoGetValidation({ connection: payload, database, collection })
      .then((val) => {
        if (isMounted && val.validator) {
          setValidatorText(JSON.stringify(val.validator, null, 2))
          if (val.validationLevel) setLevel(val.validationLevel)
          if (val.validationAction) setAction(val.validationAction)
        }
      })
      .catch((err) => {
        if (isMounted)
          setError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      isMounted = false
    }
  }, [payload, database, collection])

  const handleSaveValidation = async () => {
    if (!payload) return
    setError(null)
    setMessage(null)
    try {
      const validator = JSON.parse(validatorText)
      await mongoSetValidation({
        connection: payload,
        database,
        collection,
        validator,
        validationLevel: level,
        validationAction: action,
      })
      setMessage('Validation rules updated successfully.')
    } catch (e) {
      setError(
        `Failed to set validation: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-base text-text-primary p-4 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-success" />
          <span className="text-xs font-semibold text-text-primary">
            Schema Validation ($jsonSchema)
          </span>
        </div>
        <button
          onClick={handleSaveValidation}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-text-inverse rounded text-xs font-medium transition-colors"
        >
          <Save className="w-3.5 h-3.5" /> Save Rules
        </button>
      </div>

      {error && (
        <div className="p-3 bg-danger-subtle border border-border-danger text-danger text-xs rounded-md">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3 bg-success-subtle border border-border-success text-success text-xs rounded-md">
          {message}
        </div>
      )}

      <div className="flex gap-4 items-center bg-bg-subtle p-3 rounded-lg border border-border-default text-xs">
        <div className="flex items-center gap-2">
          <span className="text-text-muted">Level:</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="bg-bg-base text-text-primary px-2 py-1 rounded border border-border-default"
          >
            <option value="strict">strict</option>
            <option value="moderate">moderate</option>
            <option value="off">off</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-muted">Action:</span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="bg-bg-base text-text-primary px-2 py-1 rounded border border-border-default"
          >
            <option value="error">error</option>
            <option value="warn">warn</option>
          </select>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <textarea
          value={validatorText}
          onChange={(e) => setValidatorText(e.target.value)}
          className="flex-1 w-full bg-bg-subtle font-mono text-xs text-text-primary p-4 rounded-lg border border-border-default focus:outline-none focus:border-primary resize-none"
        />
      </div>
    </div>
  )
}
