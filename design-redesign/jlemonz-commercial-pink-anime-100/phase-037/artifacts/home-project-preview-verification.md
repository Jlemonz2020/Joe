# Phase 037 验证记录

## 命令验证

- `npm run typecheck`：通过，见 `typecheck-output.txt`
- `npm run build`：通过，生成 8 个静态页面，见 `build-output.txt`
- `npm audit --audit-level=moderate`：0 vulnerabilities，见 `npm-audit.txt`

## Live API 基线

来源：`curl -k -sS https://192.168.31.248:8086/api/projects`

摘要见 `live-projects-summary.txt`：

- items: `0`
- shape: `items-array`

## Playwright 验证

脚本：`verify-home-project-preview.mjs`

输出摘要见 `home-project-preview-summary.txt`：

- empty viewports：`390`、`1280`、`1920`
- ready viewports：`390`、`1280`、`1920`
- liveProjectItems：`0`
- emptyCardCounts：每个视口均为 `0`
- readyCardCounts：每个视口均为 `3`
- readyLinksMinHeight：`44.00`
- reducedStatusAnimation：`none`
- pageOverflowX：全部为 `false`

截图：

- `screens/home-project-empty-390.png`
- `screens/home-project-empty-1280.png`
- `screens/home-project-empty-1920.png`
- `screens/home-project-ready-390.png`
- `screens/home-project-ready-1280.png`
- `screens/home-project-ready-1920.png`
- `screens/home-project-reduced-motion-1280.png`

## 路由矩阵

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

## 四级验证

- L1 EXISTS：组件、样式、规则文件、截图、日志、源码快照和 dist 快照均存在。
- L2 SUBSTANTIVE：组件包含 fetch、列表归一、空态、最多 3 条限制、转义和 href 过滤。
- L3 WIRED：`index.astro` 引入组件，`BaseLayout.astro` 引入样式，组件引入规则文件。
- L4 DATA FLOWS：live 空项目数据进入 empty 状态，测试项目数据进入 ready 状态并渲染 3 张任务档案。

## 结论

`approved`

进入 Phase 038 前不需要修正 Phase 037。
