import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { SqliteStore } from '../storage/sqlite-store.js'
import { createTempDir, cleanupTempDir } from './setup.js'
import type { RoleConfig } from '../types.js'

describe('RoleConfig', () => {
  let tempDir: string
  let store: SqliteStore

  beforeEach(() => {
    tempDir = createTempDir()
    store = new SqliteStore(join(tempDir, 'test.db'))
  })

  afterEach(() => {
    store.close()
    cleanupTempDir(tempDir)
  })

  function makeRoleConfig(overrides?: Partial<RoleConfig>): RoleConfig {
    return {
      role: overrides?.role || 'developer',
      entry_kn_ids: overrides?.entry_kn_ids || [],
      spread_depth: overrides?.spread_depth ?? 2,
      context_budget: overrides?.context_budget ?? 4000,
      priority_tasks: overrides?.priority_tasks || [],
    }
  }

  it('returns null for unconfigured role', async () => {
    const config = await store.getRoleConfig('nonexistent')
    expect(config).toBeNull()
  })

  it('saves and retrieves a role config', async () => {
    const config = makeRoleConfig({
      role: 'developer',
      entry_kn_ids: ['kn-1', 'kn-2'],
      spread_depth: 3,
      context_budget: 8000,
      priority_tasks: ['learn react patterns', 'review architecture'],
    })
    await store.setRoleConfig(config)

    const retrieved = await store.getRoleConfig('developer')
    expect(retrieved).not.toBeNull()
    expect(retrieved!.role).toBe('developer')
    expect(retrieved!.entry_kn_ids).toEqual(['kn-1', 'kn-2'])
    expect(retrieved!.spread_depth).toBe(3)
    expect(retrieved!.context_budget).toBe(8000)
    expect(retrieved!.priority_tasks).toEqual(['learn react patterns', 'review architecture'])
  })

  it('upserts existing role config', async () => {
    await store.setRoleConfig(makeRoleConfig({
      role: 'developer',
      entry_kn_ids: ['kn-1'],
      spread_depth: 2,
    }))

    // Update with new values
    await store.setRoleConfig(makeRoleConfig({
      role: 'developer',
      entry_kn_ids: ['kn-1', 'kn-2', 'kn-3'],
      spread_depth: 5,
      context_budget: 16000,
      priority_tasks: ['new task'],
    }))

    const retrieved = await store.getRoleConfig('developer')
    expect(retrieved!.entry_kn_ids).toEqual(['kn-1', 'kn-2', 'kn-3'])
    expect(retrieved!.spread_depth).toBe(5)
    expect(retrieved!.context_budget).toBe(16000)
    expect(retrieved!.priority_tasks).toEqual(['new task'])
  })

  it('lists all configured roles', async () => {
    await store.setRoleConfig(makeRoleConfig({ role: 'developer' }))
    await store.setRoleConfig(makeRoleConfig({ role: 'architect' }))
    await store.setRoleConfig(makeRoleConfig({ role: 'reviewer' }))

    const roles = await store.listRoles()
    expect(roles).toContain('developer')
    expect(roles).toContain('architect')
    expect(roles).toContain('reviewer')
    expect(roles.length).toBe(3)
  })

  it('returns empty list when no roles configured', async () => {
    const roles = await store.listRoles()
    expect(roles).toEqual([])
  })

  it('persists empty arrays for entry_kn_ids and priority_tasks', async () => {
    await store.setRoleConfig(makeRoleConfig({
      role: 'tester',
      entry_kn_ids: [],
      priority_tasks: [],
    }))

    const retrieved = await store.getRoleConfig('tester')
    expect(retrieved).not.toBeNull()
    expect(retrieved!.entry_kn_ids).toEqual([])
    expect(retrieved!.priority_tasks).toEqual([])
  })
})
