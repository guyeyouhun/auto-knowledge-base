import type { KnowledgeStorage } from '../storage/interface.js'
import type { GapEntry, QueryGapsParams } from '../types.js'

export async function handleGaps(
  storage: KnowledgeStorage,
  params: QueryGapsParams,
): Promise<GapEntry[]> {
  return storage.queryGaps(params)
}
