# Phase 038 首页最近瞬间设计说明

## 阶段目标

把首页最近瞬间做成便签和拍立得动态流。它需要和 Phase 037 的项目任务档案明显区分，不能变成另一组任务卡。

## 实现文件

- 组件：`src/components/HomeMomentPreview.astro`
- 样式：`src/styles/home-moment-preview.css`
- 规则：`src/data/homeMomentPreviewRules.ts`
- 首页接入：`src/pages/index.astro`
- 全局样式接入：`src/layouts/BaseLayout.astro`

## 数据策略

- 客户端请求 `/api/moments`。
- 接受 `items`、`results`、`rows`、`data` 四类列表形状。
- 首页最多渲染 3 条瞬间。
- 有图片时渲染拍立得卡。
- 无图片时渲染便签卡。
- 图片只允许 `/uploads/` 和 `/assets/` 路径。
- 图片使用 `object-fit: contain`，避免裁坏。

## 视觉策略

- 区块标题使用 `MOMENT NOTES` 和 `最近瞬间`。
- 卡片使用 `NOTE 01`、日记时间戳、kind 标签和手帐贴纸标签。
- 图片卡使用拍立得内框，留白和阴影更像照片贴纸。
- 空态复用 `EmptySaileiState`，文案为时间线暂时安静。
- 移动端单列，大屏最多三列。

## 审核结论

`approved`

理由：live 数据带图，截图中图片完整显示，移动端文字不溢出，空态和多条 fixture 均通过。
