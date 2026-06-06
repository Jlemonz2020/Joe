# Phase 037 Report - 首页项目预览

## Status

`approved`

## Scope

本阶段只实现首页项目预览，不修改完整项目页，不部署线上站点，不修改后端、数据库、Nginx 或旧静态目录。

## Changes

- 新增 `HomeProjectPreview.astro`。
- 新增 `home-project-preview.css`。
- 新增 `homeProjectPreviewRules.ts`。
- 首页在三张任务贴纸卡后插入 `<HomeProjectPreview />`。
- BaseLayout 引入本阶段样式。

## Reviewer Notes

- 审核人结论：`approved`
- 建议：Phase 038 最近瞬间不能做成项目档案卡，应改成便签、拍立得或聊天气泡动态，和 Phase 037 明显区分。

## Verification Evidence

- Typecheck: `artifacts/typecheck-output.txt`
- Build: `artifacts/build-output.txt`
- Audit: `artifacts/npm-audit.txt`
- Live projects: `artifacts/live-projects.json`
- Live projects summary: `artifacts/live-projects-summary.txt`
- Playwright summary: `artifacts/home-project-preview-summary.txt`
- Playwright state JSON: `artifacts/home-project-preview-state.json`
- Route matrix: `artifacts/route-matrix.txt`
- Static scan: `artifacts/static-scan.txt`
- Screenshot list: `artifacts/screenshot-file-check.txt`

## GitHub Push Evidence

- Main implementation commit: `f055bf8e88126a74d538aac534fd801a0b57a6b6`
- Push verification commit: `pending`
- Remote verification after implementation push: `f055bf8e88126a74d538aac534fd801a0b57a6b6 refs/heads/main`

## Archive

- Source snapshot: `artifacts/project-source/`
- Dist snapshot: `artifacts/dist-snapshot/`
- Checksums: `artifacts/project-source-sha256.txt` and `artifacts/dist-sha256.txt`

## Next Phase

Phase 038：首页最近瞬间。
