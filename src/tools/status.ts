import type { KnowledgeStorage } from '../storage/interface.js'

export async function handleStatus(
  storage: KnowledgeStorage,
): Promise<{
  entryCount: number
  byTruth: Record<string, number>
  storageType: string
}> {
  const health = await storage.health()
  return {
    entryCount: health.count,
    byTruth: {},
    storageType: 'sqlite',
  }
}
