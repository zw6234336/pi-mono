# 开发规范

## 首次响应
如果用户在第一条消息中没有给出具体的任务：
先阅读 README.md，然后询问要处理哪些模块。根据回答，并行阅读相关的 README.md 文件。
- packages/ai/README.md
- packages/tui/README.md
- packages/agent/README.md
- packages/memory/README.md
- packages/coding-agent/README.md
- packages/mom/README.md
- packages/pods/README.md
- packages/web-ui/README.md

## 代码质量
- 除非绝对必要，否则禁用 `any` 类型
- 检查 `node_modules` 以获取外部 API 类型定义，严禁凭空猜测
- **严禁使用内联导入 (Inline Imports)**：禁止使用 `await import("./foo.js")`，禁止在类型位置使用 `import("pkg").Type`，禁止为类型使用动态导入。必须始终使用标准的顶级导入。
- 严禁为了修复过时依赖导致的类型错误而删除或降级代码；应直接升级依赖
- 在删除具有明确意图的功能或代码前，必须先征得用户同意
- 禁止硬编码键位检查，例如：`matchesKey(keyData, "ctrl+x")`。所有键位绑定必须是可配置的。将默认值添加到匹配对象中（如 `DEFAULT_EDITOR_KEYBINDINGS` 或 `DEFAULT_APP_KEYBINDINGS`）

## 命令
- 代码更改后（非文档更改）：运行 `npm run check`（获取完整输出，禁止截断）。在提交前修复所有错误、警告和提示信息。
- 注意：`npm run check` 不运行测试。
- **严禁运行**：`npm run dev`、`npm run build`、`npm test`
- 仅在用户指示时运行特定测试：`npx tsx ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts`
- 从包根目录运行测试，而不是从仓库根目录运行。
- 如果创建或修改了测试文件，**必须**运行该测试文件并持续迭代直至通过。
- 编写测试时，需运行测试，识别测试或实现中的问题，并持续迭代修复。
- 除非用户明确要求，否则**严禁提交**。

## GitHub Issues
阅读 issue 时：
- 始终阅读 issue 上的所有评论
- 使用以下命令一键获取所有信息：
  ```bash
  gh issue view <number> --json title,body,comments,labels,state
  ```

## OSS 周末模式
- 如果用户说 `enable OSS weekend mode until X`，则运行 `node scripts/oss-weekend.mjs --mode=close --end-date=YYYY-MM-DD --git` 并指定结束日期
- 如果用户说 `end OSS weekend mode`，则运行 `node scripts/oss-weekend.mjs --mode=open --git`
- 该脚本会更新 `README.md`、`packages/coding-agent/README.md` 和 `.github/oss-weekend.json`
- 使用 `--git` 参数时，脚本仅暂存 OSS 周末相关文件，并执行提交和推送
- 在 OSS 周末期间，`.github/workflows/oss-weekend-issues.yml` 会自动关闭非维护者的 issue，`.github/workflows/pr-gate.yml` 会自动关闭非维护者的 PR 并附带周末提示消息

创建 issue 时：
- 添加 `pkg:*` 标签以指示受影响的包
  - 可用标签：`pkg:agent`, `pkg:ai`, `pkg:coding-agent`, `pkg:memory`, `pkg:mom`, `pkg:pods`, `pkg:tui`, `pkg:web-ui`
- 如果 issue 跨越多个包，请添加所有相关标签

发布 issue/PR 评论时：
- 将完整评论内容写入临时文件，并使用 `gh issue comment --body-file` 或 `gh pr comment --body-file`
- 严禁在 shell 命令中直接通过 `--body` 传递多行 Markdown 内容
- 在发布前预览准确的评论文本
- 除非用户明确要求多个评论，否则仅发布一条最终评论
- 如果评论格式错误，请立即删除并发布一条更正后的评论
- 评论保持简明、专业，并符合用户的语气

通过 commit 关闭 issue 时：
- 在 commit message 中包含 `fixes #<number>` 或 `closes #<number>`
- 这将在 commit 合并时自动关闭 issue

## PR 工作流
- 在未本地拉取代码前先分析 PR
- 如果用户批准：创建特性分支，拉取 PR，基于 main 分支进行 rebase，应用调整，提交，合并回 main，推送，关闭 PR，并使用符合用户语气的评论告知

你不需要自己开启 PR。我们在特性分支中工作，直到所有内容符合用户要求，然后合并回 main 并推送。

## 工具
- 使用 GitHub CLI 处理 issue/PR
- 为 issue/PR 添加包标签：pkg:agent, pkg:ai, pkg:coding-agent, pkg:memory, pkg:mom, pkg:pods, pkg:tui, pkg:web-ui

## 使用 tmux 测试 pi 交互模式
在受控终端环境下测试 pi 的 TUI：

```bash
# 创建具有特定尺寸的 tmux 会话
tmux new-session -d -s pi-test -x 80 -y 24

# 从源码启动 pi
tmux send-keys -t pi-test "cd /Users/badlogic/workspaces/pi-mono && ./pi-test.sh" Enter

# 等待启动，然后捕获输出
sleep 3 && tmux capture-pane -t pi-test -p

# 发送输入
tmux send-keys -t pi-test "your prompt here" Enter

# 发送特殊按键
tmux send-keys -t pi-test Escape
tmux send-keys -t pi-test C-o  # ctrl+o

# 清理
tmux kill-session -t pi-test
```

## 风格
- 保持回答简短扼要
- 在 commit、issue、PR 评论或代码中严禁使用表情符号 (Emoji)
- 禁止包含废话或寒暄用语
- 仅使用专业技术性散文，保持客观直接（例如使用 "Thanks @user" 而非 "Thanks so much @user!"）

## 变更日志 (Changelog)
位置：`packages/*/CHANGELOG.md`（每个包都有独立的变更日志）

### 格式
在 `## [Unreleased]` 下使用以下小节：
- `### Breaking Changes` - 涉及迁移的 API 变更
- `### Added` - 新功能
- `### Changed` - 现有功能的更改
- `### Fixed` - 错误修复
- `### Removed` - 已移除的功能

### 规则
- 在添加条目前，完整阅读 `[Unreleased]` 小节，确认哪些小节已存在
- 新条目**始终**放在 `## [Unreleased]` 下
- 在现有小节下追加（如 `### Fixed`），严禁创建重复的小节
- **严禁**修改已发布版本的章节（例如 `## [0.12.2]`）
- 每个版本章节在发布后是不可变的

### 归属
- **内部变更 (来自 issue)**: `Fixed foo bar ([#123](https://github.com/badlogic/pi-mono/issues/123))`
- **外部贡献**: `Added feature X ([#456](https://github.com/badlogic/pi-mono/pull/456) by [@username](https://github.com/username))`

## 记忆模块 (packages/memory)

`@mariozechner/pi-memory` 包为智能体提供长期记忆管理。它是一个独立的模块，具有极简的依赖（仅依赖 `@mariozechner/pi-ai`）。

### 架构
- **MEMORY.md** 文件作为长期记忆（用户偏好、项目上下文、关键决策）的持久化、人类可读的真相来源。
- 模块暴露了 `extractAndSaveMemory(conversationText, model, apiKey, cwd, signal?)` 方法，该方法利用 LLM 从序列化的对话中提取重要事实，并将其合并到现有的 `MEMORY.md` 中。
- `coding-agent` 中的 `resource-loader` 会自动发现 `MEMORY.md` 文件（与 `AGENTS.md` / `CLAUDE.md` 并列），并将其内容注入系统提示词 (system prompt)。

### 压缩前记忆刷新 (Pre-compaction Memory Flush)
在上下文压缩丢弃旧消息之前，`agent-session` 会调用 `extractAndSaveMemory` 来持久化任何有价值的信息。这确保了关键上下文能在压缩后幸存。调用方负责将消息序列化为文本（通过 `coding-agent` 中的 `serializeConversation(convertToLlm(messages))`）。

### 集成点
- `packages/coding-agent/src/core/agent-session.ts` – 在手动和自动压缩前调用 `extractAndSaveMemory`
- `packages/coding-agent/src/core/resource-loader.ts` – 将 `MEMORY.md` 加载到智能体上下文
- `packages/mom/src/agent.ts` – 读取 `MEMORY.md` 以获取工作区/频道记忆

## 添加新的 LLM 提供商 (packages/ai)
添加新提供商需要修改多个文件：

### 1. 核心类型 (`packages/ai/src/types.ts`)
- 将 API 标识符添加到 `Api` 类型联合中（例如 `"bedrock-converse-stream"`)
- 创建扩展自 `StreamOptions` 的配置接口
- 在 `ApiOptionsMap` 中添加映射
- 将提供商名称添加到 `KnownProvider` 类型联合中

### 2. 提供商实现 (`packages/ai/src/providers/`)
创建导出以下内容的提供商文件：
- 返回 `AssistantMessageEventStream` 的 `stream<Provider>()` 函数
- 消息/工具转换函数
- 响应解析并发出标准化事件 (`text`, `tool_call`, `thinking`, `usage`, `stop`)

### 3. 流集成 (`packages/ai/src/stream.ts`)
- 导入提供商的流函数和配置类型
- 在 `getEnvApiKey()` 中添加凭据检测
- 在 `mapOptionsForApi()` 中为 `SimpleStreamOptions` 添加映射分支
- 在 `streamFunctions` map 中添加提供商

### 4. 模型生成 (`packages/ai/scripts/generate-models.ts`)
- 添加从提供商源抓取/解析模型的逻辑
- 映射到标准化的 `Model` 接口

### 5. 测试 (`packages/ai/test/`)
在以下文件中添加提供商：`stream.test.ts`, `tokens.test.ts`, `abort.test.ts`, `empty.test.ts`, `context-overflow.test.ts`, `image-limits.test.ts`, `unicode-surrogate.test.ts`, `tool-call-without-result.test.ts`, `image-tool-result.test.ts`, `total-tokens.test.ts`, `cross-provider-handoff.test.ts`。

对于 `cross-provider-handoff.test.ts`，至少添加一对提供商/模型。如果提供商暴露了多个模型家族（例如 GPT 和 Claude），请为每个家族至少添加一对。

对于非标准认证，创建工具类（例如 `bedrock-utils.ts`）处理凭据检测。

### 6. Coding Agent (`packages/coding-agent/`)
- `src/core/model-resolver.ts`: 在 `DEFAULT_MODELS` 中添加默认模型 ID
- `src/cli/args.ts`: 添加环境变量文档
- `README.md`: 添加提供商设置说明

### 7. 文档
- `packages/ai/README.md`: 添加到提供商表格，记录配置/认证，添加环境变量
- `packages/ai/CHANGELOG.md`: 在 `## [Unreleased]` 下添加分条目

## 发布

**锁定版本 (Lockstep versioning)**：所有包始终共享同一个版本号。每次发布都会同步更新所有包。

**版本语义**（不包含大版本发布）：
- `patch`: 错误修复和新功能
- `minor`: API 破坏性变更

### 步骤
1. **更新变更日志**: 确保自上次发布以来的所有更改都已记录在受影响包的 `CHANGELOG.md` 的 `[Unreleased]` 小节中
2. **运行发布脚本**:
   ```bash
   npm run release:patch    # 修复和新增功能
   npm run release:minor    # API 破坏性变更
   ```

脚本会自动处理：版本提升、变更日志定稿、commit、打标签、发布以及添加新的 `[Unreleased]` 小节。

## **关键** 工具使用规则 **关键**
- **严禁**使用 `sed`/`cat` 来读取文件或文件范围。必须始终使用 `read` 工具（对范围读取使用 `offset` + `limit`）。
- 在编辑前，**必须**完整阅读你修改的每一个文件。

## **关键** 并行 Agent 协作 Git 规则 **关键**
多个 Agent 可能同时在同一个工作区处理不同的文件。你**必须**遵守以下规则：

### 提交 (Committing)
- **仅提交你在本次会话中修改的文件**
- 当有相关的 issue 或 PR 时，commit message 必须包含 `fixes #<number>` 或 `closes #<number>`
- **严禁**使用 `git add -A` 或 `git add .` - 这会带走其他 Agent 的更改
- **始终**使用 `git add <specific-file-paths>` 逐一列出你修改的文件
- 在提交前，运行 `git status` 并确认你只暂存了**你自己的**文件
- 记录你在会话期间创建/修改/删除的所有文件

### 禁用的 Git 操作
这些命令可能会破坏其他 Agent 的工作：
- `git reset --hard` - 销毁未提交的更改
- `git checkout .` - 销毁未提交的更改
- `git clean -fd` - 删除未跟踪的文件
- `git stash` - 暂存**所有**更改，包括其他 Agent 的工作
- `git add -A` / `git add .` - 暂存其他 Agent 未提交的工作
- `git commit --no-verify` - 绕过必要的检查，这是决不允许的

### 安全工作流
```bash
# 1. 首先检查状态
git status

# 2. 仅添加你自己的特定文件
git add packages/ai/src/providers/transform-messages.ts
git add packages/ai/CHANGELOG.md

# 3. 提交
git commit -m "fix(ai): description"

# 4. 推送（如果需要则使用 pull --rebase，但严禁使用 reset/checkout）
git pull --rebase && git push
```

### 如果发生 Rebase 冲突
- 仅解决**你自己的**文件中的冲突
- 如果冲突发生在非你修改的文件中，请中止操作并询问用户
- **严禁**强制推送 (Force push)
