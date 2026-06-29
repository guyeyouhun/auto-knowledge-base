import Database from 'better-sqlite3'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { KnowledgeEntry, RoleConfig, AuditEntry, GapEntry } from '../types.js'
import type { FSRSParams } from '../fsrs.js'
import { updateTemperature } from '../fsrs.js'
import type { KnowledgeStorage } from './interface.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadSchema(path: string): string {
  const schemaPath = path.endsWith('.sql') ? path : join(__dirname, 'schema.sql')
  return readFileSync(schemaPath, 'utf-8')
}

export class SqliteStore implements KnowledgeStorage {
  private db: Database.Database
  private schemaLoaded: boolean = false

  constructor(dbPath: string) {
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
  }

  private ensureSchema(): void {
    if (this.schemaLoaded) return
    const schema = loadSchema(join(__dirname, 'schema.sql'))
    this.db.exec(schema)
    this.schemaLoaded = true
  }

  // ── CRUD ──

  async create(entry: KnowledgeEntry): Promise<string> {
    this.ensureSchema()
    // Reduce title length to fit within UNIQUE constraint (SQLite max is 200 for our schema)
    const title = entry.title.slice(0, 200)
    // ... existing code ...
    return entry.id
  }

  async get(id: string): Promise<KnowledgeEntry | null> {
    this.ensureSchema()
    const row = this.db.prepare('SELECT * FROM knowledge WHERE id = ?').get(id) as any
    if (!row) return null
    return this.rowToEntry(row)
  }

  async update(id: string, updates: Partial<KnowledgeEntry>): Promise<void> {
    this.ensureSchema()
    const sets: string[] = []
    const values: any[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id') continue
      if (key === 'tags' || key === 'roles' || key === 'tasks' || key === 'relations') {
        sets.push(`${key} = ?`)
        values.push(JSON.stringify(value))
      } else if (key === 'temperature') {
        if (!['hot', 'warm', 'cool', 'frozen'].includes(value as string)) continue
        sets.push(`${key} = ?`)
        values.push(value)
      } else {
        sets.push(`${key} = ?`)
        values.push(value)
      }
    }

    if (sets.length === 0) return

    this.db.prepare(`UPDATE knowledge SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
  }

  async delete(id: string): Promise<void> {
    this.ensureSchema()
    this.db.prepare('DELETE FROM knowledge WHERE id = ?').run(id)
  }

  // ── Query ──

  async search(params: {
    query: string
    tags?: string[]
    project?: string
    limit?: number
  }): Promise<KnowledgeEntry[]> {
    this.ensureSchema()
    let sql = `
      SELECT k.*, kn_fts.rank
      FROM knowledge_fts
      JOIN knowledge k ON k.id = knowledge_fts.rowid
      WHERE k.truth = 'confirmed'
      AND k.temperature != 'frozen'
      AND knowledge_fts MATCH ?
    `
    const conditions: string[] = []
    const values: any[] = [this.fixQuery(params.query)]

    if (params.tags && params.tags.length > 0) {
      for (const tag of params.tags) {
        conditions.push(`k.tags LIKE ?`)
        values.push(`%"${tag}"%`)
      }
    }

    if (params.project) {
      conditions.push(`k.tags LIKE ?`)
      values.push(`%"${params.project}"%`)
    }

    if (conditions.length > 0) {
      sql += ` AND ${conditions.join(' AND ')}`
    }

    sql += ' ORDER BY kn_fts.rank LIMIT ?'
    values.push(params.limit || 10)

    const rows = this.db.prepare(sql).all(...values) as any[]
    return rows.map((row: any) => this.rowToEntry(row))
  }

  private fixQuery(query: string): string {
    // FTS5 doesn't like special chars
    return query.replace(/[^\w\s\u4e00-\u9fff-]/g, ' ').trim()
  }

  // ── Relations ──

  async addRelation(sourceId: string, targetId: string, type: string): Promise<void> {
    this.ensureSchema()
    this.db.prepare(
      'INSERT OR IGNORE INTO relations (source_kn, target_kn, rel_type) VALUES (?, ?, ?)'
    ).run(sourceId, targetId, type)
  }

  async getRelations(id: string): Promise<Array<{ source_kn: string; target_kn: string; rel_type: string }>> {
    this.ensureSchema()
    return this.db.prepare(
      'SELECT * FROM relations WHERE source_kn = ? OR target_kn = ?'
    ).all(id, id) as Array<{ source_kn: string; target_kn: string; rel_type: string }>
  }

  // ── Role Config ──

  async getRoleConfig(role: string): Promise<RoleConfig | null> {
    this.ensureSchema()
    const row = this.db.prepare('SELECT * FROM role_config WHERE role = ?').get(role) as any
    if (!row) return null
    return {
      role: row.role,
      entry_kn_ids: JSON.parse(row.entry_kn_ids || '[]'),
      spread_depth: row.spread_depth,
      context_budget: row.context_budget,
      priority_tasks: JSON.parse(row.priority_tasks || '[]'),
    }
  }

  async setRoleConfig(config: RoleConfig): Promise<void> {
    this.ensureSchema()
    this.db.prepare(`
      INSERT INTO role_config (role, entry_kn_ids, spread_depth, context_budget, priority_tasks)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(role) DO UPDATE SET
        entry_kn_ids = excluded.entry_kn_ids,
        spread_depth = excluded.spread_depth,
        context_budget = excluded.context_budget,
        priority_tasks = excluded.priority_tasks
    `).run(
      config.role,
      JSON.stringify(config.entry_kn_ids),
      config.spread_depth,
      config.context_budget,
      JSON.stringify(config.priority_tasks),
    )
  }

  async listRoles(): Promise<string[]> {
    this.ensureSchema()
    const rows = this.db.prepare('SELECT role FROM role_config').all() as any[]
    return rows.map(r => r.role)
  }

  // ── Audit ──

  async logAudit(knId: string | null, operation: string, detail?: string): Promise<void> {
    this.ensureSchema()
    this.db.prepare(
      'INSERT INTO audit_log (kn_id, operation, detail, actor) VALUES (?, ?, ?, ?)'
    ).run(knId, operation, detail || null, 'agent')
  }

  async queryAudit(limit: number = 50, operation?: string): Promise<AuditEntry[]> {
    this.ensureSchema()
    let sql = 'SELECT * FROM audit_log'
    const values: any[] = []

    if (operation) {
      sql += ' WHERE operation = ?'
      values.push(operation)
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?'
    values.push(limit)

    return this.db.prepare(sql).all(...values) as AuditEntry[]
  }

  // ── Refresh ──

  async queueRefresh(knId: string, sourceRef: string, sourceType: string, reason: string): Promise<void> {
    this.ensureSchema()
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO refresh_queue (kn_id, source_ref, source_type, reason, status, created_at, scheduled_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(knId, sourceRef, sourceType, reason, now, now, now)
  }

  // ── Embeddings ──

  async getEmbedding(knId: string): Promise<Float32Array | null> {
    this.ensureSchema()
    const row = this.db.prepare('SELECT embedding FROM knowledge_embeddings WHERE kn_id = ?').get(knId) as any
    if (!row || !row.embedding) return null
    return new Float32Array(row.embedding.split(',').map(Number))
  }

  async saveEmbedding(knId: string, embedding: Float32Array): Promise<void> {
    this.ensureSchema()
    this.db.prepare(`
      INSERT INTO knowledge_embeddings (kn_id, embedding)
      VALUES (?, ?)
      ON CONFLICT(kn_id) DO UPDATE SET embedding = excluded.embedding
    `).run(knId, Array.from(embedding).join(','))
  }

  // ── Maintenance ──

  async getStaleEntries(days: number): Promise<Array<{ id: string; strength: number; stability: number; difficulty: number; updated_at: string }>> {
    this.ensureSchema()
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    return this.db.prepare(`
      SELECT id, strength, stability, difficulty, updated_at
      FROM knowledge
      WHERE truth = 'confirmed' AND updated_at < ?
    `).all(cutoff) as Array<{ id: string; strength: number; stability: number; difficulty: number; updated_at: string }>
  }

  async updateFSRSParams(id: string, params: FSRSParams, temperature: string): Promise<void> {
    this.ensureSchema()
    this.db.prepare(
      'UPDATE knowledge SET strength = ?, stability = ?, difficulty = ?, temperature = ?, updated_at = ? WHERE id = ?'
    ).run(params.strength, params.stability, params.difficulty, temperature, new Date().toISOString(), id)
  }

  async updateLastAccessed(id: string): Promise<void> {
    this.ensureSchema()
    this.db.prepare(
      'UPDATE knowledge SET last_accessed = ? WHERE id = ?'
    ).run(new Date().toISOString(), id)
  }

  async getAllStaging(): Promise<KnowledgeEntry[]> {
    this.ensureSchema()
    const rows = this.db.prepare("SELECT * FROM knowledge WHERE truth = 'staging'").all() as any[]
    return rows.map((row: any) => this.rowToEntry(row))
  }

  // ── Stats ──

  async getStats(): Promise<{
    total: number
    byTruth: Record<string, number>
    byType: Record<string, number>
    byTemperature: Record<string, number>
    relationCount: number
    embeddingCount: number
    dbSizeBytes: number
  }> {
    this.ensureSchema()
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM knowledge').get() as any).c
    const byTruth: Record<string, number> = {}
    for (const row of this.db.prepare('SELECT truth, COUNT(*) as c FROM knowledge GROUP BY truth').all() as any[]) {
      byTruth[row.truth] = row.c
    }
    const byType: Record<string, number> = {}
    for (const row of this.db.prepare('SELECT type, COUNT(*) as c FROM knowledge GROUP BY type').all() as any[]) {
      byType[row.type] = row.c
    }
    const byTemperature: Record<string, number> = {}
    for (const row of this.db.prepare('SELECT temperature, COUNT(*) as c FROM knowledge GROUP BY temperature').all() as any[]) {
      byTemperature[row.temperature] = row.c
    }
    const relationCount = (this.db.prepare('SELECT COUNT(*) as c FROM relations').get() as any).c
    const embeddingCount = (this.db.prepare('SELECT COUNT(*) as c FROM knowledge_embeddings').get() as any).c
    return { total, byTruth, byType, byTemperature, relationCount, embeddingCount, dbSizeBytes: 0 }
  }

  // ── Export/Import ──

  async getAllEntries(): Promise<KnowledgeEntry[]> {
    this.ensureSchema()
    const rows = this.db.prepare('SELECT * FROM knowledge').all() as any[]
    return rows.map((row: any) => this.rowToEntry(row))
  }

  async bulkCreate(entries: KnowledgeEntry[]): Promise<{ imported: number; skipped: number }> {
    this.ensureSchema()
    let imported = 0
    let skipped = 0

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO knowledge
      (id, type, title, summary, content, code_example, tags, roles, tasks,
       truth, provenance, evidence, strength, stability, difficulty, temperature,
       practice_count, practice_success, source, relations, created_at, updated_at)
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `)

    for (const entry of entries) {
      const result = insert.run(
        entry.id, entry.type, entry.title.slice(0, 200), entry.summary, entry.content,
        entry.code_example || null, JSON.stringify(entry.tags), JSON.stringify(entry.roles), JSON.stringify(entry.tasks),
        entry.truth, entry.provenance, entry.evidence || null,
        entry.strength, entry.stability, entry.difficulty, entry.temperature,
        entry.practice_count, entry.practice_success, entry.source || null,
        JSON.stringify(entry.relations), entry.created_at, entry.updated_at,
      )
      if ((result as any).changes === 0) skipped++
      else imported++
    }

    return { imported, skipped }
  }

  // ── Gap ──

  async createGap(gap: Omit<GapEntry, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    this.ensureSchema()
    const now = new Date().toISOString()
    const result = this.db.prepare(`
      INSERT INTO knowledge_gaps (query, source_url, reporter_role, reporter_agent, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(gap.query, gap.source_url || null, gap.reporter_role || null, gap.reporter_agent || null, gap.status || 'open', now, now)
    return (result as any).lastInsertRowid as number
  }

  async findGaps(params: { status?: string; reporter_role?: string; limit?: number; offset?: number }): Promise<GapEntry[]> {
    this.ensureSchema()
    let sql = 'SELECT * FROM knowledge_gaps WHERE 1=1'
    const values: any[] = []

    if (params.status) {
      sql += ' AND status = ?'
      values.push(params.status)
    }
    if (params.reporter_role) {
      sql += ' AND reporter_role = ?'
      values.push(params.reporter_role)
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    values.push(params.limit || 10, params.offset || 0)

    return this.db.prepare(sql).all(...values) as GapEntry[]
  }

  // ── Lifecycle ──

  async close(): Promise<void> {
    this.db.close()
  }

  // ── Helpers ──

  private rowToEntry(row: any): KnowledgeEntry {
    return {
      id: row.id,
      type: row.type || 'concept',
      title: row.title || '',
      summary: row.summary || '',
      content: row.content || '',
      code_example: row.code_example || undefined,
      tags: this.safeJsonParse(row.tags, []),
      roles: this.safeJsonParse(row.roles, []),
      tasks: this.safeJsonParse(row.tasks, []),
      truth: row.truth || 'staging',
      provenance: row.provenance || 'unverified',
      evidence: row.evidence || undefined,
      strength: row.strength ?? 0.8,
      stability: row.stability ?? 0.8,
      difficulty: row.difficulty ?? 0.3,
      temperature: (['hot', 'warm', 'cool', 'frozen'].includes(row.temperature) ? row.temperature : 'warm') as 'hot' | 'warm' | 'cool' | 'frozen',
      practice_count: row.practice_count || 0,
      practice_success: row.practice_success || 0,
      supersedes: row.supersedes || undefined,
      superseded_by: row.superseded_by || undefined,
      source: row.source || undefined,
      relations: this.safeJsonParse(row.relations, []),
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
      last_accessed: row.last_accessed || undefined,
    }
  }

  private safeJsonParse(data: any, fallback: any): any {
    if (!data) return fallback
    try {
      return JSON.parse(data)
    } catch {
      return fallback
    }
  }
}
