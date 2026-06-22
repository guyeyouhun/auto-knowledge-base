import Database from 'better-sqlite3'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { KnowledgeEntry, SearchParams, Truth } from '../types.js'
import type { KnowledgeStorage } from './interface.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class SqliteStore implements KnowledgeStorage {
  private db: Database.Database

  constructor(dbPath: string) {
    // Ensure parent dir exists
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  private migrate(): void {
    const schemaPath = join(__dirname, 'schema.sql')
    const schema = readFileSync(schemaPath, 'utf-8')
    this.db.exec(schema)
  }

  private rowToEntry(row: any): KnowledgeEntry {
    return {
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      roles: JSON.parse(row.roles || '[]'),
      tasks: JSON.parse(row.tasks || '[]'),
    }
  }

  async save(entry: KnowledgeEntry): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO knowledge (
        id, type, title, summary, content, code_example,
        tags, roles, tasks, truth, provenance, evidence,
        strength, stability, difficulty, temperature,
        practice_count, practice_success,
        supersedes, superseded_by, source,
        created_at, updated_at, last_accessed
      ) VALUES (
        @id, @type, @title, @summary, @content, @code_example,
        @tags, @roles, @tasks, @truth, @provenance, @evidence,
        @strength, @stability, @difficulty, @temperature,
        @practice_count, @practice_success,
        @supersedes, @superseded_by, @source,
        @created_at, @updated_at, @last_accessed
      )
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, summary=excluded.summary,
        content=excluded.content, tags=excluded.tags,
        roles=excluded.roles, tasks=excluded.tasks,
        truth=excluded.truth,
        strength=excluded.strength, stability=excluded.stability,
        difficulty=excluded.difficulty, temperature=excluded.temperature,
        updated_at=datetime('now')
    `)
    stmt.run({
      ...entry,
      tags: JSON.stringify(entry.tags),
      roles: JSON.stringify(entry.roles),
      tasks: JSON.stringify(entry.tasks),
      code_example: entry.code_example ?? null,
      evidence: entry.evidence ?? null,
      supersedes: entry.supersedes ?? null,
      superseded_by: entry.superseded_by ?? null,
      source: entry.source ?? null,
      last_accessed: entry.last_accessed ?? null,
    })

    // Save relations
    const delRel = this.db.prepare('DELETE FROM relations WHERE source_kn = ?')
    const insRel = this.db.prepare(`
      INSERT OR IGNORE INTO relations(source_kn, target_kn, rel_type, weight)
      VALUES (?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      delRel.run(entry.id)
      for (const rel of entry.relations || []) {
        insRel.run(entry.id, rel.target, rel.type, 1.0)
      }
    })
    tx()
  }

  async get(id: string): Promise<KnowledgeEntry | null> {
    const row = this.db.prepare('SELECT * FROM knowledge WHERE id = ?').get(id) as any
    if (!row) return null

    const relations = this.db.prepare(
      'SELECT target_kn as target, rel_type as type FROM relations WHERE source_kn = ?'
    ).all(id) as any[]

    return { ...this.rowToEntry(row), relations }
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM knowledge WHERE id = ?').run(id)
    return result.changes > 0
  }

  async search(params: SearchParams): Promise<KnowledgeEntry[]> {
    const { query, tags, project, limit } = params
    if (!query.trim()) return []

    const terms = query.split(/\s+/).filter(Boolean).map((t) => `"${t}"`).join(' OR ')
    const ftsQuery = terms || query

    let sql = `
      SELECT k.* FROM knowledge k
      JOIN knowledge_fts ON k.rowid = knowledge_fts.rowid
      WHERE k.truth = 'confirmed' AND k.temperature != 'frozen'
      AND knowledge_fts MATCH ?
    `
    const params_arr: any[] = [ftsQuery]

    if (tags?.length) {
      for (const tag of tags) {
        sql += ` AND k.tags LIKE ?`
        params_arr.push(`%"${tag}"%`)
      }
    }

    if (project) {
      sql += ` AND k.tasks LIKE ?`
      params_arr.push(`%"${project}"%`)
    }

    sql += ` ORDER BY bm25(knowledge_fts, 0.0, 0.0, 1.0, 1.0, 10.0, 10.0)`

    if (limit) {
      sql += ` LIMIT ?`
      params_arr.push(limit)
    }

    const rows = this.db.prepare(sql).all(...params_arr) as any[]
    return rows.map((r) => this.rowToEntry(r))
  }

  async list(truth?: Truth): Promise<string[]> {
    if (truth) {
      return (
        (this.db.prepare('SELECT id FROM knowledge WHERE truth = ?').all(truth) as any[]).map(
          (r) => r.id
        )
      )
    }
    return (this.db.prepare('SELECT id FROM knowledge').all() as any[]).map((r) => r.id)
  }

  async count(): Promise<number> {
    return (this.db.prepare('SELECT COUNT(*) as c FROM knowledge').get() as any).c
  }

  async confirm(id: string): Promise<boolean> {
    const result = this.db.prepare(
      "UPDATE knowledge SET truth = 'confirmed', updated_at = datetime('now') WHERE id = ? AND truth = 'staging'"
    ).run(id)
    return result.changes > 0
  }

  async findSimilar(title: string, _content: string, _threshold = 0.6): Promise<KnowledgeEntry[]> {
    const terms = title.split(/\s+/).filter(Boolean).map((t) => `"${t}"`).join(' OR ')
    const rows = this.db.prepare(`
      SELECT k.* FROM knowledge k
      JOIN knowledge_fts ON k.rowid = knowledge_fts.rowid
      WHERE knowledge_fts MATCH ? AND k.truth != 'deprecated'
      ORDER BY bm25(knowledge_fts, 10.0, 20.0, 1.0, 1.0, 5.0, 5.0)
      LIMIT 5
    `).all(terms) as any[]
    return rows.map((r) => this.rowToEntry(r))
  }

  async health(): Promise<{ ok: boolean; count: number }> {
    const count = await this.count()
    return { ok: true, count }
  }

  close(): void {
    this.db.close()
  }
}
