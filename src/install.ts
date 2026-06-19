#!/usr/bin/env node

/**
 * @file 一键安装 auto-kb MCP Server
 * @description 构建后执行：node dist/install.js [选项]
 *
 * 用法:
 *   node dist/install.js                                    # 安装，LLM 后续配置
 *   node dist/install.js --llm-url <URL> --llm-key <KEY> --llm-model <MODEL>  # 安装 + 配置 LLM
 *
 * 选项:
 *   --llm-url, -u     LLM API 地址
 *   --llm-key, -k     API 密钥
 *   --llm-model, -m   模型名称
 *   --dir, -d         安装目录（默认 ~/.local/share/auto-kb）
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync } from 'fs'
import { join, dirname, relative } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const DEFAULT_INSTALL_DIR = join(homedir(), '.local', 'share', 'auto-kb')

function log(msg: string) {
  console.error(`[install] ${msg}`)
}

function e(msg: string): never {
  console.error(`[install] ERROR: ${msg}`)
  process.exit(1)
}

// ── 解析参数 ──

function parseArgs() {
  const args = process.argv.slice(2)
  const result: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    const val = args[i + 1]

    if (key === '--llm-url' || key === '-u') { result.llmUrl = val; i++ }
    else if (key === '--llm-key' || key === '-k') { result.llmKey = val; i++ }
    else if (key === '--llm-model' || key === '-m') { result.llmModel = val; i++ }
    else if (key === '--dir' || key === '-d') { result.installDir = val; i++ }
    else if (key === '--help' || key === '-h') {
      console.log(`
用法: node dist/install.js [选项]

安装 auto-kb MCP Server 到永久位置并注册到 Claude Code。

选项:
  --llm-url, -u   <URL>    LLM API 地址
  --llm-key, -k   <KEY>    API 密钥
  --llm-model, -m <MODEL>  模型名称
  --dir, -d       <PATH>   安装目录（默认 ${DEFAULT_INSTALL_DIR}）
  --help, -h               显示此帮助
`)
      process.exit(0)
    }
  }

  return result
}

// ── 递归复制目录 ──

function copyRecursive(src: string, dest: string) {
  if (!existsSync(src)) return
  mkdirSync(dest, { recursive: true })

  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)

    if (statSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

// ── 主流程 ──

function main() {
  const opts = parseArgs()
  const installDir = opts.installDir || DEFAULT_INSTALL_DIR
  const llmUrl = opts.llmUrl || ''
  const llmKey = opts.llmKey || ''
  const llmModel = opts.llmModel || ''
  const hasLLM = !!(llmUrl && llmKey && llmModel)

  // 检查 dist 是否存在
  const distDir = join(PROJECT_ROOT, 'dist')
  if (!existsSync(distDir)) {
    e('dist/ 目录不存在，请先执行 npm run build')
  }

  // 检查 claude CLI 是否可用
  try {
    execSync('claude --version', { stdio: 'pipe' })
  } catch {
    e('claude CLI 未找到，请确保 Claude Code 已安装')
  }

  // 1. 创建安装目录
  log(`安装到 ${installDir}`)
  mkdirSync(installDir, { recursive: true })

  // 2. 复制 dist
  log('复制 dist...')
  copyRecursive(distDir, join(installDir, 'dist'))

  // 3. 复制 package.json（锁文件可选）
  for (const file of ['package.json', 'package-lock.json']) {
    const src = join(PROJECT_ROOT, file)
    if (existsSync(src)) copyFileSync(src, join(installDir, file))
  }

  // 4. 安装生产依赖
  log('安装生产依赖...')
  execSync('npm install --production --ignore-scripts', {
    cwd: installDir,
    stdio: 'pipe',
    timeout: 120_000,
  })

  // 5. 注册 MCP Server
  const serverCmd = `node ${join(installDir, 'dist', 'index.js')}`
  let mcpCmd = `claude mcp add auto-kb`
  if (hasLLM) {
    mcpCmd += ` -e LLM_BASE_URL=${llmUrl} -e LLM_API_KEY=${llmKey} -e LLM_MODEL=${llmModel}`
  }
  mcpCmd += ` -- ${serverCmd}`

  log('注册 MCP Server...')
  execSync(mcpCmd, { stdio: 'pipe', timeout: 30_000 })

  // 6. 标准输出返回结果（供 Agent 解析）
  console.log(JSON.stringify({
    installed: true,
    dir: installDir,
    llmConfigured: hasLLM,
    message: hasLLM
      ? `✅ auto-kb 已安装，LLM (${llmModel}) 已配置`
      : `✅ auto-kb 已安装到 ${installDir}\n   LLM 未配置，可运行以下命令配置:\n   claude mcp update auto-kb -e LLM_BASE_URL=<URL> -e LLM_API_KEY=<KEY> -e LLM_MODEL=<MODEL>`,
  }))
}

main()
