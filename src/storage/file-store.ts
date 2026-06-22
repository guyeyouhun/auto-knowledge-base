import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { KnowledgeEntry, KnowledgeType, KnowledgeIndex, SearchParams } from '../types.js'
import type { KnowledgeStorage } from './interface.js'

const INDEX_FILE = 'index.json'

export class FileStore implements KnowledgeStorage {
  private root: string
  private index: KnowledgeIndex

  constructor(root: string) {
    this.root = root
    this.ensureDirs()
    this.index = this.loadIndex()
  }

  // ── 初始化 ──

  private ensureDirs(): void {
    for (const dir of ['entities', 'patterns', 'staging']) {
      const p = join(this.root, dir)
      if (!existsSync(p)) mkdirSync(p, { recursive: true })
    }
  }

  private loadIndex(): KnowledgeIndex {
    const idxPath = join(this.root, INDEX_FILE)
    if (existsSync(idxPath)) {
      try {
        return JSON.parse(readFileSync(idxPath, 'utf-8'))
      } catch { /* fall through */ }
    }
    return { entries: [], byTag: {}, byType: {} as Record<KnowledgeType, string[]>, byProject: {} }
  }

  private saveIndex(): void {
    writeFileSync(join(this.root, INDEX_FILE), JSON.stringify(this.index, null, 2), 'utf-8')
  }

  private entryPath(id: string): string {
    const entry = this.index.entries.find(e => e === id)
    if (!entry) return join(this.root, 'staging', `${id}.json`)
    // 查找在哪个目录
    for (const dir of ['entities', 'patterns', 'staging']) {
      const p = join(this.root, dir, `${id}.json`)
      if (existsSync(p)) return p
    }
    return join(this.root, 'entities', `${id}.json`)
  }

  // ── 核心 CRUD ──

  async save(entry: KnowledgeEntry): Promise<void> {
    const dir = entry.truth === 'staging' ? 'staging' : 'entities'
    const filePath = join(this.root, dir, `${entry.id}.json`)
    writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8')

    // 更新索引
    if (!this.index.entries.includes(entry.id)) {
      this.index.entries.push(entry.id)
    }
    // 按类型
    if (!this.index.byType[entry.type]) this.index.byType[entry.type] = []
    if (!this.index.byType[entry.type].includes(entry.id)) {
      this.index.byType[entry.type].push(entry.id)
    }
    // 按标签
    for (const tag of entry.tags) {
      if (!this.index.byTag[tag]) this.index.byTag[tag] = []
      if (!this.index.byTag[tag].includes(entry.id)) {
        this.index.byTag[tag].push(entry.id)
      }
    }
    this.saveIndex()
  }

  async get(id: string): Promise<KnowledgeEntry | null> {
    const dirs = ['entities', 'patterns', 'staging']
    for (const dir of dirs) {
      const p = join(this.root, dir, `${id}.json`)
      if (existsSync(p)) {
        return JSON.parse(readFileSync(p, 'utf-8'))
      }
    }
    // 索引路径查找
    const idx = this.index.entries.indexOf(id)
    if (idx !== -1) {
      for (const dir of dirs) {
        const p = join(this.root, dir, `${id}.json`)
        if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'))
      }
    }
    return null
  }

  async delete(id: string): Promise<boolean> {
    for (const dir of ['entities', 'patterns', 'staging']) {
      const p = join(this.root, dir, `${id}.json`)
      if (existsSync(p)) {
        unlinkSync(p)
        this.index.entries = this.index.entries.filter(e => e !== id)
        // 从索引中移除
        for (const t of Object.keys(this.index.byType)) {
          this.index.byType[t as KnowledgeType] = this.index.byType[t as KnowledgeType].filter(e => e !== id)
        }
        for (const tag of Object.keys(this.index.byTag)) {
          this.index.byTag[tag] = this.index.byTag[tag].filter(e => e !== id)
        }
        this.saveIndex()
        return true
      }
    }
    return false
  }

  async list(type?: KnowledgeType): Promise<string[]> {
    if (type) return this.index.byType[type] || []
    return [...this.index.entries]
  }

  // ── 搜索 ──

  async search(params: SearchParams): Promise<KnowledgeEntry[]> {
    const { query, tags, project, limit } = params
    const q = query.toLowerCase()

    let candidates: string[] = []

    // 优先通过索引缩小范围
    const tagSets: string[][] = []
    if (tags?.length) tagSets.push(tags)
    if (project) tagSets.push([`project:${project}`])

    if (tagSets.length > 0) {
      // 取交集：匹配所有筛选条件的条目
      const sets = tagSets.map(tagList => {
        const ids = new Set<string>()
        for (const t of tagList) {
          const indexed = this.index.byTag[t]
          if (indexed) indexed.forEach(id => ids.add(id))
        }
        return ids
      })
      candidates = [...sets.reduce((a, b) => new Set([...a].filter(x => b.has(x))))]
    } else if (project) {
      candidates = this.index.byProject[project] || []
    } else {
      candidates = [...this.index.entries]
    }

    // 加载所有候选条目
    const entries: KnowledgeEntry[] = []
    for (const id of candidates) {
      const entry = await this.get(id)
      if (entry) entries.push(entry)
    }

    // 关键词匹配评分
    const scored = entries.map(e => {
      let score = 0
      const text = `${e.title} ${e.summary} ${e.content} ${e.tags.join(' ')}`.toLowerCase()
      const queryTerms = q.split(/\s+/).filter(Boolean)
      for (const term of queryTerms) {
        if (text.includes(term)) score += 1
        if (e.title.toLowerCase().includes(term)) score += 3   // 标题命中加分
        if (e.tags.some(t => t.toLowerCase().includes(term))) score += 2  // 标签命中加分
      }
      return { entry: e, score }
    })

    // 排序 + 截断
    scored.sort((a, b) => b.score - a.score)
    const filtered = scored.filter(s => s.score > 0 || !q)
    const top = limit ? filtered.slice(0, limit) : filtered

    return top.map(s => s.entry)
  }

  async getByTag(tag: string): Promise<KnowledgeEntry[]> {
    const ids = this.index.byTag[tag] || []
    const results: KnowledgeEntry[] = []
    for (const id of ids) {
      const entry = await this.get(id)
      if (entry) results.push(entry)
    }
    return results
  }

  async getIndex(): Promise<KnowledgeIndex> {
    return { ...this.index }
  }

  async health(): Promise<{ ok: boolean; count: number }> {
    return { ok: true, count: this.index.entries.length }
  }
}
