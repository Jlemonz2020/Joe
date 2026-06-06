# Phase 036 验证记录

## 命令验证

- `npm run typecheck`：通过，见 `typecheck-output.txt`
- `npm run build`：通过，生成 8 个静态页面，见 `build-output.txt`
- `npm audit --audit-level=moderate`：0 vulnerabilities，见 `npm-audit.txt`

## Playwright 验证

脚本：`verify-home-task-cards.mjs`

输出摘要见 `home-task-cards-summary.txt`：

- viewports：`390`、`1280`、`1920`
- cardCounts：每个视口均为 `3`
- oldInlineTicketCards：`0`
- actionsMinHeight：`44.00`
- reducedStatusAnimation：`none`
- pageOverflowX：全部为 `false`

截图：

- `screens/home-task-cards-390.png`
- `screens/home-task-cards-1280.png`
- `screens/home-task-cards-1920.png`
- `screens/home-task-cards-reduced-motion-1280.png`

## 文案检查

使用 `writing-guidelines` 抓取最新规则到 `writing-guidelines-command.md`。

扫描文件：

- `src/components/HomeTaskCards.astro`
- `src/styles/home-task-cards.css`

结果：`writing-guidelines-scan.txt` 无命中。

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

## 四级验证

- L1 EXISTS：组件、样式、截图、日志、源码快照和 dist 快照均存在。
- L2 SUBSTANTIVE：组件包含三张任务卡数据、标签、入口和语义结构。
- L3 WIRED：`index.astro` 引入组件，`BaseLayout.astro` 引入样式。
- L4 DATA FLOWS：Astro build 产物包含 `home-task-card`、`今日记录任务` 和三张卡文本。

## 结论

`approved`

进入 Phase 037 前不需要修正 Phase 036。
