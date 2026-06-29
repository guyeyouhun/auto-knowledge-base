import { existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

export async function runUninstall(options: { keepDb?: boolean } = {}): Promise<{ success: boolean; message: string }> {
  const knowledgeDir = join(PROJECT_ROOT, 'knowledge')

  if (!options.keepDb && existsSync(knowledgeDir)) {
    rmSync(knowledgeDir, { recursive: true, force: true })
    return { success: true, message: 'Knowledge database removed.' }
  }

  return { success: true, message: 'Uninstall complete. Database kept.' }
}
