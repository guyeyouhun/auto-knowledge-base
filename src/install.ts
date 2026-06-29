import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

interface InstallOptions {
  dbPath?: string
  force?: boolean
}

export async function runInstall(options: InstallOptions = {}): Promise<{ success: boolean; dbPath: string; message: string }> {
  const dbPath = options.dbPath || join(PROJECT_ROOT, 'knowledge', 'knowledge.db')
  const dbDir = dirname(dbPath)

  // Ensure knowledge directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  // Create .env template if not exists
  const envPath = join(PROJECT_ROOT, '.env')
  if (!existsSync(envPath) || options.force) {
    const envTemplate = [
      '# auto-knowledge-base configuration',
      '# LLM configuration (for extraction, rerank, synthesis)',
      'LLM_BASE_URL=http://localhost:11434/v1',
      'LLM_API_KEY=your-api-key',
      'LLM_MODEL=gpt-4o',
      '',
      '# Embedding configuration (optional, falls back to LLM_* if not set)',
      '# EMBEDDING_BASE_URL=https://api.openai.com/v1',
      '# EMBEDDING_API_KEY=sk-...',
      '# EMBEDDING_MODEL=text-embedding-ada-002',
      '',
      '# Knowledge database path (optional, default: knowledge/knowledge.db)',
      '# KNOWLEDGE_DB_PATH=/path/to/knowledge.db',
      '',
    ].join('\n')
    writeFileSync(envPath, envTemplate)
  }

  return {
    success: true,
    dbPath,
    message: `Auto-knowledge-base installed. Database: ${dbPath}`,
  }
}
