import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

// 尝试加载 .env 文件
function loadEnv(): void {
  const envPath = join(PROJECT_ROOT, '.env')
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (process.env[key] === undefined) {
        process.env[key] = val
      }
    }
  }
}

loadEnv()

export const config = {
  llm: {
    baseUrl: process.env.LLM_BASE_URL || '',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4o',
  } as LLMConfig,

  embedding: {
    baseUrl: process.env.EMBEDDING_BASE_URL || process.env.LLM_BASE_URL || '',
    apiKey: process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY || '',
    model: process.env.EMBEDDING_MODEL || process.env.LLM_MODEL || '',
  } as LLMConfig,

  knowledgeDir: process.env.KNOWLEDGE_DIR || join(PROJECT_ROOT, 'knowledge'),

  dbPath: process.env.KNOWLEDGE_DB_PATH || join(PROJECT_ROOT, 'knowledge', 'knowledge.db'),

  isLLMConfigured(): boolean {
    return !!(this.llm.baseUrl && this.llm.apiKey && this.llm.model)
  },

  isEmbeddingConfigured(): boolean {
    return !!(this.embedding.baseUrl && this.embedding.apiKey && this.embedding.model)
  },

  /** 检测是否为 Anthropic API */
  isAnthropic(): boolean {
    return this.llm.baseUrl.includes('api.anthropic.com')
  },

  /** 返回不暴露密钥的配置摘要 */
  getConfigSummary() {
    const embeddingSource = this.embedding.baseUrl === (process.env.LLM_BASE_URL || '')
      ? 'llm' : 'dedicated'
    return {
      model: this.llm.model,
      baseUrl: this.llm.baseUrl.replace(/\/?(v1)?\/?$/, ''),
      configured: this.isLLMConfigured(),
      provider: this.isAnthropic() ? 'anthropic' : 'openai-compatible',
      embedding: {
        configured: this.isEmbeddingConfigured(),
        model: this.embedding.model,
        source: embeddingSource,
      },
    }
  },
}
