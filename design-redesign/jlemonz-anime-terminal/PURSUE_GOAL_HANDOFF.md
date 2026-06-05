# Pursue Goal Handoff: Jlemonz 二次元大改

## Goal Objective

```text
根据 /data/sites/blog/html/ANIME_REDESIGN_PROMPT.md，对 Jlemonz 个人站做真正的二次元大改。

这不是小修小补。不要只改颜色、阴影、圆角或背景图。必须让二次元感进入每一个主要组件：Header、Hero、状态卡、项目卡、瞬间时间线、笔记资料库、项目任务面板、关于资料页、搜索弹层、页脚、空状态和移动端。

保留现有静态站结构、URL、API、后台、数据库和赛蕾图片资产。优先修改 /data/sites/blog/html/assets/style.css，必要时小改 HTML 和 assets/app.js。每个阶段都要备份、实现、截图验证、接口验证，再进入下一阶段。

最终验收标准：打开首页第一屏就能明显感到“二次元技术日记站”，而不是普通技术博客套一张二次元背景。
```

## Required Reading

Pursue goal 执行前必须先读取：

- `/data/sites/blog/html/ANIME_REDESIGN_PROMPT.md`
- `/data/sites/blog/html/index.html`
- `/data/sites/blog/html/moments.html`
- `/data/sites/blog/html/archive.html`
- `/data/sites/blog/html/projects.html`
- `/data/sites/blog/html/about.html`
- `/data/sites/blog/html/assets/style.css`
- `/data/sites/blog/html/assets/app.js`

## Required Backup

执行前必须备份：

- `/data/sites/blog/html`
- `/data/sites/blog/html/assets/style.css`
- `/data/sites/blog/html/assets/app.js`
- `/data/sites/blog/html/*.html`

备份命名建议：

```bash
/data/sites/blog/html-backup-YYYYMMDD-HHMMSS-before-anime-terminal
```

## Required Tools / Skills

执行前先检查这些能力：

- Shell / SSH / SCP：读取、备份、上传、验证线上文件。
- Browser skill / in-app browser：页面交互检查和截图，必须用于视觉验收。
- curl：接口、静态资源、状态码验证。
- rg：搜索 HTML/CSS/JS 残留和组件 class。
- Headless Edge/Chromium：多尺寸截图；如果不可用，用 Browser skill 替代。
- git + GitHub 认证：每阶段把最终档提交到 `Jlemonz2020/Joe`；推送可用 HTTPS Token、SSH key 或 `gh auth login`。

按需使用：

- imagegen skill：仅当需要生成本地贴纸、空状态、轻量纹理资产时使用。
- Figma MCP：只有用户明确要求设计稿或 Figma 同步时使用。
- Web search：只用于提炼 GitHub/二次元/热门 UI 思路，不复制外部素材。
- GitHub CLI (`gh`)：仅当没有可用 Token/SSH key 且用户选择交互登录时安装。

缺少必要工具时：

1. 轻量系统工具直接安装或下载。
2. 记录工具名和用途。
3. 安装失败时找同等能力替代。
4. 不因为工具缺失把大改降级成小改。

## Execution Order

1. 全局视觉系统：CSS token、Header、desk-card、按钮、输入框、标签、空状态。
2. 首页大改：Hero、状态卡、项目预览、最近瞬间、分类入口、moyu-widget、stats-card。
3. 内容页分离：瞬间页做动态流，笔记页做资料库。
4. 项目/详情/关于：项目任务终端、项目详情档案、笔记阅读档案、关于资料页。
5. 搜索/页脚/功能回归：搜索弹层、页脚场景、评论、点赞、GitHub 热力图。
6. 响应式修正：390、768、1280、1920、2560、3840 宽度检查。

## Review / Archive / GitHub Rule

每个阶段都必须经过审核、修正、归档，不能直接跳到下一阶段。

阶段流程：

1. 完成本阶段实现和截图验证。
2. 生成阶段最终档，放到 `/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/bug-check/reports/`。
3. 上传阶段最终档到 `/data/sites/blog/html/reports/`。
4. 交给审核人审核，审核结论只能是 `approved`、`approved-with-fixes`、`rework-required`。
5. 如果是 `rework-required`，必须回修并重新审核。
6. 如果是 `approved-with-fixes`，下一阶段第一步必须先修复审核意见。
7. 阶段最终档必须上传到 GitHub 仓库 `Jlemonz2020/Joe` 的 `design-redesign/jlemonz-anime-terminal/` 目录。

GitHub 本地仓库建议：

```text
/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe
```

当前机器建议使用 GitHub SSH over 443：

```bash
git remote set-url origin ssh://git@ssh.github.com:443/Jlemonz2020/Joe.git
```

阶段提交建议：

```bash
git add design-redesign/jlemonz-anime-terminal
git commit -m "docs: archive anime redesign phase XX"
git push
```

如果 GitHub 推送缺少账号、Token 或 SSH key：

- 不要声称上传成功。
- 阶段报告里写 `GitHub upload: blocked`。
- 说明具体阻塞和下一步命令。
- 本地归档和站点归档仍然要完成。

## Do Not

- 不做站内签到/打卡功能。
- 不换框架。
- 不改数据库。
- 不改后台。
- 不破坏 API。
- 不新增版权不明外链图片。
- 不只做小改色或普通卡片美化。

## Done Means

- 首页第一屏明显二次元。
- 二次元感来自组件，不只是背景。
- `瞬间` 和 `笔记` 视觉上明显不同。
- 至少 10 种二次元组件细节落地。
- 主要页面和 API 验证通过。
- 手机和大屏无明显布局问题。
- 每阶段审核通过，并完成 GitHub 阶段归档。
