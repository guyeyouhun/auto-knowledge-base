import { config } from '../config.js'

export class LLMClient {
  readonly baseUrl: string
  readonly apiKey: string
  model: string
  provider: string
  configured: boolean
  embeddingConfigured: boolean
  embeddingBaseUrl: string
  embeddingApiKey: string
  embeddingModel: string

  constructor() {
    this.baseUrl = config.llm.baseUrl.replace(/\/?$/, '')
    this.apiKey = config.llm.apiKey
    this.model = config.llm.model
    this.provider = config.isAnthropic() ? 'anthropic' : 'openai-compatible'
    this.configured = config.isLLMConfigured()

    this.embeddingBaseUrl = config.embedding.baseUrl.replace(/\/?$/, '')
    this.embeddingApiKey = config.embedding.apiKey
    this.embeddingModel = config.embedding.model
    this.embeddingConfigured = config.isEmbeddingConfigured()
  }

  get modelName(): string {
    return this.model
  }

  private async chatCompletion(system: string, user: string, schema?: Record<string, any>): Promise<string | null> {
    if (!this.configured) return null

    const url = `${this.baseUrl}/chat/completions`
    const body: Record<string, any> = {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }

    if (schema) {
      body.response_format = { type: 'json_object' }
    }

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!resp.ok) return null
      const data = await resp.json() as any
      return data.choices?.[0]?.message?.content || null
    } catch {
      return null
    }
  }

  async extract(content: string): Promise<{
    title: string
    summary: string
    tags: string[]
    type: 'project' | 'pattern' | 'concept' | 'decision'
  } | null> {
    const system = `You are a knowledge extraction assistant. Given content, extract:
- title (max 10 words)
- summary (1-2 sentences)
- tags (2-5 lowercase keywords)
- type: project | pattern | concept | decision

Return valid JSON only.`

    const user = `Content:\n${content.slice(0, 4000)}`
    const raw = await this.chatCompletion(system, user, { type: 'json_object' })
    if (!raw) return null

    try {
      const data = JSON.parse(raw)
      return {
        title: data.title || content.slice(0, 60),
        summary: data.summary || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        type: ['project', 'pattern', 'concept', 'decision'].includes(data.type) ? data.type : 'concept',
      }
    } catch {
      return null
    }
  }

  async embed(text: string): Promise<number[] | null> {
    if (!this.embeddingConfigured) return null

    const url = `${this.embeddingBaseUrl}/embeddings`
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.embeddingApiKey}`,
        },
        body: JSON.stringify({
          model: this.embeddingModel || 'text-embedding-ada-002',
          input: text.slice(0, 8000),
        }),
      })

      if (!resp.ok) {
        console.error(`[auto-kb] Embedding API error: ${resp.status}`)
        return null
      }

      const data = await resp.json() as any
      return data.data?.[0]?.embedding || null
    } catch (err) {
      console.error('[auto-kb] Embedding request failed:', err)
      return null
    }
  }

  async rankSearchResults(
    query: string,
    entries: Array<{ title: string; summary: string; content: string }>,
  ): Promise<{ rankings: typeof entries; synthesis: string } | null> {
    const system = `You rank search results by relevance to a query. Return JSON:
{
  "rankings": [{"index": 0, "relevance": "high|medium|low"}],
  "synthesis": "2-3 sentence synthesis of the results"
}

Order rankings by relevance (most relevant first).`

    const items = entries.map((e, i) =>
      `[${i}] Title: ${e.title}\n    Summary: ${(e.summary || e.content).slice(0, 300)}`
    ).join('\n\n')

    const user = `Query: ${query}\n\nResults:\n${items}`
    const raw = await this.chatCompletion(system, user, { type: 'json_object' })
    if (!raw) return null

    try {
      const data = JSON.parse(raw)
      const rankings = (data.rankings || [])
        .sort((a: any, b: any) => {
          const order = { high: 0, medium: 1, low: 2 }
          return (order[a.relevance as keyof typeof order] || 1) - (order[b.relevance as keyof typeof order] || 1)
        })
        .map((r: any) => entries[r.index])
        .filter(Boolean)
      return {
        rankings: rankings.length > 0 ? rankings : entries,
        synthesis: data.synthesis || '',
      }
    } catch {
      return null
    }
  }
}
