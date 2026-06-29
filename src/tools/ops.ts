import type { KnowledgeStorage } from '../storage/interface.js'
import type { KnowledgeEntry } from '../types.js'

export async function handleExport(
  storage: KnowledgeStorage,
): Promise<{ count: number; entries: Omit<KnowledgeEntry, 'relations'>[] }> {
  const entries = await storage.getAllEntries()
  const cleaned = entries.map(({ relations: _, ...rest }) => rest)
  return { count: cleaned.length, entries: cleaned }
}

export async function handleImport(
  storage: KnowledgeStorage,
  entries: KnowledgeEntry[],
): Promise<{ imported: number; skipped: number }> {
  return storage.bulkCreate(entries as KnowledgeEntry[])
}
