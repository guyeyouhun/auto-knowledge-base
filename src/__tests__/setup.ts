import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'akb-test-'))
}

export function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
