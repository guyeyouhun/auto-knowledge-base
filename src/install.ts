#!/usr/bin/env node

/**
 * @file 一键安装 auto-kb MCP Server
 * @description 构建后执行：node dist/install.js [选项]
 *
 * 自动从环境变量探测 LLM 配置，用户无需手动指定。
 *
 * 用法:
 *   node dist/install.js                               # 自动探测 LLM 配置
 *   node dist/install.js -u <URL> -k <KEY> -m <MODEL>  # 手动指定 LLM 配置
 *   node dist/install.js --no-detect                    # 跳过 LLM 探测，后续再配
 *
 * 选项:
 *   --llm-url, -u     LLM API 地址（默认从环境变量自动探测）
 *   --llm-key, -k     API 密钥
 *   --llm-model, -m   模型名称
 *   --no-detect       跳过 LLM 自动探测
 *   --dir, -d         安装目录（默认 ~/.local/share/auto-kb）
 *   --help, -h        显示此帮助
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
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

interface CliArgs {
  llmUrl: string
  llmKey: string
  llmModel: string
  installDir: string
  noDetect: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const result: Record<string, string> & { noDetect?: boolean } = {}

  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    const val = args[i + 1]

    if (key === '--llm-url' || key === '-u') { result.llmUrl = val; i++ }
    else if (key === '--llm-key' || key === '-k') { result.llmKey = val; i++ }
    else if (key === '--llm-model' || key === '-m') { result.llmModel = val; i++ }
    else if (key === '--dir' || key === '-d') { result.installDir = val; i++ }
    else if (key === '--no-detect') { result.noDetect = true }
    else if (key === '--help' || key === '-h') {
      console.log(`
用法: node dist/install.js [选项]

一键安装 auto-kb MCP Server。

自动从当前会话的环境变量探测 LLM 配置（ANTHROPIC_BASE_URL 等），
用户通常不需要指定任何参数。

选项:
  --llm-url, -u   <URL>    LLM API 地址（覆盖自动探测）
  --llm-key, -k   <KEY>    API 密钥（覆盖自动探测）
  --llm-model, -m <MODEL>  模型名称（覆盖自动探测）
  --no-detect              跳过 LLM 自动探测，安装后手动配置
  --dir, -d       <PATH>   安装目录（默认 ${DEFAULT_INSTALL_DIR}）
  --help, -h               显示此帮助
`)
      process.exit(0)
    }
  }

  return {
    llmUrl: result.llmUrl || '',
    llmKey: result.llmKey || '',
    llmModel: result.llmModel || '',
    installDir: result.installDir || DEFAULT_INSTALL_DIR,
    noDetect: !!result.noDetect,
  }
}

// ── LLM 自动探测 ──

interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
}

/**
 * 从进程环境变量自动探测 LLM 配置。
 * 优先级: CLI 参数 > LLM_* 环境变量 > ANTHROPIC_* 环境变量
 */
function detectLLM(cli: CliArgs): LLMConfig | null {
  // 1. CLI 参数直接返回
  if (cli.llmUrl && cli.llmKey) {
    return {
      baseUrl: cli.llmUrl,
      apiKey: cli.llmKey,
      model: cli.llmModel || 'gpt-4o',
    }
  }

  if (cli.noDetect) return null

  // 2. 优先探测 LLM_* 变量（auto-kb 原生格式）
  const envUrl = process.env.LLM_BASE_URL || ''
  const envKey = process.env.LLM_API_KEY || ''
  const envModel = process.env.LLM_MODEL || ''
  if (envUrl && envKey) {
    log(`探测到 LLM 配置: ${envUrl}`)
    return {
      baseUrl: envUrl,
      apiKey: envKey,
      model: envModel || 'gpt-4o',
    }
  }

  // 3. 从 ANTHROPIC_* 变量探测（Claude Code 会话环境）
  const antUrl = process.env.ANTHROPIC_BASE_URL || ''
  const antKey = process.env.ANTHROPIC_API_KEY || ''
  const antModel = process.env.ANTHROPIC_MODEL || ''
  if (antUrl && antKey) {
    // 补上 /v1 路径（auto-kb 用 OpenAI 格式访问）
    const baseUrl = antUrl.replace(/\/+$/, '') + '/v1'
    log(`从 ANTHROPIC_* 探测到 LLM 配置: ${antUrl}`)
    return {
      baseUrl,
      apiKey: antKey,
      model: antModel || 'gpt-4o',
    }
  }

  return null
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

// ── shell 安全转义 ──

function shellEscape(val: string): string {
  // 包含空格或特殊字符时加引号
  if (/[\s"']/.test(val)) {
    return `"${val.replace(/"/g, '\\"')}"`
  }
  return val
}

// ── 主流程 ──

function main() {
  const opts = parseArgs()
  const installDir = opts.installDir

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

  // 自动探测 LLM 配置
  const llm = detectLLM(opts)
  const hasLLM = llm !== null

  if (hasLLM) {
    log(`LLM: ${llm!.baseUrl} | 模型: ${llm!.model}`)
  } else {
    log('未配置 LLM，知识库将以纯文本模式运行')
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
  const serverCmd = `node ${shellEscape(join(installDir, 'dist', 'index.js'))}`
  let mcpCmd = `claude mcp add auto-kb`
  if (hasLLM) {
    mcpCmd += ` -e LLM_BASE_URL=${shellEscape(llm!.baseUrl)} -e LLM_API_KEY=${shellEscape(llm!.apiKey)} -e LLM_MODEL=${shellEscape(llm!.model)}`
  }
  mcpCmd += ` -- ${serverCmd}`

  log('注册 MCP Server...')
  execSync(mcpCmd, { stdio: 'pipe', timeout: 30_000 })

  // 6. 输出结果（Agent 可解析）
  console.log(JSON.stringify({
    installed: true,
    dir: installDir,
    llmConfigured: hasLLM,
    llmModel: llm?.model || null,
    llmProvider: llm?.baseUrl || null,
    message: hasLLM
      ? `✅ auto-kb 已安装，LLM (${llm!.model}) 已自动配置`
      : '✅ auto-kb 已安装（纯文本模式）\n   需配置 LLM 可运行: claude mcp update auto-kb -e LLM_BASE_URL=<URL> -e LLM_API_KEY=<KEY> -e LLM_MODEL=<MODEL>',
  }))
}

main()
