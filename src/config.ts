import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { LLMConfig } from './types.js'

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
      if (!process.env[key]) {
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

  knowledgeDir: process.env.KNOWLEDGE_DIR || join(PROJECT_ROOT, 'knowledge'),

  isLLMConfigured(): boolean {
    return !!(this.llm.baseUrl && this.llm.apiKey && this.llm.model)
  },

  /** 检测是否为 Anthropic API */
  isAnthropic(): boolean {
    return this.llm.baseUrl.includes('api.anthropic.com')
  },

  /** 返回不暴露密钥的配置摘要 */
  getConfigSummary() {
    return {
      model: this.llm.model,
      baseUrl: this.llm.baseUrl.replace(/\/?(v1)?\/?$/, ''),
      configured: this.isLLMConfigured(),
      provider: this.isAnthropic() ? 'anthropic' : 'openai-compatible',
    }
  },
}
