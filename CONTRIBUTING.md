# 贡献指南

感谢你对 auto-knowledge-base 的关注！我们欢迎任何形式的贡献——包括报告 Bug、提出新功能、改进文档、提交代码等。

## 报告 Bug

如果你发现了 Bug，请先[搜索现有 Issues](https://github.com/guyeyouhun/auto-knowledge-base/issues) 确认是否已有人报告。如果未找到，请[创建新 Issue](https://github.com/guyeyouhun/auto-knowledge-base/issues/new?template=bug_report.md) 并提供以下信息：

- 清晰的 Bug 描述
- 复现步骤
- 期望行为 vs 实际行为
- 运行环境（Node 版本、操作系统）

## 提出新功能

如果你有好的想法，请先[搜索现有 Issues](https://github.com/guyeyouhun/auto-knowledge-base/issues) 确认是否已有类似建议。如果没有，请[创建 Feature Request](https://github.com/guyeyouhun/auto-knowledge-base/issues/new?template=feature_request.md)。

## 开发环境搭建

```bash
# 1. 克隆仓库
git clone https://github.com/guyeyouhun/auto-knowledge-base.git
cd auto-knowledge-base

# 2. 安装依赖
npm install

# 3. 构建
npm run build

# 4. 运行测试
npm test
```

## 编码规范

- **语言**：TypeScript
- **验证**：使用 Zod schema 验证所有输入
- **不可变性**：优先使用不可变数据模式，避免直接修改对象
- **文件组织**：按功能/领域组织，而非按文件类型
- **错误处理**：在系统边界全面验证输入，提供有意义的错误信息
- **命名**：变量/函数使用 camelCase，类型/接口使用 PascalCase，常量使用 UPPER_SNAKE_CASE

## 测试要求

- 本项目使用 [Vitest](https://vitest.dev/) 运行测试
- 所有提交的代码必须通过全部已有测试
- 新功能应包含对应的单元测试
- 运行 `npm test` 确认测试全部通过后再提交

## Pull Request 流程

1. Fork 本仓库
2. 从 `main` 分支创建新的功能分支：`git checkout -b feat/your-feature`
3. 按照编码规范进行开发
4. 确保测试通过：`npm test`
5. 使用 Conventional Commits 格式提交：`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`
6. 推送分支到你的 Fork：`git push origin feat/your-feature`
7. 创建 Pull Request，填写 PR 模板

## AI 辅助开发

本项目支持 AI 辅助开发。如果你使用 Claude Code 或其他 AI 工具进行开发，请参考 [CLAUDE.md](CLAUDE.md) 获取项目上下文信息，包括核心设计原则、知识类型、架构决策等。

## 行为准则

请遵守我们的[行为准则](CODE_OF_CONDUCT.md)。我们致力于为所有参与者营造一个开放、包容的环境。
