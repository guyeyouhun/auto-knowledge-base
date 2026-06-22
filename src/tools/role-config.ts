import type { KnowledgeStorage } from '../storage/interface.js'
import type { RoleConfig } from '../types.js'

export async function handleGetRoleConfig(
  storage: KnowledgeStorage,
  role: string,
): Promise<{ found: boolean; config?: RoleConfig }> {
  const config = await storage.getRoleConfig(role)
  return config ? { found: true, config } : { found: false }
}

export async function handleSetRoleConfig(
  storage: KnowledgeStorage,
  config: RoleConfig,
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
