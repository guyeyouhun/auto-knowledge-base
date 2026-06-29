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

export type LLMStatus = 'active' | 'degraded' | 'unconfigured'

export interface SearchParams {
  query: string
  tags?: string[]
  project?: string
  role?: string
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
  contradicts?: string[]
}

export interface RelevantParams {
  role: string
  task: string
  keywords?: string[]
  project?: string
  maxResults?: number
}

// ── 角色配置 ──

export interface RoleConfig {
  role: string
  entry_kn_ids: string[]
  spread_depth: number
  context_budget: number
  priority_tasks: string[]
}

export interface AuditEntry {
  id: number
  kn_id: string | null
  operation: string
  detail: string | null
  actor: string
  timestamp: string
}

// ── Gap 报告类型 ──

export type GapStatus = 'open' | 'digested' | 'rejected' | 'auto_digested'

export interface GapEntry {
  id: number
  query: string
  source_url?: string
  reporter_role?: string
  reporter_agent?: string
  status: GapStatus
  kn_id?: string
  error?: string
  created_at: string
  updated_at: string
}

export interface ReportGapParams {
  query: string
  source_url?: string
  reporter_role?: string
  reporter_agent?: string
}

export interface QueryGapsParams {
  status?: GapStatus
  reporter_role?: string
  limit?: number
  offset?: number
}
