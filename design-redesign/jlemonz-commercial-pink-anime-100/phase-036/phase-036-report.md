# Phase 036 Report - 首页三张状态任务卡

## Status

`approved`

## Scope

本阶段只修改首页三张状态卡。没有部署线上站点，没有修改后端、数据库、Nginx 或旧静态目录。

## Changes

- 新增 `HomeTaskCards.astro`。
- 新增 `home-task-cards.css`。
- 首页删除旧的 `module-grid` 三张普通内联卡，改为 `<HomeTaskCards />`。
- BaseLayout 引入本阶段样式。
- 三张卡改为 `FILE 01 / RECAP`、`FILE 02 / TRACE`、`FILE 03 / DAILY`。

## Reviewer Notes

- 审核人结论：`approved`
- 建议：Phase 037 的项目预览需要继续拉开组件识别度。项目卡要像任务档案，不要复用 Phase 036 的三卡模板。

## Verification Evidence

- Typecheck: `artifacts/typecheck-output.txt`
- Build: `artifacts/build-output.txt`
- Audit: `artifacts/npm-audit.txt`
- Playwright summary: `artifacts/home-task-cards-summary.txt`
- Playwright state JSON: `artifacts/home-task-cards-state.json`
- Route matrix: `artifacts/route-matrix.txt`
- Static scan: `artifacts/static-scan.txt`
- Writing scan: `artifacts/writing-guidelines-scan.txt`
- Screenshot list: `artifacts/screenshot-file-check.txt`

## GitHub Push Evidence

- Main implementation commit: `5143f18a8c22271b5ac4c31464c6ea49e030b93c`
- Push verification commit: `pending`
- Remote verification after implementation push: `5143f18a8c22271b5ac4c31464c6ea49e030b93c refs/heads/main`

## Archive

- Source snapshot: `artifacts/project-source/`
- Dist snapshot: `artifacts/dist-snapshot/`
- Checksums: `artifacts/project-source-sha256.txt` and `artifacts/dist-sha256.txt`

## Next Phase

Phase 037：首页项目预览。
