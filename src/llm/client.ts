import { config } from '../config.js'
import type { KnowledgeType, RelationType } from '../types.js'
import type { Relation } from '../types.js'

// Local type for LLM extract response — replaces removed ExtractionResult
interface ExtractResult {
  title: string
  summary: string
  tags: string[]
  type: KnowledgeType
  relations: Relation[]
  projects: string[]
}

const AI_ASSISTANT = `You are a knowledge extraction and analysis engine. You analyze content and produce structured output.
Always respond with valid JSON only, no markdown formatting, no code blocks.
Do NOT show your reasoning process. Output ONLY the JSON object, nothing else.`

// ── 提取 prompt ──

const EXTRACT_SYSTEM = `${AI_ASSISTANT}

Extract structured knowledge from the given content. Return JSON:
{
  "title": "concise title",
  "summary": "one-sentence summary of what this knowledge is about",
  "tags": ["tag1", "tag2"],
  "type": "pattern" | "concept" | "decision" | "project",
  "relations": [{"target": "related topic", "type": "references" | "derives_from" | "contradicts" | "implements" | "generalizes"}],
  "projects": ["project names if mentioned"]
}

Rules:
- type "pattern" = reusable solution/approach
- type "concept" = idea/notion/theory
- type "decision" = technical decision with rationale
- type "project" = project-specific knowledge
- tags should be lowercase, 3-7 tags
- relations are optional, only include when confident
- If content is code, focus on what problem it solves and how`

// ── 搜索综合 prompt ──

const SEARCH_SYSTEM = `${AI_ASSISTANT}

You are given a search query and several knowledge entries. Your job:
1. Understand what the query is looking for
2. Rank the entries by relevance
3. Provide a brief synthesis that connects the relevant entries

Return JSON:
{
  "results": [
    {
      "id": "entry-id",
      "relevance": 0.95,
      "reason": "why this matches"
    }
  ],
  "synthesis": "one-paragraph synthesis of how these entries answer the query (or empty string if nothing relevant)"
}`

// ── 关联推理 prompt ──

const RELEVANT_SYSTEM = `${AI_ASSISTANT}

Given a task description and several knowledge entries, determine which entries are most relevant to completing this task.
Consider: direct keyword matches, conceptual similarity, past project patterns that could apply.

Return JSON:
{
  "results": [
    {"id": "entry-id", "relevance": 0.9, "reason": "why this is helpful for the task"}
  ]
}`

// ── LLM 客户端 ──

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatResponse {
  choices: { message: { content: string } }[]
}

export class LLMClient {
  private baseUrl: string
  private apiKey: string
  private model: string
  private detectedProvider: 'openai' | 'anthropic' | null

  constructor() {
    this.baseUrl = config.llm.baseUrl
    this.apiKey = config.llm.apiKey
    this.model = config.llm.model
    this.detectedProvider = config.isAnthropic() ? 'anthropic' : null
  }

  get configured(): boolean {
    return !!(this.baseUrl && this.apiKey && this.model)
  }

  get modelName(): string {
    return this.model
  }

  get provider(): string {
    return this.detectedProvider === 'anthropic' ? 'anthropic' : 'openai-compatible'
  }

  // ── 核心 chat 方法（自动探测格式）──

  private async chat(messages: ChatMessage[], temperature = 0.3, maxTokens = 2000): Promise<string> {
    if (!this.configured) throw new Error('LLM not configured')

    // 已探测到为 Anthropic 格式
    if (this.detectedProvider === 'anthropic') {
      return this.chatAnthropic(messages, temperature, maxTokens)
    }

    // 先尝试 OpenAI 格式
    try {
      const url = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      })

      if (!res.ok) {
        // 如果 OpenAI 格式失败，怀疑是 Anthropic 格式代理
        if (res.status === 404 || res.status === 503) {
          this.detectedProvider = 'anthropic'
          return this.chatAnthropic(messages, temperature, maxTokens)
        }
        const errText = await res.text().catch(() => 'unknown')
        throw new Error(`LLM API error ${res.status}: ${errText.slice(0, 200)}`)
      }

      const data = (await res.json()) as ChatResponse
      return data.choices[0]?.message?.content || ''
    } catch (err) {
      // 网络错误也尝试 Anthropic 格式
      if (!this.detectedProvider) {
        this.detectedProvider = 'anthropic'
        return this.chatAnthropic(messages, temperature, maxTokens)
      }
      throw err
    }
  }

  private async chatAnthropic(messages: ChatMessage[], temperature: number, maxTokens: number): Promise<string> {
    // 提取 system 消息
    const systemMsg = messages.find(m => m.role === 'system')?.content || ''
    const nonSystem = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // 移除可能重复的 /v1 后缀
    const base = this.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
    const url = `${base}/v1/messages`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: systemMsg || undefined,
        messages: nonSystem,
        thinking: null,
        temperature,
        max_tokens: maxTokens,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown')
      throw new Error(`LLM API error ${res.status}: ${errText.slice(0, 200)}`)
    }

    const data = await res.json() as any
    // 处理 content 块（可能包含 thinking + text）
    if (Array.isArray(data.content)) {
      const textBlock = data.content.find((c: any) => c.type === 'text')
      if (textBlock?.text) return textBlock.text

      // 如果没有 text 块但有 thinking（输出被截断了），增加 max_tokens 重试
      const thinkingBlock = data.content.find((c: any) => c.type === 'thinking')
      if (thinkingBlock && maxTokens < 4000) {
        // 递归重试，用更大的 max_tokens
        return this.chatAnthropic(messages, temperature, Math.min(maxTokens * 2, 8000))
      }
    }
    return ''
  }

  // ── 安全 JSON 解析 ──

  private parseJSON<T>(text: string, fallback: T): T {
    try {
      // 尝试提取 JSON 块（如果 LLM 返回了 markdown 包裹）
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      const clean = jsonMatch ? jsonMatch[1] : text
      return JSON.parse(clean.trim()) as T
    } catch {
      return fallback
    }
  }

  // ── 提取结构化知识 ──

  async extract(content: string): Promise<ExtractResult | null> {
    if (!this.configured) return null

    try {
      const raw = await this.chat([
        { role: 'system', content: EXTRACT_SYSTEM },
        { role: 'user', content },
      ])

      const result = this.parseJSON<ExtractResult | null>(raw, null)

      if (!result || !result.title) return null

      return {
        title: result.title,
        summary: result.summary || '',
        tags: (result.tags || []).slice(0, 10).map(t => t.toLowerCase()),
        type: ['pattern', 'concept', 'decision', 'project'].includes(result.type) ? result.type as KnowledgeType : 'concept',
        relations: (result.relations || []).slice(0, 10),
        projects: result.projects || [],
      }
    } catch (err) {
      console.error('[LLM] extract error:', (err as Error).message)
      return null
    }
  }

  // ── 语义搜索评分 ──

  async rankSearchResults(
    query: string,
    entries: { id: string; title: string; summary: string; tags: string[] }[],
  ): Promise<{ rankings: { id: string; relevance: number; reason: string }[]; synthesis: string }> {
    if (!this.configured || entries.length === 0)
      return { rankings: entries.map(e => ({ id: e.id, relevance: 0.5, reason: '' })), synthesis: '' }

    if (entries.length === 1)
      return { rankings: [{ id: entries[0].id, relevance: 0.5, reason: 'only result' }], synthesis: '' }

    const entriesJson = JSON.stringify(entries.map(e => ({ id: e.id, title: e.title, summary: e.summary, tags: e.tags })))
    const raw = await this.chat([
      { role: 'system', content: SEARCH_SYSTEM },
      { role: 'user', content: `Query: ${query}\n\nEntries:\n${entriesJson}` },
    ], 0.2, 1500)

    const result = this.parseJSON<{ results: { id: string; relevance: number; reason: string }[]; synthesis: string }>(raw, { results: [], synthesis: '' })

    if (!result.results?.length)
      throw new Error('LLM returned empty results for rankSearchResults')

    return {
      rankings: result.results.slice(0, entries.length),
      synthesis: result.synthesis || '',
    }
  }

  // ── 关联推理 ──

  async rankRelevant(task: string, keywords: string[], entries: { id: string; title: string; summary: string; tags: string[] }[]): Promise<{ id: string; relevance: number; reason: string }[]> {
    if (!this.configured || entries.length === 0) return []

    try {
      const entriesJson = JSON.stringify(entries.map(e => ({ id: e.id, title: e.title, summary: e.summary, tags: e.tags })))
      const raw = await this.chat([
        { role: 'system', content: RELEVANT_SYSTEM },
        { role: 'user', content: `Task: ${task}\nKeywords: ${keywords.join(', ')}\n\nAvailable knowledge:\n${entriesJson}` },
      ], 0.3, 1500)

      const result = this.parseJSON<{ results: { id: string; relevance: number; reason: string }[] }>(raw, { results: [] })
      return (result.results || []).slice(0, entries.length)
    } catch (err) {
      console.error('[LLM] relevance error:', (err as Error).message)
      return entries.map(e => ({ id: e.id, relevance: 0.3, reason: '' }))
    }
  }

  // ── 生成嵌入向量 ──

  async embed(text: string): Promise<number[] | null> {
    if (!this.configured) return null

    const url = `${this.baseUrl.replace(/\/+$/, '')}/embeddings`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
        }),
      })
      if (!res.ok) return null
      const data = (await res.json()) as any
      return data.data?.[0]?.embedding || null
    } catch {
      return null
    }
  }
}
