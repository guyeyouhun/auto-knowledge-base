#!/usr/bin/env node

/**
 * @file 一键安装 auto-kb MCP Server
 *
 * 用法:
 *   node dist/install.js               # 安装到默认目录
 *   node dist/install.js -d <PATH>     # 安装到自定义目录
 *
 * 选项:
 *   --dir, -d   <PATH>  安装目录（默认 ~/.local/share/auto-kb）
 *   --help, -h          显示此帮助
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

interface CliArgs {
  installDir: string
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  let installDir = DEFAULT_INSTALL_DIR

  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    const val = args[i + 1]

    if (key === '--dir' || key === '-d') { installDir = val; i++ }
    else if (key === '--help' || key === '-h') {
      console.log(`
用法: node dist/install.js [选项]

安装 auto-kb MCP Server。

选项:
  --dir, -d   <PATH>  安装目录（默认 ${DEFAULT_INSTALL_DIR}）
  --help, -h          显示此帮助
`)
      process.exit(0)
    }
  }

  return { installDir }
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

function doInstall(installDir: string) {
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

  // 5. 注册 MCP Server（不传入 LLM 环境变量，可在安装后配置）
  const serverPath = join(installDir, 'dist', 'index.js')
  log('注册 MCP Server...')
  execFileSync('claude', ['mcp', 'add', 'auto-kb', '--', 'node', serverPath], {
    stdio: 'pipe',
    timeout: 30_000,
  })

  // 6. SQLite 数据库在 MCP Server 首次启动时自动初始化（schema.sql）

  // 7. 输出结果
  console.log(JSON.stringify({
    action: 'installed',
    dir: installDir,
    message: 'auto-kb installed. LLM can be configured later via claude mcp update.',
  }))
}

// ── 主流程 ──

function main() {
  const opts = parseArgs()
  doInstall(opts.installDir)
}

main()
