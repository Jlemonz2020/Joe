# Phase 037 首页项目预览设计说明

## 阶段目标

把首页项目预览做成粉色任务看板。有项目时显示任务档案卡，项目为空时显示赛蕾项目提示卡。当前线上 `/api/projects` 返回 `{"items":[]}`，所以空态是本阶段重点。

## 实现文件

- 组件：`src/components/HomeProjectPreview.astro`
- 样式：`src/styles/home-project-preview.css`
- 规则：`src/data/homeProjectPreviewRules.ts`
- 首页接入：`src/pages/index.astro`
- 全局样式接入：`src/layouts/BaseLayout.astro`

## 数据策略

- 客户端请求 `/api/projects`。
- 接受 `items`、`results`、`rows`、`data` 四类列表形状。
- 首页最多渲染 3 条项目。
- 不在生产源码里写项目测试数据。
- 对项目标题、摘要、标签、状态和 id 做 HTML 转义。
- 对项目 href 做本地路径过滤，异常时回退到 `/projects.html`。

## 视觉策略

- 区块标题使用 `PROJECT BOARD` 和 `项目进行中`。
- 有项目时卡片像任务档案：`TASK 01`、状态 badge、摘要、能量条、标签和档案入口。
- 空项目时复用 `EmptySaileiState`，使用 `PROJECT MEMO` ribbon。
- 任务档案卡使用左侧青粉渐变状态轨道，不复用 Phase 036 的贴纸卡模板。
- 移动端单列，大屏三列。

## 审核结论

`approved`

理由：空态不是生硬空白，有项目态也通过了三条任务档案验证。组件只接真实 API，生产源码不包含测试项目。
