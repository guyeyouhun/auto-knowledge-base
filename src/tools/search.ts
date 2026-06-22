import type { KnowledgeStorage } from '../storage/interface.js'
import type { SearchParams, KnowledgeEntry } from '../types.js'

export async function handleSearch(
  storage: KnowledgeStorage,
  params: SearchParams,
): Promise<{ entries: KnowledgeEntry[]; synthesis: string }> {
  const entries = await storage.search(params)
  return { entries, synthesis: '' }
}
