import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..')
const installScript = join(PROJECT_ROOT, 'dist', 'install.js')

describe('install script', () => {
  it('displays help text with --help flag', () => {
    const result = execSync(`node "${installScript}" --help`, {
      encoding: 'utf-8',
      timeout: 10_000,
    })
    expect(result).toContain('用法')
    expect(result).toContain('--dir')
  })
})
