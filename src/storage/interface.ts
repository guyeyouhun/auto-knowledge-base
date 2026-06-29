import type { KnowledgeEntry, Relation, RoleConfig, AuditEntry, GapEntry } from '../types.js'
import type { FSRSParams } from '../fsrs.js'

export interface KnowledgeStorage {
  // ── CRUD ──
  create(entry: KnowledgeEntry): Promise<string>
  get(id: string): Promise<KnowledgeEntry | null>
  update(id: string, updates: Partial<KnowledgeEntry>): Promise<void>
  delete(id: string): Promise<void>

  // ── Query ──
  search(params: {
    query: string
    tags?: string[]
    project?: string
    limit?: number
  }): Promise<KnowledgeEntry[]>

  // ── Relations ──
  addRelation(sourceId: string, targetId: string, type: string): Promise<void>
  getRelations(id: string): Promise<Array<{ source_kn: string; target_kn: string; rel_type: string }>>

  // ── Role Config ──
  getRoleConfig(role: string): Promise<RoleConfig | null>
  setRoleConfig(config: RoleConfig): Promise<void>
  listRoles(): Promise<string[]>

  // ── Audit ──
  logAudit(knId: string | null, operation: string, detail?: string): Promise<void>
  queryAudit(limit?: number, operation?: string): Promise<AuditEntry[]>

  // ── Refresh ──
  queueRefresh(knId: string, sourceRef: string, sourceType: string, reason: string): Promise<void>

  // ── Embeddings ──
  getEmbedding(knId: string): Promise<Float32Array | null>
  saveEmbedding(knId: string, embedding: Float32Array): Promise<void>

  // ── Maintenance ──
  getStaleEntries(days: number): Promise<Array<{ id: string; strength: number; stability: number; difficulty: number; updated_at: string }>>
  updateFSRSParams(id: string, params: FSRSParams, temperature: string): Promise<void>
  updateLastAccessed(id: string): Promise<void>
  getAllStaging(): Promise<KnowledgeEntry[]>

  // ── Stats ──
  getStats(): Promise<{
    total: number
    byTruth: Record<string, number>
    byType: Record<string, number>
    byTemperature: Record<string, number>
    relationCount: number
    embeddingCount: number
    dbSizeBytes: number
  }>

  // ── Export/Import ──
  getAllEntries(): Promise<KnowledgeEntry[]>
  bulkCreate(entries: KnowledgeEntry[]): Promise<{ imported: number; skipped: number }>

  // ── Gap ──
  createGap(gap: Omit<GapEntry, 'id' | 'created_at' | 'updated_at'>): Promise<number>
  findGaps(params: { status?: string; reporter_role?: string; limit?: number; offset?: number }): Promise<GapEntry[]>

  // ── Lifecycle ──
  close(): Promise<void>
}
