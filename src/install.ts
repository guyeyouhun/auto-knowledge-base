#!/usr/bin/env node

/**
 * @file 一键安装 / 探测 auto-kb MCP Server
 *
 * 两种运行模式：
 *   1. 探测模式（默认）—— 探测 LLM 配置，输出 JSON 让 Agent 让用户选择
 *   2. 安装模式（--install）—— 根据传入参数实际执行安装
 *
 * 用法:
 *   node dist/install.js                                  # 探测 LLM 配置，不安装
 *   node dist/install.js --install                        # 使用探测到的配置安装
 *   node dist/install.js --install -u <URL> -k <KEY> -m <MODEL>  # 自定义 LLM 安装
 *   node dist/install.js --install --no-detect            # 安装但不配 LLM
 *
 * 选项:
 *   --install, -i     执行安装（默认只探测不安装）
 *   --llm-url, -u     LLM API 地址
 *   --llm-key, -k     API 密钥
 *   --llm-model, -m   模型名称
 *   --no-detect       安装时跳过 LLM 配置
 *   --dir, -d         安装目录（默认 ~/.local/share/auto-kb）
 *   --help, -h        显示此帮助
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { execFileSync, execSync } from 'child_process'
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

// ── 参数 ──

interface DetectedLLM {
  id: string
  name: string
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

interface CliArgs {
  doInstall: boolean
  llmUrl: string
  llmKey: string
  llmModel: string
  installDir: string
  noDetect: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const result: Record<string, string> & { doInstall?: boolean; noDetect?: boolean } = {}

  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    const val = args[i + 1]

    if (key === '--install' || key === '-i') { result.doInstall = true }
    else if (key === '--llm-url' || key === '-u') { result.llmUrl = val; i++ }
    else if (key === '--llm-key' || key === '-k') { result.llmKey = val; i++ }
    else if (key === '--llm-model' || key === '-m') { result.llmModel = val; i++ }
    else if (key === '--dir' || key === '-d') { result.installDir = val; i++ }
    else if (key === '--no-detect') { result.noDetect = true }
    else if (key === '--help' || key === '-h') {
      console.log(`
用法: node dist/install.js [选项]

探测或安装 auto-kb MCP Server。

# 先探测 LLM 配置（不安装）
  node dist/install.js

# 然后由 Agent 让用户选择，再执行安装
  node dist/install.js --install                        # 用探测到的 LLM 安装
  node dist/install.js --install --no-detect            # 不配 LLM 安装
  node dist/install.js --install -u <URL> -k <KEY> -m <MODEL>  # 自定义 LLM

选项:
  --install, -i     执行安装（默认只探测不安装）
  --llm-url, -u   <URL>    LLM API 地址
  --llm-key, -k   <KEY>    API 密钥
  --llm-model, -m <MODEL>  模型名称
  --no-detect              跳过 LLM 自动探测
  --dir, -d       <PATH>   安装目录（默认 ${DEFAULT_INSTALL_DIR}）
  --help, -h               显示此帮助
`)
      process.exit(0)
    }
  }

  return {
    doInstall: !!result.doInstall,
    llmUrl: result.llmUrl || '',
    llmKey: result.llmKey || '',
    llmModel: result.llmModel || '',
    installDir: result.installDir || DEFAULT_INSTALL_DIR,
    noDetect: !!result.noDetect,
  }
}

// ── LLM 探测 ──

/**
 * 探测环境中的 LLM 配置。
 * 返回探测到的配置列表（可能有 0 到多个）。
 */
function probeLLM(): DetectedLLM[] {
  const detected: DetectedLLM[] = []

  // 1. LLM_* 变量（auto-kb 原生格式）
  const llmUrl = process.env.LLM_BASE_URL || ''
  const llmKey = process.env.LLM_API_KEY || ''
  const llmModel = process.env.LLM_MODEL || ''
  if (llmUrl && llmKey) {
    detected.push({
      id: 'llm_env',
      name: `当前 LLM (${llmModel || '默认'})`,
      provider: 'OpenAI 兼容',
      baseUrl: llmUrl,
      apiKey: llmKey,
      model: llmModel || 'gpt-4o',
    })
  }

  // 2. ANTHROPIC_* 变量（Claude Code 会话环境）
  const antUrl = process.env.ANTHROPIC_BASE_URL || ''
  const antKey = process.env.ANTHROPIC_API_KEY || ''
  const antModel = process.env.ANTHROPIC_MODEL || ''
  if (antUrl && antKey && !detected.some(d => d.apiKey === antKey)) {
    const baseUrl = antUrl.replace(/\/+$/, '') + '/v1'
    detected.push({
      id: 'anthropic_env',
      name: `当前 Claude Code (${antModel || '默认'})`,
      provider: 'Anthropic 兼容',
      baseUrl,
      apiKey: antKey,
      model: antModel || 'gpt-4o',
    })
  }

  return detected
}

// ── 安装逻辑 ──

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

function doInstall(installDir: string, llm: DetectedLLM | null) {
  const distDir = join(PROJECT_ROOT, 'dist')

  // 检查 dist
  if (!existsSync(distDir)) {
    e('dist/ 目录不存在，请先执行 npm run build')
  }

  // 检查 claude CLI
  try {
    execSync('claude --version', { stdio: 'pipe' })
  } catch {
    e('claude CLI 不可用，请确保 Claude Code 已安装')
  }

  // 1. 创建安装目录
  log(`安装到 ${installDir}`)
  mkdirSync(installDir, { recursive: true })

  // 2. 复制 dist
  log('复制 dist...')
  copyRecursive(distDir, join(installDir, 'dist'))

  // 3. 复制 package.json
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
  const serverPath = join(installDir, 'dist', 'index.js')
  const addArgs: string[] = ['mcp', 'add', 'auto-kb']
  if (llm) {
    const env: NodeJS.ProcessEnv = { ...process.env }
    env.LLM_BASE_URL = llm.baseUrl
    env.LLM_API_KEY = llm.apiKey
    env.LLM_MODEL = llm.model
    log(`LLM: ${llm.model} (${llm.baseUrl})`)
    execFileSync('claude', [...addArgs, '--', 'node', serverPath], {
      env,
      stdio: 'pipe',
      timeout: 30_000,
    })
  } else {
    log('未配置 LLM，知识库将以纯文本模式运行')
    execFileSync('claude', [...addArgs, '--', 'node', serverPath], {
      stdio: 'pipe',
      timeout: 30_000,
    })
  }

  // 6. 输出结果
  console.log(JSON.stringify({
    action: 'installed',
    dir: installDir,
    llmConfigured: llm !== null,
    llmModel: llm?.model || null,
    message: llm
      ? `✅ auto-kb 已安装完成，LLM (${llm.model}) 已配置`
      : `✅ auto-kb 已安装完成（纯文本模式）\n   需配置 LLM 可运行: claude mcp update auto-kb -e LLM_BASE_URL=<URL> -e LLM_API_KEY=<KEY> -e LLM_MODEL=<MODEL>`,
  }))
}

// ── 主流程 ──

function main() {
  const opts = parseArgs()

  // ── 探测模式（默认） ──
  if (!opts.doInstall) {
    const detected = probeLLM()

    if (detected.length === 0) {
      // 没探测到任何 LLM 配置，让用户选择
      console.log(JSON.stringify({
        action: 'choice_llm',
        message: '未自动探测到 LLM 配置。',
        detected: [],
        prompt: '请选择 LLM 配置方式：',
        options: [
          { id: 'custom', label: '手动输入 LLM 配置（API 地址、密钥、模型）' },
          { id: 'skip', label: '暂不配置，安装后手动设置' },
        ],
      }))
      return
    }

    // 探测到配置，让 Agent 让用户选
    console.log(JSON.stringify({
      action: 'choice_llm',
      message: `检测到 ${detected.length} 个可用的 LLM 配置：`,
      detected: detected.map(d => ({
        id: d.id,
        name: d.name,
        provider: d.provider,
        model: d.model,
        baseUrl: d.baseUrl,
      })),
      prompt: '请选择 LLM 配置方式：',
      options: [
        { id: 'use_detected', label: `使用 "${detected[0].name}" 安装`, detectedId: detected[0].id },
        { id: 'custom', label: '手动输入其他 LLM 配置' },
        { id: 'skip', label: '暂不配置，安装后手动设置' },
      ],
    }))
    return
  }

  // ── 安装模式 ──
  // 检查有没有手动指定 LLM 参数
  if (opts.llmUrl && opts.llmKey) {
    doInstall(opts.installDir, {
      id: 'custom',
      name: '自定义',
      provider: '自定义',
      baseUrl: opts.llmUrl,
      apiKey: opts.llmKey,
      model: opts.llmModel || 'gpt-4o',
    })
    return
  }

  if (opts.noDetect) {
    doInstall(opts.installDir, null)
    return
  }

  // 默认 --install：用第一个探测到的配置
  const detected = probeLLM()
  if (detected.length > 0) {
    doInstall(opts.installDir, detected[0])
  } else {
    doInstall(opts.installDir, null)
  }
}

main()
