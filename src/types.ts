// ── 核心类型 ──

export type KnowledgeType = 'project' | 'pattern' | 'concept' | 'decision'

export type Truth = 'confirmed' | 'staging' | 'disputed' | 'deprecated'

export type Provenance = 'extracted' | 'inferred' | 'synthesized' | 'user_stated' | 'unverified'

export type RelationType =
  | 'references'
  | 'contradicts'
  | 'supersedes'
  | 'derives_from'
  | 'extends'
  | 'implements'

export interface Relation {
  target: string
  type: RelationType
}

export interface KnowledgeEntry {
  id: string
  type: KnowledgeType
  title: string
  summary: string
  content: string
  code_example?: string
  tags: string[]
  roles: string[]
  tasks: string[]
  truth: Truth
  provenance: Provenance
  evidence?: string
  strength: number
  stability: number
  difficulty: number
  temperature: 'hot' | 'warm' | 'cool' | 'frozen'
  practice_count: number
  practice_success: number
  supersedes?: string
  superseded_by?: string
  source?: string
  relations: Relation[]
  created_at: string
  updated_at: string
  last_accessed?: string
}

// ── 工具参数类型 ──

export interface SearchParams {
  query: string
  tags?: string[]
  project?: string
  limit?: number
}

export interface LearnParams {
  content: string
  title?: string
  summary?: string
  tags?: string[]
  roles?: string[]
  tasks?: string[]
  type?: KnowledgeType
  source?: string
  relations?: Relation[]
}

export interface RelevantParams {
  role: string
  task: string
  keywords?: string[]
  project?: string
  maxResults?: number
}

// ── 后端存储索引（保持向后兼容，将在 Task 3 SQLite 迁移中移除）──

export interface KnowledgeIndex {
  entries: string[]
  byTag: Record<string, string[]>
  byType: Record<KnowledgeType, string[]>
  byProject: Record<string, string[]>
}
