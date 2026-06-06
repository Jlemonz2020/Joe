# Phase 039 首页分类入口设计说明

## 阶段目标

把首页分类入口做成粉色贴纸目录，而不是普通 pill 或列表。分类固定为 Linux、硬件/裸机、RTOS、生活。

## 实现文件

- 组件：`src/components/HomeCategoryStickers.astro`
- 样式：`src/styles/home-category-stickers.css`
- 规则：`src/data/homeCategoryRules.ts`
- 首页接入：`src/pages/index.astro`
- 全局样式接入：`src/layouts/BaseLayout.astro`

## 分类和入口

- Linux：`/archive.html?category=Linux`
- 硬件/裸机：`/projects.html`
- RTOS：`/archive.html?category=RTOS`
- 生活：`/moments.html?kind=life`

## 视觉策略

- 区块标题使用 `CATEGORY STICKERS` 和 `分类入口`。
- 每张贴纸有序号、代码、标题和说明。
- 四个分类有独立 accent：青蓝、樱粉、淡金、日常粉。
- 整张贴纸都是链接，移动端触控区域足够大。
- 布局移动端单列，720px 以上双列，1280px 以上四列。

## 审核结论

`approved`

理由：分类入口已经从普通入口变成贴纸目录，四个分类清晰，无“新分类”，移动端不挤。
