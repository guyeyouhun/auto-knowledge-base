import type { KnowledgeStorage } from '../storage/interface.js'
import type { LLMClient } from '../llm/client.js'

export async function handleStatus(
  storage: KnowledgeStorage,
  llm: LLMClient,
): Promise<{
  entryCount: number
  byType: Record<string, number>
  llmConfigured: boolean
  llmProvider: string
  llmModel: string
}> {
  const idx = await storage.getIndex()

  const byType: Record<string, number> = {}
  for (const [type, ids] of Object.entries(idx.byType)) {
    byType[type] = ids.length
  }

  return {
    entryCount: idx.entries.length,
    byType,
    llmConfigured: llm.configured,
    llmProvider: llm.configured ? llm.provider : 'none',
    llmModel: llm.configured ? llm.modelName : 'none',
  }
}
