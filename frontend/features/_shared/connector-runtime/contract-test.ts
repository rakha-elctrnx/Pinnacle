/**
 * Contract test — quality gate for connector capability onboarding.
 *
 * Phase 3: Menyediakan test contract yang harus dipenuhi setiap connector
 * sebelum dianggap production-ready.
 *
 * Test ini memverifikasi bahwa adapter mengimplementasikan kontrak
 * ConnectorAdapter dengan benar, termasuk error handling dan return types.
 */

import type { ConnectorAdapter } from './adapters/adapter-types'
import type { ConnectorCapability } from './types'
import { getConnectorCapabilities, defaultConnectorRegistry } from './registry'
import { getAdapter } from './adapters'

/**
 * Result of a single contract test assertion.
 */
export interface ContractTestResult {
  name: string
  passed: boolean
  detail?: string
}

/**
 * Full contract test report for a connector type.
 */
export interface ContractTestReport {
  connectorType: string
  label: string
  results: ContractTestResult[]
  allPassed: boolean
}

/**
 * Run contract tests for a connector type.
 *
 * Checks:
 * 1. Adapter exists for the type
 * 2. Registry entry exists for the type
 * 3. Every capability in registry has a corresponding adapter method
 * 4. Adapter methods return correct shape (not throwing)
 */
export function runContractTests(connectorType: string): ContractTestReport {
  const results: ContractTestResult[] = []
  const capabilities = getConnectorCapabilities(
    defaultConnectorRegistry,
    connectorType,
  )
  const adapter = getAdapter(connectorType)

  // Test 1: Registry entry exists
  if (capabilities.capabilities.length === 0) {
    results.push({
      name: 'registry-entry',
      passed: false,
      detail: `No registry entry found for connector type "${connectorType}"`,
    })
  } else {
    results.push({
      name: 'registry-entry',
      passed: true,
      detail: `Registry entry found with label "${capabilities.label}" and ${capabilities.capabilities.length} capabilities`,
    })
  }

  // Test 2: Adapter exists
  if (!adapter) {
    results.push({
      name: 'adapter-exists',
      passed: false,
      detail: `No adapter registered for connector type "${connectorType}"`,
    })
  } else {
    results.push({
      name: 'adapter-exists',
      passed: true,
      detail: `Adapter found with label "${adapter.label}"`,
    })
  }

  // Test 3: Adapter label matches registry label
  if (adapter && capabilities.capabilities.length > 0) {
    results.push({
      name: 'label-consistency',
      passed: adapter.label === capabilities.label,
      detail:
        adapter.label === capabilities.label
          ? `Labels match: "${adapter.label}"`
          : `Label mismatch: adapter="${adapter.label}", registry="${capabilities.label}"`,
    })
  }

  // Test 4: All registry capabilities have adapter method coverage
  if (adapter) {
    const methodMap: Record<ConnectorCapability, keyof ConnectorAdapter> = {
      connect: 'testConnection',
      'test-connection': 'testConnection',
      'load-navigation-tree': 'loadNavigationTree',
      'open-entity': 'openEntity',
      'run-query': 'runQuery',
      'map-error': 'testConnection',
      'get-default-context': 'getDefaultContext',
      observability: 'testConnection',
    }

    for (const cap of capabilities.capabilities) {
      const methodName = methodMap[cap]
      if (methodName) {
        const method = (adapter as unknown as Record<string, unknown>)[
          methodName
        ]
        results.push({
          name: `capability-${cap}`,
          passed: typeof method === 'function',
          detail:
            typeof method === 'function'
              ? `Method "${methodName}" exists for capability "${cap}"`
              : `Missing method "${methodName}" for capability "${cap}"`,
        })
      }
    }
  }

  // Test 5: Default context returns correct shape (for adapters that support it)
  if (adapter && capabilities.capabilities.includes('get-default-context')) {
    const ctx = adapter.getDefaultContext({
      type: connectorType,
      host: 'localhost',
      port: 27017,
      username: '',
      password: '',
      database: 'test',
      ssl: false,
    })
    const contextValid =
      typeof ctx.database === 'string' && typeof ctx.schema === 'string'
    results.push({
      name: 'default-context-shape',
      passed: contextValid,
      detail: contextValid
        ? `Default context returns { database: "${ctx.database}", schema: "${ctx.schema}" }`
        : `Default context shape invalid: ${JSON.stringify(ctx)}`,
    })
  }

  const allPassed = results.every((r) => r.passed)

  return {
    connectorType,
    label: capabilities.label,
    results,
    allPassed,
  }
}

/**
 * Run contract tests for ALL registered connectors.
 */
export function runAllContractTests(): ContractTestReport[] {
  const types = Object.keys(defaultConnectorRegistry)
  return types.map(runContractTests)
}

/**
 * Check if a connector passes all contract tests.
 */
export function passesContractTests(connectorType: string): boolean {
  return runContractTests(connectorType).allPassed
}
