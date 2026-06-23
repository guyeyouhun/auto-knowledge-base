import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..')

// Helper: wait for a JSON line from stdout
function readJSON(child: ChildProcess, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for JSON')), timeout)
    const onData = (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const obj = JSON.parse(line)
          clearTimeout(timer)
          child.stdout?.removeListener('data', onData)
          resolve(obj)
        } catch { /* partial chunk, wait for more */ }
      }
    }
    child.stdout?.on('data', onData)
  })
}

describe('MCP Server Protocol', () => {
  let child: ChildProcess
  let tmpDbDir: string

  beforeAll(() => {
    // Create temp DB directory for each test file
    tmpDbDir = mkdtempSync(join(tmpdir(), 'akb-mcp-test-'))
    // Copy schema
    const schemaSrc = join(PROJECT_ROOT, 'src', 'storage', 'schema.sql')
    // Set up env for the server process
    process.env.KNOWLEDGE_DB_PATH = join(tmpDbDir, 'test.db')
    process.env.KNOWLEDGE_DIR = tmpDbDir
  })

  afterAll(() => {
    if (child) child.kill()
    rmSync(tmpDbDir, { recursive: true, force: true })
    delete process.env.KNOWLEDGE_DB_PATH
  })

  it('responds to tools/list with all registered tools', async () => {
    child = spawn('node', [join(PROJECT_ROOT, 'dist', 'index.js')], {
      env: { ...process.env, KNOWLEDGE_DB_PATH: join(tmpDbDir, 'test.db'), LLM_BASE_URL: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Send tools/list request
    const req = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    child.stdin!.write(req + '\n')

    const resp = await readJSON(child)
    expect(resp.jsonrpc).toBe('2.0')
    expect(resp.id).toBe(1)
    expect(resp.result).toBeDefined()
    expect(resp.result.tools).toBeDefined()
    expect(resp.result.tools.length).toBeGreaterThanOrEqual(10)
    const names = resp.result.tools.map((t: any) => t.name)
    expect(names).toContain('knowledge_search')
    expect(names).toContain('knowledge_learn')
    expect(names).toContain('knowledge_confirm')
    expect(names).toContain('knowledge_export')
    expect(names).toContain('knowledge_audit')

    child.kill()
  })

  it('responds to tools/call with knowledge_learn and then knowledge_confirm', async () => {
    child = spawn('node', [join(PROJECT_ROOT, 'dist', 'index.js')], {
      env: { ...process.env, KNOWLEDGE_DB_PATH: join(tmpDbDir, 'test2.db'), LLM_BASE_URL: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // knowledge_learn
    const learnReq = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'knowledge_learn', arguments: { content: 'Test knowledge for MCP protocol', title: 'MCP Test' } },
    })
    child.stdin!.write(learnReq + '\n')

    const learnResp = await readJSON(child)
    expect(learnResp.id).toBe(1)
    expect(learnResp.result).toBeDefined()
    const learnData = JSON.parse(learnResp.result.content[0].text)
    expect(learnData.id).toBeDefined()
    expect(learnData.title).toBe('MCP Test')

    const entryId = learnData.id

    // knowledge_confirm with the returned ID
    const confirmReq = JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'knowledge_confirm', arguments: { id: entryId } },
    })
    child.stdin!.write(confirmReq + '\n')

    const confirmResp = await readJSON(child)
    expect(confirmResp.id).toBe(2)
    const confirmData = JSON.parse(confirmResp.result.content[0].text)
    expect(confirmData.success).toBe(true)

    child.kill()
  })
})
