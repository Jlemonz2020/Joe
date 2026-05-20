# HC IDE 下一线程交接文档

路径：`D:\HC\docs\HC-IDE-next-thread-handoff.md`

更新时间：2026-05-20

## 项目当前目标

这是一个 Electron + React + TypeScript 的本地 AI 编程助手，工作目录是 `D:\HC`。

用户希望它更像企业级 IDE，而不是简单聊天页面。当前主方向是：

- 中间工作区保持干净，默认是固定的“对话”主页。
- 底部是悬浮式 AI 输入框，不要终端。
- 左侧导航用于切换“工作区 / 文件结构 / AI 面板 / 设置”。
- 文件结构是一个独立导航页，不是右侧抽屉。
- 多工作区、多线程之间要互不影响。
- 点击文件后在中间打开为文件标签，文件标签作为历史记录保留，可关闭。
- “对话”主页标签不可删除。
- 不要重新引入 MetaGPT，之前用户已经要求从 HC 工具里移除。

## 用户明确要求

需要继续保持这些设计约束：

- 不要终端。
- 中间留白，底部放对话框。
- 文件结构要按真实文件夹层级展示。
- 文件结构页要有新建文件、新建文件夹、刷新、切换工作区。
- 主页应该是“对话”，并且不可删除。
- 点击文件可以查看和编辑。
- 打开的文件记录可以关闭，但不能误删真实文件。
- UI 不要只是换颜色，要往商业级 IDE 方向做。
- 风格参考：`https://www.u3008503.nyat.app:60865/`
- 可参考本地资料：`D:\Linux\pi`

## 已完成的关键改动

### 1. 文件结构页

相关文件：

- `D:\HC\src\App.tsx`
- `D:\HC\src\App.css`
- `D:\HC\shared\types.ts`
- `D:\HC\electron\main.ts`
- `D:\HC\electron\preload.ts`

当前行为：

- 左侧文件图标进入“文件结构”页。
- 文件结构按文件夹层级渲染。
- 支持刷新文件结构。
- 支持新建文件。
- 支持新建文件夹。
- 新建文件后会自动打开该文件。

后端 IPC 已有：

- `workspace:create-file`
- `workspace:create-directory`

桥接 API 已有：

- `window.hcAgent.createFile(workspaceRoot, filePath)`
- `window.hcAgent.createDirectory(workspaceRoot, directoryPath)`

### 2. 中间工作区标签

相关文件：

- `D:\HC\src\App.tsx`
- `D:\HC\src\App.css`

当前行为：

- 中间工作区始终有一个固定的“对话”标签。
- “对话”标签不可关闭。
- 点击文件结构里的文件后，会打开成文件标签。
- 文件标签保存在当前线程的 `openedFiles` 中。
- 文件标签可以关闭，关闭的是打开记录，不删除真实文件。
- 当前激活文件可编辑、保存。
- AI 修改文件后，会刷新已打开的对应文件记录。

关键类型：

```ts
type OpenFileRecord = {
  path: string
  content: string
  status: string
}

type ThreadSession = {
  id: string
  name: string
  messages: ChatMessage[]
  input: string
  isSending: boolean
  actions: AgentActionResult[]
  openedFiles: OpenFileRecord[]
  activeEditorTab: string
  selectedFile: string
  fileContent: string
  fileStatus: string
}
```

关键常量：

```ts
const HOME_EDITOR_TAB = '__home__'
```

关键函数：

- `openFile(filePath)`
- `selectEditorTab(tabId)`
- `closeFileTab(filePath)`
- `setActiveFileContent(value)`
- `saveFile()`
- `upsertOpenFile(files, nextFile)`
- `fileNameFromPath(filePath)`

## 当前主要源码入口

### 前端

- `D:\HC\src\App.tsx`
- `D:\HC\src\App.css`

### Electron

- `D:\HC\electron\main.ts`
- `D:\HC\electron\preload.ts`

### 共享类型

- `D:\HC\shared\types.ts`

### 构建配置

- `D:\HC\package.json`
- `D:\HC\vite.config.ts`
- `D:\HC\tsup.config.ts`
- `D:\HC\tsconfig.json`

## 下一步建议

建议下一线程优先做这些：

1. 优化“对话”主页的视觉层级，但保持中间主体干净，不要塞说明文字。
2. 把底部 AI 输入框做得更像 IDE Command Composer，增强浮层、状态、模型信息、发送状态。
3. 优化文件标签栏交互，例如未保存标记、关闭前提示、右键菜单。
4. 文件结构页增加更多 IDE 行为，例如重命名、删除、复制相对路径。
5. 多线程之间保持独立上下文，包括打开文件记录、聊天记录、输入框内容。
6. 检查中文乱码，当前部分历史文本存在乱码，后续可系统性修正。
7. 对照参考网站和 `D:\Linux\pi` 资料继续提升 UI 质感。

## 禁止或谨慎事项

- 不要使用 `git reset --hard`。
- 不要删除用户未明确要求删除的文件。
- 不要改 `node_modules`。
- 不要把 MetaGPT 功能重新加回 HC 应用。
- 不要把终端放回中间工作区。
- 不要把文件结构改成右侧抽屉。
- 不要只做换色式 UI 修改。
- 不要破坏普通 AI 流式输出。
- 不要把 API Key 写进源码或文档。

## 验证命令

在 `D:\HC` 执行：

```powershell
npm run lint
npm run build
```

如果需要重新打包并打开应用：

```powershell
Get-Process | Where-Object { $_.Path -like 'D:\HC\release\win-unpacked\*' } | Stop-Process -Force -ErrorAction SilentlyContinue
npm run dist
Start-Process -FilePath 'D:\HC\release\win-unpacked\HC AI 编程助手.exe'
```

## 当前已通过验证

最近一次修改后已执行并通过：

```powershell
npm run lint
npm run build
npm run dist
```

并已重新打开：

```powershell
D:\HC\release\win-unpacked\HC AI 编程助手.exe
```

## 给下一线程的提示词

可以直接把下面这段发给下一个线程：

```text
请先阅读 D:\HC\docs\HC-IDE-next-thread-handoff.md，然后继续修改 D:\HC 项目。

这是一个 Electron + React + TypeScript 的本地 AI 编程助手。用户希望它像企业级 IDE：中间默认是不可删除的“对话”主页，底部是悬浮 AI 输入框，不要终端；文件结构在左侧导航页中，点击文件后在中间打开为可关闭文件标签；多工作区、多线程互不影响。

请保持当前架构，不要重新引入 MetaGPT，不要破坏普通 AI 流式聊天。优先继续提升 UI 质感和 IDE 交互完整度。修改后运行 npm run lint、npm run build，必要时 npm run dist 并重新打开应用。
```
