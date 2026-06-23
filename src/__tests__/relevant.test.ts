import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { SqliteStore } from '../storage/sqlite-store.js'
import { handleRelevant } from '../tools/relevant.js'
import { createTempDir, cleanupTempDir } from './setup.js'
import type { KnowledgeEntry, RoleConfig } from '../types.js'

function makeEntry(id: string, overrides?: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id,
    type: 'concept',
    title: `Entry ${id}`,
    summary: '',
    content: '',
    tags: [],
    roles: [],
    tasks: [],
    truth: 'confirmed',
    provenance: 'extracted',
    strength: 0.8,
    stability: 0.8,
    difficulty: 0.3,
    temperature: 'warm',
    practice_count: 0,
    practice_success: 0,
    relations: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeRoleConfig(overrides?: Partial<RoleConfig>): RoleConfig {
  return {
    role: 'developer',
    entry_kn_ids: [],
    spread_depth: 2,
    context_budget: 4000,
    priority_tasks: [],
    ...overrides,
  }
}

describe('handleRelevant', () => {
  let store: SqliteStore
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
    store = new SqliteStore(join(tempDir, 'test.db'))
  })

  afterEach(() => {
    store.close()
    cleanupTempDir(tempDir)
  })

  // ─── BM25 search integration ───

  it('returns entries matching task', async () => {
    await store.save(makeEntry('kn-1', { title: 'Backend Deploy', roles: ['backend'], content: 'deploy rest api to production' }))
    await store.save(makeEntry('kn-2', { title: 'Frontend Build', roles: ['frontend'], content: 'build react components' }))
    const { entries } = await handleRelevant(store, { role: 'backend', task: 'deploy' })
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0].id).toBe('kn-1')
  })

  it('returns empty when nothing matches task', async () => {
    await store.save(makeEntry('kn-1', { title: 'React Hooks', content: 'useState and useEffect' }))
    const { entries } = await handleRelevant(store, { role: 'developer', task: 'nonexistent' })
    expect(entries.length).toBe(0)
  })

  it('respects maxResults limit', async () => {
    await store.save(makeEntry('kn-1', { title: 'A', tags: ['react'], content: 'react hook state effect' }))
    await store.save(makeEntry('kn-2', { title: 'B', tags: ['react'], content: 'react context provider' }))
    await store.save(makeEntry('kn-3', { title: 'C', tags: ['react'], content: 'react ref callback' }))
    const { entries } = await handleRelevant(store, { role: 'frontend', task: 'react', maxResults: 2 })
    expect(entries.length).toBeLessThanOrEqual(2)
  })

  it('searches by content when task is provided', async () => {
    await store.save(makeEntry('kn-1', { title: 'Alpha', content: 'docker container orchestration kubernetes' }))
    await store.save(makeEntry('kn-2', { title: 'Beta', content: 'css grid layout flexbox' }))
    const { entries } = await handleRelevant(store, { role: 'developer', task: 'docker kubernetes' })
    expect(entries.length).toBe(1)
    expect(entries[0].id).toBe('kn-1')
  })

  it('combines keywords with task for search', async () => {
    await store.save(makeEntry('kn-1', { title: 'Docs', content: 'api documentation openapi' }))
    const { entries } = await handleRelevant(store, { role: 'developer', task: 'api', keywords: ['documentation'] })
    expect(entries.length).toBeGreaterThan(0)
  })

  // ─── Role filtering ───

  it('filters out entries with non-matching roles', async () => {
    await store.save(makeEntry('kn-1', { title: 'React Patterns', roles: ['frontend'], content: 'react hooks patterns' }))
    await store.save(makeEntry('kn-2', { title: 'API Design', roles: ['backend'], content: 'rest api design patterns' }))
    // Both entries match the task 'patterns', but only backend role passes
    const { entries } = await handleRelevant(store, { role: 'backend', task: 'patterns' })
    expect(entries.every(e => e.roles.includes('backend') || e.roles.length === 0)).toBe(true)
  })

  it('allows entries with empty roles[] for any role', async () => {
    await store.save(makeEntry('kn-1', { title: 'General Knowledge', roles: [], content: 'common patterns' }))
    await store.save(makeEntry('kn-2', { title: 'Frontend Only', roles: ['frontend'], content: 'frontend patterns' }))
    const { entries } = await handleRelevant(store, { role: 'backend', task: 'patterns' })
    // kn-1 (empty roles) should be included, kn-2 (frontend) should be excluded
    expect(entries.some(e => e.id === 'kn-1')).toBe(true)
    expect(entries.some(e => e.id === 'kn-2')).toBe(false)
  })

  it('includes entries with matching roles', async () => {
    await store.save(makeEntry('kn-1', { title: 'Dev Ops', roles: ['devops'], content: 'ci cd pipeline' }))
    await store.save(makeEntry('kn-2', { title: 'QA Guide', roles: ['qa'], content: 'test automation' }))
    const { entries } = await handleRelevant(store, { role: 'devops', task: 'pipeline' })
    expect(entries.some(e => e.id === 'kn-1')).toBe(true)
  })

  // ─── Diffusion activation integration ───

  it('includes diffusion-activated entries even without task match', async () => {
    // Set up role config so spreadActivation has entry_kn_ids
    const entryNode = makeEntry('entry-node', { roles: [] })
    const related = makeEntry('related-1', { title: 'Related Pattern', roles: [], content: 'some content', relations: [{ target: 'entry-node', type: 'references' }] })
    // Save in reverse FK order
    await store.save(entryNode)
    await store.save(related)
    await store.setRoleConfig(makeRoleConfig({
      role: 'developer',
      entry_kn_ids: ['entry-node'],
      spread_depth: 2,
    }))

    // Task doesn't match any entry content, but activation should still bring in entries
    const { entries } = await handleRelevant(store, { role: 'developer', task: 'zzzznonexistent' })
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.some(e => e.id === 'entry-node')).toBe(true)
  })

  it('filters frozen entries even if activated by diffusion', async () => {
    const frozen = makeEntry('frozen-kn', { roles: [], temperature: 'frozen', relations: [{ target: 'entry-node', type: 'references' }] })
    const entryNode = makeEntry('entry-node', { roles: [] })
    await store.save(entryNode)
    // Save in reverse FK order
    await store.save(frozen)
    await store.setRoleConfig(makeRoleConfig({
      role: 'developer',
      entry_kn_ids: ['entry-node'],
      spread_depth: 2,
    }))

    const { entries } = await handleRelevant(store, { role: 'developer', task: 'zzzznonexistent' })
    expect(entries.some(e => e.id === 'frozen-kn')).toBe(false)
  })

  it('filters staging entries even if in search results', async () => {
    await store.save(makeEntry('staging-kn', { truth: 'staging', content: 'unique content here' }))
    const { entries } = await handleRelevant(store, { role: 'developer', task: 'unique content' })
    expect(entries.some(e => e.id === 'staging-kn')).toBe(false)
  })

  it('combines entries from both diffusion activation and search', async () => {
    // Spread: entry-node activates via diffusion
    const entryNode = makeEntry('entry-node', { roles: [], content: 'unrelated' })
    await store.save(entryNode)
    await store.setRoleConfig(makeRoleConfig({
      role: 'developer',
      entry_kn_ids: ['entry-node'],
      spread_depth: 2,
    }))

    // Search-only: task match activates via BM25
    await store.save(makeEntry('search-only', { title: 'Task Match', roles: [], content: 'specific keyword match' }))

    const { entries } = await handleRelevant(store, { role: 'developer', task: 'specific keyword' })
    // Should include both entry-node (from activation) and search-only (from search)
    expect(entries.some(e => e.id === 'entry-node')).toBe(true)
    expect(entries.some(e => e.id === 'search-only')).toBe(true)
  })

  it('non-matching roles are filtered even when activated by diffusion', async () => {
    const entryNode = makeEntry('entry-node', { roles: [] })
    const frontendEntry = makeEntry('frontend-kn', { title: 'Frontend', roles: ['frontend'], content: 'frontend only', relations: [{ target: 'entry-node', type: 'references' }] })
    await store.save(entryNode)
    await store.save(frontendEntry)
    await store.setRoleConfig(makeRoleConfig({
      role: 'developer',
      entry_kn_ids: ['entry-node'],
      spread_depth: 2,
    }))

    const { entries } = await handleRelevant(store, { role: 'developer', task: 'frontend' })
    // frontend-kn has roles: ['frontend'] which doesn't match 'developer'
    expect(entries.some(e => e.id === 'frontend-kn')).toBe(false)
  })

  // ─── Combined role + diffusion ───

  it('scores activated entries higher than search-only entries', async () => {
    // Entry activated via diffusion
    const entryNode = makeEntry('entry-node', { roles: [], content: 'general knowledge' })
    await store.save(entryNode)
    await store.setRoleConfig(makeRoleConfig({
      role: 'developer',
      entry_kn_ids: ['entry-node'],
      spread_depth: 2,
    })
  )

    // Search-only entry with same content match
    await store.save(makeEntry('search-hit', { title: 'General Knowledge', content: 'general knowledge', roles: [] }))

    const { entries } = await handleRelevant(store, { role: 'developer', task: 'general' })
    expect(entries.length).toBeGreaterThanOrEqual(2)
    // entry-node has activation > 0, so it should be ranked first
    expect(entries[0].id).toBe('entry-node')
  })

  it('handles role config with no entry_kn_ids gracefully', async () => {
    await store.setRoleConfig(makeRoleConfig({
      role: 'developer',
      entry_kn_ids: [],
    }))
    await store.save(makeEntry('kn-1', { title: 'Data', content: 'some data' }))
    const { entries } = await handleRelevant(store, { role: 'developer', task: 'data' })
    expect(entries.length).toBe(1)
    expect(entries[0].id).toBe('kn-1')
  })

  // ─── LLM ranking ───

  const mockLLM = {
    configured: true,
    rankRelevant: async (_task: string, _keywords: string[], entries: any[]) =>
      entries.map((e, i) => ({ id: e.id, relevance: 1 - i * 0.1, reason: 'test' })),
  } as any

  it('re-ranks entries with LLM when configured', async () => {
    await store.save(makeEntry('kn-1', { title: 'React Hooks', roles: [], content: 'react hooks' }))
    const result = await handleRelevant(store, { role: 'developer', task: 'react' }, mockLLM)
    expect(result.entries.length).toBe(1)
    expect(result.llmStatus).toBe('active')
  })

  it('degrades gracefully when LLM ranking fails', async () => {
    const brokenLLM = {
      configured: true,
      rankRelevant: async () => { throw new Error('API error') },
    } as any
    await store.save(makeEntry('kn-1', { title: 'React Hooks', roles: [], content: 'react hooks' }))
    const result = await handleRelevant(store, { role: 'developer', task: 'react' }, brokenLLM)
    expect(result.entries.length).toBe(1)
    expect(result.llmStatus).toBe('degraded')
  })

  it('uses formula scoring when LLM not configured', async () => {
    const noLLM = { configured: false } as any
    await store.save(makeEntry('kn-1', { title: 'React Hooks', roles: [], content: 'react hooks' }))
    const result = await handleRelevant(store, { role: 'developer', task: 'react' }, noLLM)
    expect(result.entries.length).toBe(1)
    expect(result.llmStatus).toBe('unconfigured')
  })
})
