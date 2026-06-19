#!/usr/bin/env node

/**
 * @file 卸载 auto-kb MCP Server
 * @description node dist/uninstall.js
 *
 * 移除 MCP 注册和安装目录。
 */

import { existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const DEFAULT_INSTALL_DIR = join(homedir(), '.local', 'share', 'auto-kb')

function log(msg: string) {
  console.error(`[uninstall] ${msg}`)
}

function main() {
  // 检查 args: 可能是 --dir 指定了自定义路径
  const args = process.argv.slice(2)
  let installDir = DEFAULT_INSTALL_DIR
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--dir' || args[i] === '-d') && args[i + 1]) {
      installDir = args[i + 1]
      i++
    }
  }

  log(`卸载 auto-kb...`)

  // 1. 移除 MCP 注册
  try {
    log('移除 MCP 注册...')
    execSync('claude mcp remove auto-kb', { stdio: 'pipe', timeout: 15_000 })
    log('MCP 注册已移除')
  } catch {
    log('MCP 注册不存在或移除失败（可忽略）')
  }

  // 2. 删除安装目录
  if (existsSync(installDir)) {
    log(`删除 ${installDir}...`)
    rmSync(installDir, { recursive: true, force: true })
    log('安装目录已删除')
  } else {
    log('安装目录不存在，跳过')
  }

  // 标准输出结果
  console.log(JSON.stringify({
    uninstalled: true,
    message: '✅ auto-kb 已卸载',
  }))
}

main()
