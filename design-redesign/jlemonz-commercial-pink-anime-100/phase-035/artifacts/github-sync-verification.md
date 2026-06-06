# Phase 035 验证记录

## 命令验证

- `npm run typecheck`：通过，见 `typecheck-output.txt`
- `npm run build`：通过，生成 8 个静态页面，见 `build-output.txt`
- `npm audit --audit-level=moderate`：0 vulnerabilities，见 `npm-audit.txt`

## Live API 基线

来源：`curl -k -sS https://192.168.31.248:8086/api/github/contributions`

摘要见 `live-github-summary.txt`：

- username: `Jlemonz2020`
- total: `123`
- days: `365`
- firstDate: `2025-06-06`
- lastDate: `2026-06-05`
- levels: `0,1,2,4`

## Playwright 验证

脚本：`verify-github-sync.mjs`

输出摘要见 `github-sync-summary.txt`：

- 使用 Microsoft Edge：`/usr/bin/microsoft-edge`
- ready viewports：`390`、`1280`、`1920`
- ready cells：每个视口均为 `98`
- fallback cells：`49`
- reduced motion：cell 和 status animation 均为 `none`
- pageOverflowX：全部为 `false`

截图：

- `screens/github-sync-ready-390.png`
- `screens/github-sync-ready-1280.png`
- `screens/github-sync-ready-1920.png`
- `screens/github-sync-fallback-390.png`
- `screens/github-sync-reduced-motion-1280.png`

## 路由矩阵

脚本：`verify-route-matrix.sh`

全部返回 `200`：

- `/`
- `/index.html`
- `/moments.html`
- `/archive.html`
- `/projects.html`
- `/project.html`
- `/post.html`
- `/about.html`
- `/status-lab.html`

## 静态扫描

`static-scan.txt` 无命中：

- `TODO`
- `FIXME`
- `debugger`
- `console.log`
- `#000`
- 敏感密码样式关键词
- 常见运行时错误文案

## 四级验证

- L1 EXISTS：组件、样式、规则文件、截图、日志均存在。
- L2 SUBSTANTIVE：组件包含 fetch、ready 渲染、fallback 渲染、数据裁剪和等级限制。
- L3 WIRED：`BaseLayout.astro` 引入样式，`index.astro` 引入组件，组件引入 `githubSyncRules`。
- L4 DATA FLOWS：Playwright 使用 live API 快照渲染 ready 状态，失败路由渲染 fallback 状态。

## 结论

`approved`

进入 Phase 036 前不需要修正 Phase 035。
