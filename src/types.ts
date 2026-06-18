// ── 知识条目类型 ──

export type KnowledgeType = 'project' | 'pattern' | 'concept' | 'decision'
export type RelationType = 'references' | 'derives_from' | 'contradicts' | 'implements' | 'generalizes'
export type Confidence = 'extracted' | 'inferred' | 'confirmed' | 'staging'

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
  tags: string[]
  relations: Relation[]
  projects: string[]
  confidence: Confidence
  source: string
  llmGenerated: boolean
  createdAt: string
  updatedAt: string
}

export interface KnowledgeIndex {
  entries: string[]            // 所有条目 ID
  byTag: Record<string, string[]>
  byType: Record<KnowledgeType, string[]>
  byProject: Record<string, string[]>
}

// ── LLM 客户端类型 ──

export interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface ExtractionResult {
  title: string
  summary: string
  tags: string[]
  type: KnowledgeType
  relations: Relation[]
  projects: string[]
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
  type?: KnowledgeType
  title?: string
  project?: string
  tags?: string[]
  source?: string
}

export interface RelevantParams {
  task: string
  keywords?: string[]
  project?: string
  currentFile?: string
  maxResults?: number
}
