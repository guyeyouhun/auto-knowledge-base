import type { KnowledgeEntry, KnowledgeType, SearchParams, KnowledgeIndex } from '../types.js'

export interface KnowledgeStorage {
  /** 保存一个条目（创建或更新） */
  save(entry: KnowledgeEntry): Promise<void>

  /** 根据 ID 获取条目 */
  get(id: string): Promise<KnowledgeEntry | null>

  /** 删除条目 */
  delete(id: string): Promise<boolean>

  /** 列出指定类型的所有条目 ID */
  list(type?: KnowledgeType): Promise<string[]>

  /** 搜索条目（关键词 + 标签 + 项目） */
  search(params: SearchParams): Promise<KnowledgeEntry[]>

  /** 按标签获取条目 */
  getByTag(tag: string): Promise<KnowledgeEntry[]>

  /** 获取索引统计 */
  getIndex(): Promise<KnowledgeIndex>

  /** 健康检查 */
  health(): Promise<{ ok: boolean; count: number }>
}
