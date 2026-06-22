import type { KnowledgeEntry, SearchParams, Truth } from '../types.js'

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
}
