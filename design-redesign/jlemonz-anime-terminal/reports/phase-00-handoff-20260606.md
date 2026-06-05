# Phase 00 - Handoff, Review Rules, and GitHub Archive Setup

## Objective

把二次元大改从“口头要求”升级成 Pursue goal 可以持续执行的项目手册，并补齐每阶段审核、修正、归档、GitHub 上传规则。

## Phase Scope

- 页面：暂不修改线上页面视觉。
- 组件：暂不修改组件。
- 文件：`ANIME_REDESIGN_PROMPT.md`、`PURSUE_GOAL_HANDOFF.md`、`reports/PHASE_REVIEW_TEMPLATE.md`。
- 不修改范围：不改后台、不改数据库、不改 API、不切换框架。

## Required Skills / Tools

- Shell / SSH / SCP：同步 Markdown 到 Pi5 站点目录。
- curl：验证文档 URL 和 GitHub 仓库可访问。
- rg：检查主提示词章节和关键规则。
- git：检查 GitHub 仓库可读，准备阶段归档上传。
- Browser skill / in-app browser：后续视觉阶段必用，本阶段不需要截图审核。

## Changed Files

- `/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/bug-check/ANIME_REDESIGN_PROMPT.md`：新增阶段审核、修正、线上归档、GitHub 上传、最终归档规则。
- `/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/bug-check/PURSUE_GOAL_HANDOFF.md`：补充每阶段必须审核和上传 GitHub 的硬规则。
- `/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/bug-check/reports/PHASE_REVIEW_TEMPLATE.md`：新增阶段审核模板。

## Visual Evidence

本阶段是执行手册阶段，不产出页面截图。Phase 01 开始必须提供 390、768、1280、1920、2560、3840 宽度截图。

## Functional Checks

- GitHub 仓库页面：`https://github.com/Jlemonz2020/Joe` 可访问。
- GitHub 仓库 heads：`git ls-remote --heads https://github.com/Jlemonz2020/Joe.git` 可读取。
- GitHub 本地提交：已创建。
- GitHub SSH 认证：`ssh.github.com:443` 可用，返回 `Hi Jlemonz2020! You've successfully authenticated`。
- GitHub push：使用 SSH over 443 推送。
- 线上 Markdown：待上传后用 `curl -k -I` 验证。

## Anime Quality Check

- 是否第一眼二次元：本阶段只写规则，不验收视觉。
- 是否不只靠背景图：已写入主提示词硬性要求。
- 是否新增组件语言：已写入主提示词和页面级要求。
- 是否保留可读性：已写入验收标准。
- `瞬间` 和 `笔记` 是否明显区分：已写入页面改造要求。
- 大屏是否自然：已写入响应式验收宽度。
- 移动端是否无横向滚动：已写入质量门槛。

## Reviewer

- 审核人：待用户或指定审核人审核。
- 审核时间：待审核。
- 审核结论：`approved-with-fixes`

## Reviewer Notes

- 用户明确要求：不是小打小闹，要大改，二次元优先。
- 用户明确要求：每个环节需要什么 skills / MCP / tools 都要写清楚，缺什么就安装下载。
- 用户明确要求：每个阶段需要审核人审核，给出建议，下一阶段改正。
- 用户明确要求：每个阶段最终档上传到 GitHub 仓库 `Jlemonz2020/Joe`。

## Must Fix Before Next Phase

- 后续阶段统一使用 GitHub SSH over 443 remote：`ssh://git@ssh.github.com:443/Jlemonz2020/Joe.git`。
- Phase 01 阶段报告必须记录对应 GitHub commit。
- Phase 01 开始必须先读本报告和主提示词。

## Next Phase Correction Plan

Phase 01 开始前：

1. 拉取或准备 GitHub 仓库本地副本。
2. 确认是否能 push 到 `Jlemonz2020/Joe`。
3. 若可以 push，把 Phase 00 文档归档到 `design-redesign/jlemonz-anime-terminal/`。
4. 若不能 push，先完成本地与站点归档，并把 GitHub 阻塞写入阶段报告。
5. 然后再进入全局视觉系统大改。

## Archive

- Local report：`/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/bug-check/reports/phase-00-handoff-20260606.md`
- Site report：`/data/sites/blog/html/reports/phase-00-handoff-20260606.md`
- GitHub path：`design-redesign/jlemonz-anime-terminal/phase-00-handoff-20260606.md`
- GitHub commit：this Phase 00 archive commit.
- GitHub upload status：`uploaded`
