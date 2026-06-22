import type { KnowledgeStorage } from '../storage/interface.js'

export async function handleConfirm(
  storage: KnowledgeStorage,
  id: string,
): Promise<{ success: boolean; id: string; message: string }> {
  const entry = await storage.get(id)
  if (!entry) {
    return { success: false, id, message: 'Entry not found' }
  }
  if (entry.truth !== 'staging') {
    return { success: false, id, message: `Entry is ${entry.truth}, not staging` }
  }

  const confirmed = await storage.confirm(id)
  return {
    success: confirmed,
    id,
    message: confirmed ? 'Confirmed' : 'Failed to confirm',
  }
}
