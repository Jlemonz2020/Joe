# Pursue Goal Handoff: Jlemonz 粉色赛蕾手帐二次元改版

## Current Status

Pursue goal 暂停。不要自动开始实现、不要上线 CSS、不要关机。

只有用户再次明确说“开始执行 / 开启 Pursue goal / 按 MD 执行”时，才根据 `/data/sites/blog/html/ANIME_REDESIGN_PROMPT.md` 开始 20 阶段执行。

## Goal Objective

```text
把 Jlemonz 个人站改成粉色系赛蕾手帐二次元个人站。

默认主题是 sailei-pink-diary：樱粉、奶白、浅紫、透明粉玻璃、贴纸、拍立得、galgame 对话框、二次元日记本和柔和 HUD。

禁止整站黑底压暗，禁止黑色终端化，禁止只改颜色或只靠背景图。
```

## Required Reading

执行前必须读取：

- `/data/sites/blog/html/ANIME_REDESIGN_PROMPT.md`
- `/data/sites/blog/html/reports/PHASE_REVIEW_TEMPLATE.md`
- `/data/sites/blog/html/index.html`
- `/data/sites/blog/html/moments.html`
- `/data/sites/blog/html/archive.html`
- `/data/sites/blog/html/projects.html`
- `/data/sites/blog/html/project.html`
- `/data/sites/blog/html/post.html`
- `/data/sites/blog/html/about.html`
- `/data/sites/blog/html/assets/style.css`
- `/data/sites/blog/html/assets/app.js`

## Execution Rules

- 必须按 20 个阶段执行，不能合并成一次大改。
- 每阶段先备份，再实现，再截图，再审核，再归档 GitHub。
- 每阶段报告必须上传到：
  - `/data/sites/blog/html/reports/`
  - `Jlemonz2020/Joe/design-redesign/jlemonz-pink-diary/reports/`
- 下一阶段必须先处理上一阶段的 `Must Fix Before Next Phase`。
- 如果上一阶段是 `rework-required`，不能进入下一阶段。

## Required Tools / Skills

全程必用：

- Shell
- SSH / SCP / rsync
- rg
- curl
- git
- Microsoft Edge headless 或 Browser skill

按需使用：

- imagegen skill：只生成本地贴纸、空状态、手帐装饰。
- Figma MCP：只有用户明确要求设计稿时使用。
- Web search：只提炼思路，不复制外部素材。
- ImageMagick / sharp / cwebp：只压缩新图片。
- Node：只做 JS 语法和轻量检查。

GitHub remote：

```bash
git remote set-url origin ssh://git@ssh.github.com:443/Jlemonz2020/Joe.git
```

GitHub 归档目录：

```text
design-redesign/jlemonz-pink-diary/
```

## 20 Phase Order

1. Phase 00：回退黑色草稿与重写手册。
2. Phase 01：粉色设计系统 token。
3. Phase 02：全局背景和固定赛蕾。
4. Phase 03：Header 粉色 HUD 顶栏。
5. Phase 04：首页 Hero galgame 主屏。
6. Phase 05：首页 RECAP / TRACE / DAILY。
7. Phase 06：GitHub 同步频率手帐格。
8. Phase 07：首页项目任务看板。
9. Phase 08：首页最近瞬间。
10. Phase 09：分类贴纸目录。
11. Phase 10：瞬间页粉色动态频道。
12. Phase 11：笔记页资料库索引。
13. Phase 12：项目页粉色任务档案。
14. Phase 13：项目详情任务卡。
15. Phase 14：文章详情阅读手帐。
16. Phase 15：关于页角色资料卡。
17. Phase 16：搜索资料检索面板。
18. Phase 17：页脚收尾小场景。
19. Phase 18：统一空状态与动态降级。
20. Phase 19：全尺寸审核、修正、最终归档。

## Do Not

- 不做站内签到功能。
- 不换框架。
- 不改数据库。
- 不改后台。
- 不破坏 API。
- 不新增版权不明外链图片。
- 不上线黑色终端草稿。
- 不在用户未明确要求前开启 Pursue goal。
- 不在用户未明确要求前关机。

## Done Means

- 默认视觉是粉色赛蕾手帐。
- 二次元感来自组件，不只是背景。
- `瞬间` 和 `笔记` 视觉明显不同。
- 首页、项目、关于、搜索、空状态都有粉色二次元组件语言。
- 390、768、1280、1920、2560、3840 截图通过。
- 搜索、评论、点赞、GitHub 热力图不坏。
- 每阶段报告已审核并推送 GitHub。

