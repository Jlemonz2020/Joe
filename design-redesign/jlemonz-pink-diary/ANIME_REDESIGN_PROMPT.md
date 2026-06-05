# Jlemonz 粉色赛蕾手帐二次元改版提示词

> 当前文件只负责规划和交接。不要自动开始 Pursue goal，不要上线 CSS，不要关机。只有用户再次明确说“开始执行 / 开启 Pursue goal / 按 MD 执行”时，才进入实现阶段。

## 0. Pursue Goal 主提示词

把下面这段作为后续 Pursue goal 的目标描述：

```text
根据 /data/sites/blog/html/ANIME_REDESIGN_PROMPT.md，把 Jlemonz 个人站改成粉色系赛蕾手帐二次元个人站。

这不是黑色终端站，也不是普通博客加背景图。默认主题必须是 sailei-pink-diary：樱粉、奶白、浅紫、透明粉玻璃、贴纸、拍立得、galgame 对话框、二次元日记本和柔和 HUD。技术记录仍要清晰可读，但视觉优先级是二次元手帐感。

保留现有静态 HTML、CSS、原生 JS、URL、后端 API、后台、数据库和赛蕾素材。按 20 个阶段执行，每阶段都要截图、审核、修正、生成阶段报告，并上传到 GitHub 仓库 Jlemonz2020/Joe 的 design-redesign/jlemonz-pink-diary/。

禁止整站黑底压暗，禁止只改颜色，禁止只加阴影，禁止只靠背景图，禁止新增版权不明外链图片。
```

## 1. 当前项目事实

- 线上静态目录：`/data/sites/blog/html`
- 本地工作区：`/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2`
- 主要页面：`index.html`、`moments.html`、`archive.html`、`projects.html`、`project.html`、`post.html`、`about.html`
- 核心文件：`assets/style.css`、`assets/app.js`
- 站点仍由 Nginx 静态托管，`/api/` 反代到现有后端。
- 不改数据库，不改后台，不换 Astro/React/Vue，不重写 API。
- 现有赛蕾资产继续使用：
  - `/assets/sailei/sailei-main.jpg`
  - `/assets/sailei/avatar.jpg`
  - `/assets/sailei/note-1.jpg`
  - `/assets/sailei/note-2.jpg`
  - `/assets/sailei/side-illustration.jpg`
  - `/assets/sailei/side-photo.jpg`
  - `/assets/sailei/*-hero*.jpg`
  - `/assets/brand/jlemonz-logo.png`
- 已确认黑色终端草稿没有上传线上，也没有推 GitHub；本地草稿已隔离为废弃参考，不作为实现源。

## 2. 视觉硬约束

默认主题：`sailei-pink-diary`

可选主题：

- `sakura-light`：更亮的樱花白粉。
- `pink-neon-lite`：少量粉紫霓虹，但不得变成黑色赛博站。
- `paper-milk`：奶白纸张、浅粉描边、手帐阅读感。

主视觉关键词：

- 粉色赛蕾手帐
- galgame 对话框
- 樱粉透明玻璃
- 奶白纸张面板
- 浅紫阴影
- 拍立得图片
- 贴纸标签
- 胶带、票根、角标
- 柔和 HUD 细线
- 技术日记和个人记录

禁止：

- 整站黑色底、深紫压暗、黑色终端化。
- 用大面积渐变球、发光球、bokeh blob 当背景装饰。
- 只改色、只改阴影、只换背景图。
- 牺牲正文可读性。
- 引入重型动画库。
- 使用外链图片或版权不明素材。

## 3. 粉色设计系统基准

后续实现时优先追加 CSS 覆盖段，不大规模重写 HTML。

建议 CSS token：

```css
:root {
  --pink-bg: #fff7fb;
  --pink-bg-soft: #ffeef7;
  --pink-panel: rgba(255, 248, 252, .78);
  --pink-panel-strong: rgba(255, 241, 249, .92);
  --pink-line: rgba(255, 143, 190, .42);
  --pink-line-strong: rgba(238, 92, 160, .58);
  --pink-text: #442336;
  --pink-muted: #8f6378;
  --pink-primary: #ff79b6;
  --pink-sakura: #ffb7d8;
  --pink-lavender: #c9a6ff;
  --pink-cyan: #6edff6;
  --pink-gold: #ffd782;
  --pink-shadow: 0 18px 42px rgba(255, 117, 178, .18);
  --pink-radius: 10px;
}
```

组件语言要求：

- 面板是粉白玻璃或奶白纸张，不是黑玻璃。
- 边框是樱粉/浅紫细线，hover 可以有柔光。
- 导航像贴纸胶囊，当前页像粉色选中贴纸。
- 任务卡像手帐票据，不能像企业后台卡片。
- 瞬间像便签/聊天气泡/拍立得。
- 笔记像资料库索引/笔记本目录，和瞬间明显不同。
- 项目像粉色任务板，保留技术属性但不压暗。
- 空状态像赛蕾提示卡。

## 4. 文件修改策略

优先级：

1. `assets/style.css`：追加粉色二次元组件层。
2. `assets/app.js`：只在动态 markup 必须增加 class、空状态、版本缓存时小改。
3. HTML：只做必要结构补充和版本参数更新。
4. 不改后端、不改数据库、不改 Nginx，除非用户另行要求。

每次执行前必须备份：

```bash
/data/sites/blog/html
/data/sites/blog/html/assets/style.css
/data/sites/blog/html/assets/app.js
/data/sites/blog/html/*.html
```

备份命名：

```text
/data/sites/blog/html-backup-YYYYMMDD-HHMMSS-before-pink-diary-phaseXX
```

版本参数：

- CSS/JS 上线时使用新版本参数，例如 `pink-diary-phaseXX-YYYYMMDD`。
- `SITE_TEXT_CACHE_KEY` 每次文案或 UI 文本结构调整时递增。

## 5. Skills / MCP / Tools 总规则

全程必用：

- Shell：文件检查、备份、同步、验证。
- SSH/SCP/rsync：连接 Pi5、同步静态目录。
- `rg`：搜索 class、文案、版本号、旧黑色变量。
- `curl`：验证页面、API、静态资源。
- `git`：阶段报告上传 GitHub。
- Microsoft Edge headless 或 Browser skill：截图和视觉检查。

按需使用：

- `imagegen` skill：仅生成本地贴纸、空状态、轻量纹理、手帐装饰位图；必须保存到本地资产目录。
- Figma MCP：只有用户明确要求设计稿或 Figma 同步时使用。
- Web search：只提炼 GitHub/二次元/抖音热门 UI 思路，不复制素材。
- ImageMagick / sharp / cwebp：仅用于压缩新生成图片。
- Node：只做 JS 语法检查和轻量脚本。

缺工具规则：

- 轻量必需工具缺失时先安装或下载。
- 安装失败时找等价替代。
- 不得因为工具缺失把大改降级成小改。
- 工具安装、用途和替代方案必须写入阶段报告。

GitHub remote：

```bash
git remote set-url origin ssh://git@ssh.github.com:443/Jlemonz2020/Joe.git
```

GitHub 归档目录：

```text
design-redesign/jlemonz-pink-diary/
```

## 6. 阶段审核与归档规则

每个阶段必须产出 Markdown 报告：

```text
phase-XX-short-name-YYYYMMDD.md
```

本地报告路径：

```text
/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/bug-check/reports/
```

线上报告路径：

```text
/data/sites/blog/html/reports/
```

GitHub 报告路径：

```text
Jlemonz2020/Joe/design-redesign/jlemonz-pink-diary/reports/
```

审核结论只能是：

- `approved`
- `approved-with-fixes`
- `rework-required`

进入下一阶段前必须读取上一阶段：

- `Reviewer Notes`
- `Must Fix Before Next Phase`
- `Next Phase Correction Plan`

如果上一阶段是 `rework-required`，不得进入下一阶段。
如果上一阶段是 `approved-with-fixes`，下一阶段第一步必须先修复建议。

## 7. 20 阶段超细任务单

### Phase 00：回退黑色草稿与重写手册

- 目标：废弃本地黑色终端草稿，重写本 MD、handoff 和报告模板。
- 范围：只改 Markdown，不改线上 CSS/JS/HTML。
- 必用工具：Shell、rg、curl、git、SSH/SCP。
- 检查项：线上 `assets/style.css` 不包含 `Anime terminal redesign 2026-06-06`、`--anime-bg`、`anime-pursue-20260606`。
- 截图：本阶段不需要页面截图。
- 审核重点：方向是否明确粉色手帐，是否明确暂停 Pursue goal。
- GitHub：上传到 `design-redesign/jlemonz-pink-diary/`。

### Phase 01：粉色设计系统 token

- 目标：建立粉色 CSS 变量、基础字体、阴影、边框、动效强度。
- 范围：`assets/style.css` 末尾新增 `Pink diary design system` 覆盖段。
- 必用工具：rg、Node/静态检查、Edge 1280 截图。
- 具体要求：变量必须偏浅粉/奶白/浅紫；不得出现整站黑底 token。
- 验收：页面整体仍明亮，正文文字可读，hover 有柔光。
- 审核重点：是否从底层杜绝黑色终端化。

### Phase 02：全局背景和固定赛蕾

- 目标：背景固定，但改成浅粉玻璃层，而不是深色遮罩。
- 范围：`body`、`body::before`、`.hero-bg`、`.subpage::before`。
- 必用工具：Edge 390/1280/1920 截图、curl。
- 具体要求：赛蕾背景不随滚轮移动；内容正常滚动；手机不横向滚动。
- 验收：背景柔和可见，不遮挡文字，不发灰发黑。

### Phase 03：Header 粉色 HUD 顶栏

- 目标：把 Header 做成粉色 HUD + 贴纸导航。
- 范围：`.site-header`、`.brand`、`.nav-links`、`.nav-actions`。
- 必用工具：Browser/Edge 390/1280 截图。
- 具体要求：Logo 像角色铭牌；导航当前页像粉色贴纸；搜索/主题/联系按钮像小工具。
- 验收：移动端导航不挤压，不横滚；桌面顶栏不黑。

### Phase 04：首页 Hero galgame 主屏

- 目标：首页第一屏变成赛蕾陪伴感主屏。
- 范围：`.hero-home`、`.hero-copy`、`.lead`、`.hero-frequency-card`。
- 必用工具：Edge 390/1280/1920 截图。
- 具体要求：标题在粉白 galgame 对话框或手帐面板里；首屏要露出下一节一点内容。
- 验收：第一眼就是粉色二次元个人站，不是暗色技术博客。

### Phase 05：首页 RECAP / TRACE / DAILY

- 目标：三张状态卡变成粉色任务贴纸卡。
- 范围：`.status-strip`、`.status-note`、`.pulse-note`。
- 必用工具：Edge 390/1280 截图。
- 具体要求：`FILE 01/02/03`、状态灯、胶带、票根角标；文案保留当前意思。
- 验收：三卡像栏目，不像占位。

### Phase 06：GitHub 同步频率手帐格

- 目标：热力图改成粉色同步频率模块。
- 范围：`.github-calendar`、`.heatmap`、`.hero-frequency-card`。
- 必用工具：curl `/api/github/contributions`、Edge 1280 截图。
- 具体要求：浅粉透明面板，格子像手帐打点，不出现灰白硬块。
- 验收：API 失败时显示温柔降级文案。

### Phase 07：首页项目任务看板

- 目标：项目预览变成粉色任务看板。
- 范围：`.project-list`、`.project-row`、`.rangeWrapper`。
- 必用工具：curl `/api/projects`、Edge 1280 截图。
- 具体要求：项目卡有任务编号、状态 badge、粉色能量条。
- 验收：空项目显示赛蕾提示卡。

### Phase 08：首页最近瞬间

- 目标：最近瞬间改成便签/拍立得动态流。
- 范围：`.moment-preview`、`.moment-list.compact`、`.moment-item`。
- 必用工具：curl `/api/site/overview`、Edge 1280 截图。
- 具体要求：时间戳像日记，标签像小贴纸，有图时拍立得。
- 验收：首页瞬间和项目视觉不同。

### Phase 09：分类贴纸目录

- 目标：分类入口做成贴纸目录。
- 范围：`.category-card`、`[data-home-categories]`、archive 分类渲染。
- 必用工具：rg、Edge 390/1280 截图。
- 具体要求：Linux、硬件/裸机、RTOS、生活有不同小图标/颜色。
- 验收：隐藏无意义新分类；点击区域足够大。

### Phase 10：瞬间页粉色动态频道

- 目标：瞬间页变成短动态频道。
- 范围：`moments.html`、`.moments-hero`、`.timeline`、`.moment-item`。
- 必用工具：curl `/api/moments`、Edge 390/1280/1920 截图。
- 具体要求：碎片/项目/生活频道切换像贴纸 tab；时间线有粉色轨道节点。
- 验收：不看导航也知道这是“瞬间”。

### Phase 11：笔记页资料库索引

- 目标：笔记页和瞬间页彻底区分。
- 范围：`archive.html`、`.article-row`、`.filter-card`、`.github-card`。
- 必用工具：curl `/api/posts`、本地搜索输入测试、Edge 1280 截图。
- 具体要求：长文/调试/学习像资料分类；列表像资料库索引，不做时间线。
- 验收：不看导航也知道这是“笔记”。

### Phase 12：项目页粉色任务档案

- 目标：项目页变成任务档案板，但整体粉色轻 HUD。
- 范围：`projects.html`、`.project-board`、`.project-tile`、`.roadmap`。
- 必用工具：curl `/api/projects`、Edge 1280/1920 截图。
- 具体要求：项目卡像任务档案；路线图像节点路线；维护规则像系统提示框。
- 验收：项目不再像普通作品集。

### Phase 13：项目详情任务卡

- 目标：项目详情保持 API 和评论点赞，同时更像任务详情卡。
- 范围：`project.html`、`.project-detail-hero`、`.post-body`、评论区。
- 必用工具：curl `/api/projects/:idOrSlug`、评论/点赞检查。
- 具体要求：进度条、状态、更新时间都有粉色任务 UI。
- 验收：缺项目时显示赛蕾提示卡。

### Phase 14：文章详情阅读手帐

- 目标：文章详情变成阅读舒适的手帐页。
- 范围：`post.html`、`.post-detail-hero`、`.post-content`、评论区。
- 必用工具：curl `/api/posts/:slug`、Edge 390/1280 截图。
- 具体要求：正文宽度舒适，代码块可读，标题层级清楚。
- 验收：粉色不影响长文阅读。

### Phase 15：关于页角色资料卡

- 目标：关于页做成角色资料卡 + 个人说明。
- 范围：`about.html`、`.about-panel`、`.avatar-frame`、`.tool-grid`。
- 必用工具：Edge 390/1280 截图、评论区检查。
- 具体要求：头像像资料卡，Linux/硬件/AI 是能力标签，留言不过度花哨。
- 验收：有个人感，不像后台简介页。

### Phase 16：搜索资料检索面板

- 目标：搜索弹层变成粉色资料检索面板。
- 范围：`.search-modal`、`.search-panel`、`.search-suggestions`、JS 搜索结果 markup。
- 必用工具：Browser/Edge 输入关键词、curl `/api/search?q=linux`。
- 具体要求：搜索结果像记录条，有类型标签。
- 验收：无结果显示赛蕾提示，不是纯文字。

### Phase 17：页脚收尾小场景

- 目标：页脚更紧凑，像手帐结尾小场景。
- 范围：`.site-footer`、`.footer-motion`、`.footer-tags`。
- 必用工具：Edge 1280/390 截图。
- 具体要求：保留蜡烛小动画但降低高度；友链、导航清晰。
- 验收：页脚不抢戏，不撑太长。

### Phase 18：统一空状态与动态降级

- 目标：所有空文章、空项目、空评论、搜索无结果都改成赛蕾提示卡。
- 范围：`assets/app.js` 动态空态 + CSS `.anime-empty-state`。
- 必用工具：模拟 API 失败、本地静态预览、Edge 截图。
- 具体要求：提示卡有粉色边框、头像/小图标、行动按钮。
- 验收：任何空状态都不生硬。

### Phase 19：全尺寸审核、修正、最终归档

- 目标：完成 390、768、1280、1920、2560、3840 全尺寸视觉审核。
- 范围：全站页面和报告。
- 必用工具：Edge headless、curl、git、SSH/SCP。
- 具体要求：所有主要页面截图；无横向滚动、无文字重叠、无卡片溢出。
- 验收：生成 `final-pink-diary-redesign-YYYYMMDD.md` 并上传 GitHub。

## 8. 阶段报告模板

每阶段报告必须包含：

```md
# Phase XX - 阶段名称

## Objective
本阶段目标。

## Changed Files
- 文件和摘要。

## Required Skills / Tools
- 实际使用的工具。

## Visual Evidence
- 390：
- 768：
- 1280：
- 1920：
- 2560：
- 3840：

## Functional Checks
- 页面 200：
- API：
- 搜索：
- 评论：
- 点赞：
- GitHub 热力图：

## Pink Diary Quality Check
- 是否粉色系：
- 是否二次元组件感：
- 是否避免黑色终端化：
- 是否保持可读性：

## Reviewer
- 审核人：
- 时间：
- 结论：

## Reviewer Notes
- 建议。

## Must Fix Before Next Phase
- 必修项。

## Archive
- Local：
- Site：
- GitHub：
- Commit：
```

## 9. 验证命令

基础线上检查：

```bash
curl -k -sS https://127.0.0.1:8086/api/health
curl -k -I https://127.0.0.1:8086/
curl -k -I https://127.0.0.1:8086/index.html
curl -k -I https://127.0.0.1:8086/moments.html
curl -k -I https://127.0.0.1:8086/archive.html
curl -k -I https://127.0.0.1:8086/projects.html
curl -k -I https://127.0.0.1:8086/about.html
curl -k -I https://127.0.0.1:8086/assets/style.css
curl -k -I https://127.0.0.1:8086/assets/app.js
```

禁止残留检查：

```bash
rg "Anime terminal redesign 2026-06-06|--anime-bg|anime-pursue-20260606|整站黑底|黑色终端" /data/sites/blog/html
```

截图尺寸：

```text
390x900
768x1024
1280x900
1920x1080
2560x1440
3840x2160
```

## 10. 最终验收标准

- 默认视觉明确是粉色赛蕾手帐。
- 首页第一屏像二次元个人记录站，不是普通技术博客。
- 二次元感来自组件，不只是背景。
- `瞬间` 和 `笔记` 视觉上不冲突。
- `项目` 有粉色任务档案感。
- `关于` 有角色资料卡感。
- 搜索、评论、点赞、GitHub 热力图不坏。
- 移动端、大屏都无明显布局问题。
- 每阶段都有报告、审核、GitHub 归档。
- 没有黑色终端草稿残留上线。

