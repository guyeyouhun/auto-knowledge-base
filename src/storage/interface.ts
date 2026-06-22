import type { KnowledgeEntry, RoleConfig, SearchParams, Truth } from '../types.js'

export interface KnowledgeStorage {
  /** 保存一个条目（创建或更新） */
  save(entry: KnowledgeEntry): Promise<void>

  /** 根据 ID 获取条目 */
  get(id: string): Promise<KnowledgeEntry | null>

  /** 删除条目 */
  delete(id: string): Promise<boolean>

  /** 搜索条目（关键词 + 标签 + 项目） */
  search(params: SearchParams): Promise<KnowledgeEntry[]>

  /** 列出所有条目 ID，可选按信任级别过滤 */
  list(truth?: Truth): Promise<string[]>

  /** 获取条目总数 */
  count(): Promise<number>

  /** 将 staging 条目确认为 confirmed */
  confirm(id: string): Promise<boolean>

  /** 根据标题查找相似条目 */
  findSimilar(title: string, content: string, threshold?: number): Promise<KnowledgeEntry[]>

  /** 健康检查 */
  health(): Promise<{ ok: boolean; count: number }>

  /** 获取角色配置 */
  getRoleConfig(role: string): Promise<RoleConfig | null>

  /** 设置/更新角色配置 */
  setRoleConfig(config: RoleConfig): Promise<void>

  /** 列出所有已配置的角色 */
  listRoles(): Promise<string[]>

  /** 获取指定实体的关系（双向查询） */
  getRelations(id: string): Promise<{ source_kn: string; target_kn: string; rel_type: string }[]>

  /** 记录一次访问（增加 practice_count，更新 last_accessed） */
  recordAccess(id: string): Promise<void>

  /** 记录一次练习结果（成功/失败），使用 FSRS 公式更新 strength/stability/difficulty */
  recordPractice(id: string, success: boolean): Promise<void>

  /** 更新指定条目的部分 FSRS 或状态字段 */
  updateParams(id: string, params: Partial<Pick<KnowledgeEntry, 'strength' | 'stability' | 'difficulty' | 'temperature' | 'truth'>>): Promise<void>
}
