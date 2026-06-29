import type { KnowledgeStorage } from '../storage/interface.js'
import type { RoleConfig } from '../types.js'

export async function handleGetRoleConfig(
  storage: KnowledgeStorage,
  role: string,
): Promise<RoleConfig | null> {
  const config = await storage.getRoleConfig(role)
  return config || null
}

export async function handleSetRoleConfig(
  storage: KnowledgeStorage,
  config: {
    role: string
    entry_kn_ids: string[]
    spread_depth: number
    context_budget: number
    priority_tasks: string[]
  },
): Promise<{ success: boolean }> {
  await storage.setRoleConfig(config)
  return { success: true }
}

export async function handleListRoles(
  storage: KnowledgeStorage,
): Promise<{ roles: string[] }> {
  const roles = await storage.listRoles()
  return { roles }
}
