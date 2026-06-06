# Phase 036 首页三张状态任务卡设计说明

## 阶段目标

把首页原来的三张普通状态卡重做成粉色赛蕾手帐里的任务贴纸卡。目标不是换颜色，而是让 RECAP、TRACE、DAILY 像真实栏目入口：有编号、有状态、有标签、有行动入口。

## 实现文件

- 组件：`src/components/HomeTaskCards.astro`
- 样式：`src/styles/home-task-cards.css`
- 首页接入：`src/pages/index.astro`
- 全局样式接入：`src/layouts/BaseLayout.astro`

## 文案角色

- `FILE 01 / RECAP`：复盘档案，链接到 `/archive.html`
- `FILE 02 / TRACE`：现场线索，链接到 `/projects.html`
- `FILE 03 / DAILY`：日常碎片，链接到 `/moments.html`

文案保留现有意思，但删除普通占位卡的模板感。每张卡都有短标题、正文、三个贴纸标签和一个 44px 以上的入口。

## 视觉策略

- 使用 `MISSION STICKERS` 和 `今日记录任务` 建立栏目感。
- 每张卡使用 FILE 编号、状态灯、胶带、票根齿边和贴纸标签。
- RECAP 使用樱粉，TRACE 使用青蓝，DAILY 使用淡金，让三张卡有角色区分。
- 卡片 hover 只做轻微浮起，不做夸张动画。
- reduced-motion 下关闭状态灯动画和卡片过渡。

## 响应式策略

- 移动端单列，内容完整展示。
- 768px 以上三列排列。
- 入口按钮最小高度为 `2.75rem`，Playwright 实测 `44px`。
- 文本使用 `overflow-wrap: anywhere`，避免长词撑开卡片。

## 审核结论

`approved`

理由：三张卡已经从普通面板变成任务贴纸卡，有栏目身份和操作入口。大屏、移动端都无横向溢出。
