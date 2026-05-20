# HC AI 修改与打包流程

这份文档用于后续让 AI 继续修改 HC 项目，并在修改完成后重新打包 Windows 安装包。

## 项目基本信息

- 项目目录：`D:\HC`
- 技术栈：Electron + React + TypeScript + Vite
- 前端主文件：`src/App.tsx`
- 前端样式：`src/App.css`
- Electron 主进程：`electron/main.ts`
- Electron 预加载：`electron/preload.ts`
- 共享类型：`shared/types.ts`
- 打包工具：`electron-builder`
- 安装包输出目录：`release`

## 给 AI 的协作规则

后续让 AI 修改项目时，建议先发送这段规则：

```text
请先阅读 D:\HC\docs\AI-change-and-package-guide.md，然后再修改项目。

协作规则：
- 默认用中文回复。
- 修改前先说明准备改哪些文件。
- 不要修改 node_modules、dist、dist-electron、release。
- 不要删除用户文件，除非我明确要求。
- 不要执行 git reset --hard、git checkout -- 这类会丢改动的命令。
- 不要把 MetaGPT 功能重新加回 HC 应用。
- 不要把终端重新放回中间工作区。
- 修改后必须运行 npm run build。
- 只有 npm run build 通过后，才运行 npm run dist:installer 生成安装包。
- 如果构建失败，先修复源码错误，不要直接用旧 dist 产物冒充最新版安装包。
```

## 推荐修改流程

1. 进入项目目录：

```powershell
Set-Location D:\HC
```

2. 查看当前状态：

```powershell
git status --short
```

3. 让 AI 先读关键文件：

```text
请先只读浏览这些文件：
- package.json
- src/App.tsx
- src/App.css
- electron/main.ts
- electron/preload.ts
- shared/types.ts

读完后告诉我当前实现结构，再开始修改。
```

4. 明确本次需求，例如：

```text
请修改 HC 的文件树交互：
- 保持当前布局不变
- 只修改 src/App.tsx 和 src/App.css
- 增加右键菜单：复制相对路径、重命名、删除
- 删除真实文件前必须弹确认
- 修改完成后运行 npm run build
```

5. 修改完成后验证：

```powershell
npm run build
```

6. 构建通过后生成安装包：

```powershell
npm run dist:installer
```

7. 查看安装包：

```powershell
Get-ChildItem .\release -Filter *.exe | Sort-Object LastWriteTime -Descending
```

## 打包命令说明

开发运行：

```powershell
npm run dev
```

源码构建：

```powershell
npm run build
```

生成免安装目录：

```powershell
npm run dist
```

生成 Windows 安装包：

```powershell
npm run dist:installer
```

安装包通常位于：

```text
D:\HC\release\HC AI 编程助手 Setup 0.0.0.exe
```

免安装主程序通常位于：

```text
D:\HC\release\win-unpacked\HC AI 编程助手.exe
```

## 当前注意事项

当前源码曾在 `npm run dist:installer` 的 `tsc -b` 阶段失败，错误集中在：

```text
src/App.tsx
```

如果后续要打包“当前源码最新版”，必须先修复 `src/App.tsx` 的 TypeScript/JSX 语法错误，再运行：

```powershell
npm run build
npm run dist:installer
```

不要只执行 `npx electron-builder` 来跳过源码构建，除非只是验证打包工具是否可用。直接执行 `npx electron-builder` 会使用已有的 `dist` 和 `dist-electron` 产物，可能不是当前源码最新版。

## 常见问题

### 1. Windows 提示未知发布者

这是因为当前安装包没有代码签名。本机测试可以忽略；正式分发需要购买或配置代码签名证书。

### 2. 打包时提示文件被占用

先关闭旧版应用：

```powershell
Get-Process | Where-Object { $_.Path -like 'D:\HC\release\win-unpacked\*' } | Stop-Process -Force -ErrorAction SilentlyContinue
```

然后重新打包：

```powershell
npm run dist:installer
```

### 3. 依赖异常

先尝试：

```powershell
npm install
npx electron-builder install-app-deps
```

再重新构建：

```powershell
npm run build
```

## 后续给 AI 的任务模板

```text
请先阅读 D:\HC\docs\AI-change-and-package-guide.md。

我要修改：
[写清楚你想改什么]

限制：
- 只修改必要文件
- 不改 node_modules、dist、dist-electron、release
- 不删除真实文件
- 不重置 git
- 修改后运行 npm run build
- 构建通过后运行 npm run dist:installer

最终回复请告诉我：
- 改了哪些文件
- 验证命令是否通过
- 安装包路径
- 还有哪些风险
```
