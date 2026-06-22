#!/usr/bin/env node

/**
 * @file 一键安装 auto-kb MCP Server
 *
 * 两步安装：
 *   1. node dist/install.js          — 探测 LLM 配置，让用户选择
 *   2. node dist/install.js --install — 执行安装
 *
 * 选项:
 *   --install, -i     执行安装
 *   --llm-url, -u     LLM API 地址
 *   --llm-key, -k     API 密钥
 *   --llm-model, -m   模型名称
 *   --dir, -d        安装目录（默认 ~/.local/share/auto-kb）
 *   --help, -h       显示此帮助
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

// ── LLM 探测 ──

interface DetectedLLM {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

function probeLLM(): DetectedLLM[] {
  const detected: DetectedLLM[] = []

  // 1. 标准 LLM_* 环境变量
  const llmUrl = process.env.LLM_BASE_URL || ''
  const llmKey = process.env.LLM_API_KEY || ''
  const llmModel = process.env.LLM_MODEL || ''
  if (llmUrl && llmKey) {
    detected.push({
      id: 'llm_env',
      name: `当前环境 LLM (${llmModel || '默认'})`,
      baseUrl: llmUrl,
      apiKey: llmKey,
      model: llmModel || 'gpt-4o',
    })
  }

  return detected
}

// ── 安装参数 ──

interface CliArgs {
  doInstall: boolean
  llmUrl: string
  llmKey: string
  llmModel: string
  installDir: string
  skipLLM: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  let doInstall = false
  let llmUrl = ''
  let llmKey = ''
  let llmModel = ''
  let installDir = DEFAULT_INSTALL_DIR
  let skipLLM = false

  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    const val = args[i + 1]

    if (key === '--install' || key === '-i') { doInstall = true }
    else if (key === '--llm-url' || key === '-u') { llmUrl = val; i++ }
    else if (key === '--llm-key' || key === '-k') { llmKey = val; i++ }
    else if (key === '--llm-model' || key === '-m') { llmModel = val; i++ }
    else if (key === '--dir' || key === '-d') { installDir = val; i++ }
    else if (key === '--no-llm') { skipLLM = true }
    else if (key === '--help' || key === '-h') {
      console.log(`
用法: node dist/install.js [选项]

两步安装：
  1. 探测 LLM: node dist/install.js
  2. 执行安装: node dist/install.js --install

也可一步完成：
  node dist/install.js --install --no-llm     # 不配 LLM
  node dist/install.js --install -u <URL> -k <KEY> -m <MODEL>  # 指定 LLM

选项:
  --install, -i           执行安装
  --llm-url, -u   <URL>   LLM API 地址
  --llm-key, -k   <KEY>   API 密钥
  --llm-model, -m <MODEL> 模型名称
  --no-llm                不配置 LLM
  --dir, -d       <PATH>  安装目录（默认 ${DEFAULT_INSTALL_DIR}）
  --help, -h              显示此帮助
`)
      process.exit(0)
    }
  }

  return { doInstall, llmUrl, llmKey, llmModel, installDir, skipLLM }
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

  if (!existsSync(distDir)) {
    e('dist/ 目录不存在，请先执行 npm run build')
  }

  try {
    execSync('claude --version', { stdio: 'pipe' })
  } catch {
    e('claude CLI 不可用，请确保 Claude Code 已安装')
  }

  log(`安装到 ${installDir}`)
  mkdirSync(installDir, { recursive: true })

  log('复制 dist...')
  copyRecursive(distDir, join(installDir, 'dist'))

  for (const file of ['package.json', 'package-lock.json']) {
    const src = join(PROJECT_ROOT, file)
    if (existsSync(src)) copyFileSync(src, join(installDir, file))
  }

  log('安装生产依赖...')
  execSync('npm install --production --ignore-scripts', { cwd: installDir, stdio: 'pipe', timeout: 120_000 })

  log('编译原生模块...')
  execSync('npm rebuild better-sqlite3', { cwd: installDir, stdio: 'pipe', timeout: 60_000 })

  // 注册 MCP Server
  const serverPath = join(installDir, 'dist', 'index.js')
  log('注册 MCP Server...')

  const addArgs: string[] = ['mcp', 'add', 'auto-kb']
  if (llm) {
    addArgs.push('-e', `LLM_BASE_URL=${llm.baseUrl}`)
    addArgs.push('-e', `LLM_API_KEY=${llm.apiKey}`)
    addArgs.push('-e', `LLM_MODEL=${llm.model}`)
    execFileSync('claude', [...addArgs, '--', 'node', serverPath], { stdio: 'pipe', timeout: 30_000 })
    log(`LLM 已配置: ${llm.model} (${llm.baseUrl})`)
  } else {
    execFileSync('claude', [...addArgs, '--', 'node', serverPath], { stdio: 'pipe', timeout: 30_000 })
  }

  console.log(JSON.stringify({
    action: 'installed',
    dir: installDir,
    llmConfigured: llm !== null,
    llmModel: llm?.model || null,
    message: llm
      ? `✅ auto-kb 已安装，LLM (${llm.model}) 已配置`
      : `✅ auto-kb 已安装（纯文本模式）\n   需要 LLM 可运行: claude mcp update auto-kb ...`,
  }))
}

// ── 主流程 ──

function main() {
  const opts = parseArgs()

  // 探测模式（默认）
  if (!opts.doInstall) {
    const detected = probeLLM()

    if (opts.skipLLM || detected.length === 0) {
      // 没探测到 LLM → 输出选择提示
      console.log(JSON.stringify({
        action: 'choice_llm',
        detected: detected.map(d => ({ id: d.id, name: d.name, baseUrl: d.baseUrl, model: d.model })),
        prompt: detected.length > 0
          ? '检测到 LLM 配置，是否使用？'
          : '未检测到 LLM 配置，请选择：',
        options: detected.length > 0
          ? [
              { id: 'use', label: `使用 ${detected[0].name}` },
              { id: 'skip', label: '暂不配置 LLM，安装后手动设置' },
            ]
          : [
              { id: 'skip', label: '暂不配置 LLM，安装后手动设置' },
            ],
      }))
      return
    }

    // 探测到 LLM
    console.log(JSON.stringify({
      action: 'choice_llm',
      message: `检测到 ${detected.length} 个 LLM 配置`,
      detected: detected.map(d => ({ id: d.id, name: d.name, baseUrl: d.baseUrl, model: d.model })),
      options: [
        { id: 'use_detected', label: `使用 ${detected[0].name}` },
        { id: 'skip', label: '暂不配置，安装后手动设置' },
      ],
    }))
    return
  }

  // 安装模式
  if (opts.skipLLM) {
    doInstall(opts.installDir, null)
    return
  }

  if (opts.llmUrl && opts.llmKey) {
    doInstall(opts.installDir, {
      id: 'custom',
      name: '自定义',
      baseUrl: opts.llmUrl,
      apiKey: opts.llmKey,
      model: opts.llmModel || 'gpt-4o',
    })
    return
  }

  // 自动使用探测到的 LLM
  const detected = probeLLM()
  if (detected.length > 0) {
    doInstall(opts.installDir, detected[0])
  } else {
    doInstall(opts.installDir, null)
  }
}

main()
