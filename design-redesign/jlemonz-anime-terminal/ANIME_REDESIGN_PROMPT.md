# Jlemonz 二次元个人站大改执行手册

> 这不是“微调 CSS”的备忘录，而是交给 Codex Pursue goal 执行的完整大改提示词。目标是把 Jlemonz 个人站改成真正有二次元组件语言、角色陪伴感和个人技术日记气质的网站。

## 0. Pursue Goal 主提示词

把下面这一段作为 Codex Pursue goal 的目标描述：

```text
根据 /data/sites/blog/html/ANIME_REDESIGN_PROMPT.md，对 Jlemonz 个人站做真正的二次元大改。

这不是小修小补。不要只改颜色、阴影、圆角或背景图。必须让二次元感进入每一个主要组件：Header、Hero、状态卡、项目卡、瞬间时间线、笔记资料库、项目任务面板、关于资料页、搜索弹层、页脚、空状态和移动端。

保留现有静态站结构、URL、API、后台、数据库和赛蕾图片资产。优先修改 /data/sites/blog/html/assets/style.css，必要时小改 HTML 和 assets/app.js。每个阶段都要备份、实现、截图验证、接口验证，再进入下一阶段。

最终验收标准：打开首页第一屏就能明显感到“二次元技术日记站”，而不是普通技术博客套一张二次元背景。
```

## 1. 当前项目事实

### 线上路径

- 静态站目录：`/data/sites/blog/html`
- 前端主样式：`/data/sites/blog/html/assets/style.css`
- 前端主脚本：`/data/sites/blog/html/assets/app.js`
- 设计执行手册：`/data/sites/blog/html/ANIME_REDESIGN_PROMPT.md`
- 后端目录：`/data/blog-backend`
- 对外访问：`https://192.168.31.248:8086/`

### 本地工作区建议路径

- 本地镜像目录：`/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/bug-check`
- 本地提示词文件：`/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/bug-check/ANIME_REDESIGN_PROMPT.md`

### 必须保留的 URL

- `/`
- `/index.html`
- `/moments.html`
- `/archive.html`
- `/projects.html`
- `/project.html`
- `/post.html`
- `/about.html`

### 必须保留的信息架构

- `瞬间`：短动态、时间线、随手碎片。
- `笔记`：长文、调试、学习归档。
- `项目`：服务、硬件、页面改造进展。
- `关于`：个人资料、长期学习方向、留言和联系。

### 必须保留的接口

- `GET /api/site/texts`
- `GET /api/site/overview`
- `GET /api/moments`
- `GET /api/posts`
- `GET /api/projects`
- `GET /api/projects/:idOrSlug`
- `GET /api/search?q=`
- `GET/POST /api/comments`
- `GET/POST /api/reactions`
- `GET /api/github/contributions`
- `GET /api/health`

### 可用图片资产

优先只用现有资产，不新增外链图：

- `/assets/sailei/sailei-main.jpg`
- `/assets/sailei/avatar.jpg`
- `/assets/sailei/note-1.jpg`
- `/assets/sailei/note-2.jpg`
- `/assets/sailei/side-illustration.jpg`
- `/assets/sailei/side-photo.jpg`
- `/assets/sailei/amber-hero.jpg`
- `/assets/sailei/aqua-hero-1600.jpg`
- `/assets/sailei/hero-1100.jpg`
- `/assets/sailei/hero-1600.jpg`
- `/assets/sailei/light-1400.jpg`
- `/assets/sailei/violet-hero-1600.jpg`
- `/assets/brand/jlemonz-logo.png`

## 2. 外部参考与可借鉴思路

不要直接复制外部项目素材或代码，只提炼组件思路。

- GitHub anime portfolio：借鉴深色底、霓虹边、技能徽章、动态卡片、发光按钮、quote 区。参考：[Shineii86/Portfolio](https://github.com/Shineii86/Portfolio)
- Sakura / Sakurairo 二次元博客：借鉴封面氛围、随机图、博客阅读层级、丰富主题配置、二次元博客的“角色陪伴感”。参考：[Hexo 主题 Sakura](https://skr-king.github.io/theme-sakura/)、[Sakurairo](https://www.projectscouts.com/sakurairo-an-elegant-rich-featured-wordpress-theme/)
- KZHomePage / 二次元个人主页：借鉴背景人物 + 玻璃卡片 + 入口卡片 + 响应式主页。参考：[KZHomePage 美化](https://www.cnblogs.com/aiazt/articles/16630323.html)
- 粉色二次元主页：借鉴玻璃拟态、粉色渐变、轻动画、移动端适配、丰富 CSS 层次。参考：[KaiGe 粉色二次元个人主页](https://www.anxiaoxi.com/1251.html)
- TikTok/Reels 信息流：借鉴强首屏、状态标签、竖向节奏、轻互动反馈、快速扫读。参考：[TikTok UI Clone](https://github.com/s-shemmee/TikTok-UI-Clone)

## 3. 视觉总方向

主题名：`赛蕾夜色终端`

一句话方向：

```text
像一块被赛蕾角色占据的个人技术终端：有 galgame 对话框、手帐贴纸、任务 HUD、拍立得瞬间、资料库笔记和柔和霓虹，但仍然能舒服阅读 Linux、硬件和 AI 记录。
```

### 视觉关键词

- galgame 对话框
- 二次元手帐
- 角色资料卡
- 玻璃拟态面板
- 粉紫霓虹
- HUD 状态灯
- 拍立得瞬间
- 胶带、贴纸、票根、角标
- 技术终端线框
- 轻 scanline / grain 质感
- 角色陪伴感

### 强制视觉强度

实现后必须满足：

- 第一屏不能像普通博客。
- 首页至少 7 个主要组件有二次元形态，不只是换色。
- 瞬间页和笔记页必须一眼不同。
- 项目页必须像任务面板，不是普通卡片网格。
- 关于页必须像个人资料卡，不是纯文本介绍。
- 空状态必须是角色提示卡，不是普通灰字。

## 4. 全局 CSS 设计系统

在 `assets/style.css` 末尾建立一个新的集中覆盖段，建议标题：

```css
/* Anime terminal redesign 2026-06-05 */
```

### 必须新增的 CSS token

至少包含这些自定义变量：

- `--anime-bg`
- `--anime-panel`
- `--anime-panel-strong`
- `--anime-pink`
- `--anime-pink-strong`
- `--anime-violet`
- `--anime-cyan`
- `--anime-gold`
- `--anime-ink`
- `--anime-muted`
- `--anime-line`
- `--anime-glow`
- `--anime-soft-shadow`
- `--anime-hard-shadow`
- `--anime-radius`
- `--anime-ticket-cut`

### 必须新增的通用组件语言

这些可以用伪元素实现，不要为装饰写大量 HTML：

- `.desk-card::before`：HUD 细线或高光边。
- `.desk-card::after`：贴纸角标、胶带或 scanline。
- `.anime-sticker` 或等价样式：小贴纸标签。
- `.anime-status-dot` 或等价样式：状态灯。
- `.anime-ticket` 或等价样式：票根/任务卡边缘。
- `.anime-polaroid` 或等价样式：拍立得图片框。
- `.anime-dialog` 或等价样式：galgame 对话框。

### 禁止事项

- 不要使用大面积渐变球、浮动 orb、bokeh blob。
- 不要把所有东西都做成同一种粉色。
- 不要让文字和背景角色混在一起。
- 不要引入重型动画库。
- 不要让动画影响 Pi5 性能。

## 5. 每个页面的改造要求

### 5.1 Header

当前结构：`.site-header`、`.brand`、`.brand-copy`、`.nav-links`、`.nav-actions`

必须改成二次元 HUD 顶栏：

- Header 背后是半透明玻璃条，带 1px 高光线。
- Logo 区做成角色铭牌，`Jlemonz` 是主名，随机句子是“小对白”。
- 当前导航项必须有明显选中态：发光胶囊、贴纸底或小三角指示。
- `搜索 / 主题 / 联系` 是工具按钮，hover 有微光和状态反馈。
- 移动端 Header 要分两行或横向可控，不允许挤压、重叠、横向滚动。

失败判定：

- 只是普通导航加粉色背景，算失败。
- 选中态看不出来，算失败。

### 5.2 首页 Hero

当前结构：`.hero-home`、`.hero-bg`、`.hero-copy`、`.hero-frequency-card`

必须改成角色陪伴主屏：

- 背景继续固定，不恢复滚动视角移动。
- Hero 文案区域变成 galgame 对话框或 HUD 主面板。
- `Jlemonz` 标题可保留大字，但必须有二次元标题层级：小标题、角色对白、状态条。
- GitHub 热力图改成“SYNC LOG / 今日连接 / 代码频率”模块。
- 首屏要有强识别：角色背景 + 对话框 + HUD 组件一起成立。

建议文案局部：

- `SYSTEM ONLINE`
- `SAILEI TERMINAL`
- `SYNC LOG`
- `今日连接`
- `记录载入中`

失败判定：

- 只是大标题压在背景上，算失败。

### 5.3 首页三张状态卡

当前结构：`.status-strip`、`.status-note`、`.pulse-note`

必须从普通卡片改成任务文件卡：

- `RECAP` 显示为 `FILE 01 / RECAP`
- `TRACE` 显示为 `FILE 02 / TRACE`
- `DAILY` 显示为 `FILE 03 / DAILY`
- 每张卡有状态灯、角标、胶带或票根边。
- 卡片背景要有轻微线框或 scanline。
- hover 是轻微浮起 + 边框发光，不要大幅移动。

失败判定：

- 只是改卡片颜色，算失败。

### 5.4 首页项目进行中

当前结构：`.project-list`、`.project-row`、`.rangeWrapper`、`.kawaii`

必须改成任务看板：

- 每条 `project-row` 是任务档案：标题、摘要、更新时间、进度条、状态 badge。
- 进度条像能量条，带小刻度或发光填充。
- 项目卡左侧或右上有 `MISSION` / `TASK` 风格角标。
- 空项目状态是角色提示卡：例如“还没有公开任务，先把想法留在终端里。”

失败判定：

- 看起来还是普通列表，算失败。

### 5.5 首页最近瞬间

当前结构：`.moment-preview`、`.moment-list.compact`、`.moment-item`

必须改成便签时间线：

- 每个 `moment-item` 像手帐便签、聊天气泡或贴纸。
- 时间像小票时间戳。
- 标签像贴纸，不是普通 pill。
- `moment-preview` 外观要和项目区不同。

失败判定：

- 和笔记列表视觉差不多，算失败。

### 5.6 首页分类入口

当前结构：`.category-card`、`[data-home-categories]`

必须改成贴纸目录：

- Linux：终端/命令贴纸感。
- 硬件/裸机：芯片/电路贴纸感。
- RTOS：时钟/任务调度贴纸感。
- 生活：日记/星星贴纸感。
- 每个入口至少有颜色差异和小型视觉符号，可以用 CSS 伪元素实现。

失败判定：

- 只是普通链接列表，算失败。

### 5.7 瞬间页

当前结构：`.moments-hero`、`[data-moment-kinds]`、`.timeline`、`.moment-item`

必须改成动态流：

- 顶部 `碎片 / 项目 / 生活` 是频道切换，像二次元频道按钮。
- 时间线有竖向轨道、小节点或弹幕式时间标记。
- 无图瞬间像聊天气泡或便签。
- 有图瞬间像拍立得，有胶带或相纸边。
- 空状态是角色提示。

失败判定：

- 和笔记页都是普通卡片列表，算失败。

### 5.8 笔记页

当前结构：`.notes-hero`、`.archive-search-card`、`.article-list`、`.article-row`、`.frequency-card`

必须改成资料库/档案柜：

- 顶部 `长文 / 调试 / 学习` 是资料分类按钮。
- 搜索框像“资料检索终端”。
- `article-row` 像档案卡或笔记本目录，有编号、日期、分类贴纸。
- GitHub 热力图像“学习密度记录”。
- 和瞬间页彻底区分：笔记页更规整、像资料库；瞬间页更生活流、像动态。

失败判定：

- 只是把瞬间页换标题，算失败。

### 5.9 项目页

当前结构：`.projects-hero`、`.project-grid`、`.project-tile`、`.roadmap`、`.maintain-card`

必须改成任务终端：

- 项目卡是 `MISSION CARD`，带进度、状态、时间、角标。
- `.roadmap` 是任务节点路线，不是普通列表。
- `.maintain-card` 是系统提示框或安全规则终端。
- 项目详情页 `.project-detail-hero` 要继续这个任务档案风格。

失败判定：

- 看起来像普通作品集，算失败。

### 5.10 关于页

当前结构：`.about-hero`、`.avatar-frame`、`.about-card`、`.comment-card`、`.contact-card`

必须改成角色资料页：

- 头像区像 `PROFILE CARD`。
- `Linux / 硬件 / AI` 是能力标签。
- 当前状态像角色状态栏。
- 长期补课清单像技能树或资料条。
- 留言和联系保持可读，不要过度装饰。

失败判定：

- 只是普通关于页加头像，算失败。

### 5.11 搜索弹层

当前结构：`.search-modal`、`.search-panel`、`[data-search-input]`、`[data-search-results]`

必须改成资料检索面板：

- 弹层像 `ARCHIVE SEARCH` 或 `TERMINAL SEARCH`。
- 输入框有终端感，但仍然清楚可用。
- 结果条像记录卡，hover 明显。
- 保持 `/api/search?q=` 逻辑不变。

失败判定：

- 只是普通弹窗，算失败。

### 5.12 Footer

当前结构：`.site-footer`、`.footer-motion`、`.footer-brand-block`、`.footer-link-grid`

必须改成收尾小场景：

- 保留蜡烛动画，但收紧高度。
- footer 是“夜间终端关闭前的小场景”。
- 友链和导航清晰。
- `Pi5 / Linux / 硬件 / AI` 标签像小徽章。

失败判定：

- footer 视觉太高、喧宾夺主，算失败。

## 6. 必须新增的空状态

所有空状态必须有二次元提示，不准生硬空白：

- 没有项目：`任务板暂时空着，先把下一次折腾写进终端。`
- 没有瞬间：`今天的时间线还很安静。`
- 没有笔记：`资料库还没收录这类记录。`
- 搜索无结果：`没有找到这条记录，也许它还躲在下一次折腾里。`
- 评论为空：`留言区还很安静，可以先写一句。`

## 7. 文件修改策略

### 首选修改

- `/data/sites/blog/html/assets/style.css`

### 必要时修改

- `/data/sites/blog/html/*.html`
- `/data/sites/blog/html/assets/app.js`

### 不要修改

- `/data/blog-backend` 后端逻辑
- 数据库结构
- Nginx 反代结构
- Vue 后台
- API 路由语义

### 版本参数

每次上线都更新：

- CSS：`/assets/style.css?v=anime-terminal-YYYYMMDD`
- JS：`/assets/app.js?v=anime-terminal-YYYYMMDD`

## 8. Pursue Goal 执行阶段

### 阶段 0：读取与备份

执行前必须：

- 读取 `/data/sites/blog/html/ANIME_REDESIGN_PROMPT.md`
- 读取当前 HTML、CSS、JS。
- 备份 `/data/sites/blog/html`。
- 记录备份路径。
- 不先备份不准改。
- 检查本次需要的 MCP/skills/tools 是否可用，缺少必要工具时先安装或下载，再继续。

### 阶段 1：全局视觉系统

目标：

- 建立二次元 token。
- 重做 Header。
- 重做基础 `desk-card` 视觉。
- 重做按钮、标签、输入框、空状态基础样式。

验收：

- 首页没改内容前，卡片也已经不是普通博客卡片。

建议使用能力：

- Shell/SSH/SCP：读取、备份、上传静态文件。
- Browser skill：打开本地或线上页面，看 Header、Hero、基础卡片是否真的变化。
- 不需要 Figma、图片生成或新依赖。

### 阶段 2：首页大改

目标：

- Hero 变 galgame/HUD 主屏。
- 三张状态卡变任务文件卡。
- 项目预览变任务看板。
- 最近瞬间变便签流。
- 分类入口变贴纸目录。
- stats 和 moyu-widget 变角色状态组件。

验收：

- 首页第一屏明显二次元。
- 首页不再像普通技术博客。

建议使用能力：

- Browser skill：必须截图首页 390、1280、2560 宽。
- imagegen skill：仅当现有赛蕾素材不够支撑某个空状态或贴纸资产时使用；生成后必须保存到站点本地资产目录，不允许外链。
- Web search：只用于补充 UI 灵感，不直接复制外部图片和代码。

### 阶段 3：瞬间和笔记分离

目标：

- 瞬间页变动态流。
- 笔记页变资料库。
- 两页视觉、节奏、组件形态不同。

验收：

- 不看导航也能分辨哪个是瞬间、哪个是笔记。

建议使用能力：

- Browser skill：对比 `/moments.html` 和 `/archive.html` 截图。
- Shell：检查 DOM 中 `moment-item`、`article-row`、空状态和动态渲染 markup。
- 不需要数据库修改。

### 阶段 4：项目、详情、关于

目标：

- 项目页变任务终端。
- 项目详情变任务档案。
- 笔记详情变阅读档案。
- 关于页变角色资料页。

验收：

- 项目不再像普通作品集。
- 关于页有角色资料感。

建议使用能力：

- Browser skill：检查 `/projects.html`、`/project.html`、`/post.html`、`/about.html`。
- Shell：验证详情页、评论区、点赞按钮、正文容器 class 没被破坏。
- Figma MCP：可选；只有用户要求先出设计稿或要同步 Figma 时才用，不作为默认流程。

### 阶段 5：搜索、页脚、空状态、接口回归

目标：

- 搜索弹层改成资料检索面板。
- 页脚改成收尾小场景。
- 所有空状态改成角色提示。
- 搜索、点赞、评论、GitHub 热力图正常。

验收：

- 功能不坏，空状态不生硬。

建议使用能力：

- Browser skill：打开搜索弹层、输入关键词、检查搜索结果。
- Shell/curl：验证 `/api/search`、`/api/comments`、`/api/reactions`、`/api/github/contributions`、`/api/health`。
- Node/JS：仅用于小型 DOM 或静态检查，不引入构建链。

### 阶段 6：响应式与大屏修正

必须截图或等价验证：

- 390 宽
- 768 宽
- 1280 宽
- 1920 宽
- 2560 宽
- 3840 宽

禁止：

- 横向滚动
- 顶栏挤压
- 文字重叠
- 卡片溢出
- 背景遮挡正文
- 动画卡顿明显

建议使用能力：

- Browser skill 或 headless browser：必须做 390、768、1280、1920、2560、3840 宽截图。
- Shell：用 `curl` 检查静态资源 200 和哈希。
- 不需要安装大型测试框架。

## 9. MCP / Skills / Tools 使用矩阵

Pursue goal 执行时必须按需使用工具，不要凭肉眼猜，也不要因为少一个工具就降低目标。

### 必用能力

| 阶段 | 能力 | 用途 | 安装策略 |
| --- | --- | --- | --- |
| 全程 | Shell / SSH / SCP | 读取文件、备份、上传、验证线上状态 | 系统已有即可；缺少 `scp`/`ssh` 时先安装 OpenSSH 客户端 |
| 全程 | Browser skill / in-app browser | DOM 检查、交互验证、截图 | 当前环境已有 Browser 插件则直接用；缺失时先搜索并安装可用浏览器控制插件 |
| 全程 | curl | API、静态资源、状态码验证 | 缺失时安装 curl |
| 全程 | rg | 快速搜索 HTML/CSS/JS 残留 | 缺失时安装 ripgrep，或临时用 grep 兜底 |
| 视觉验证 | Headless Edge/Chromium | 多尺寸截图和渲染检查 | 已有就用；缺失时安装 Chromium/Edge 或使用 Browser skill 替代 |
| 阶段归档 | git + GitHub 认证 | 克隆 `Jlemonz2020/Joe`、提交阶段最终档、推送归档 | `git` 必须可用；推送可用 HTTPS Token、SSH key 或 `gh auth login`；缺少 `gh` 时按需安装 GitHub CLI |

### 条件使用能力

| 条件 | 能力 | 用途 | 规则 |
| --- | --- | --- | --- |
| 需要新位图资产 | imagegen skill | 生成空状态、贴纸、纹理、轻量角色辅助图 | 只生成本地资产；保存到 `/assets/sailei/` 或新建 `/assets/anime-ui/`；不使用外链 |
| 用户要求设计稿 | Figma MCP | 产出或同步 Figma 设计稿 | 默认不需要；只有明确要求才用 |
| 需要继续看参考 | Web search | 查 GitHub、二次元主页、热门 UI 灵感 | 只提炼模式，不复制版权素材 |
| 需要图片压缩 | ImageMagick / sharp / cwebp | 压缩新生成图片 | 优先系统工具；不要为了压缩引入大型前端依赖 |
| 需要检查 JS 语法 | node | 静态检查、简单脚本 | 不引入打包器，不改框架 |
| 需要 GitHub 登录辅助 | GitHub CLI (`gh`) | 让用户登录 GitHub，辅助 push 阶段归档 | 只有当前环境没有可用 Token/SSH key 且用户愿意交互登录时才安装 |

### 不默认使用

- 不默认安装 React/Vue/Astro/Next。
- 不默认引入 Tailwind、GSAP、anime.js、大型 UI 库。
- 不默认接入外部 CDN 图片。
- 不默认修改 Nginx、数据库、后台或 API。
- 不默认使用 Figma，除非用户明确要设计稿。

### 缺工具时的执行规则

如果某个阶段缺少必要工具：

1. 先判断这个工具是否真的必要，不能因为懒得验证就跳过。
2. 必要且轻量的系统工具直接安装或下载。
3. 安装前后记录工具名、用途、安装方式。
4. 安装失败时使用同等能力替代，例如 Browser skill 替代 headless Chromium。
5. 不因为工具缺失把“大改”降级成“小修”。

## 10. 阶段审核、修正、归档与 GitHub 上传

这次大改必须按“阶段关卡”推进。每个阶段不是写完就进入下一阶段，而是：

1. 完成阶段实现。
2. 生成阶段最终档。
3. 交给审核人审核。
4. 根据审核建议修正。
5. 把最终档归档到线上站点和 GitHub。
6. 下一阶段先处理上一阶段遗留建议，再做新内容。

### 审核人规则

审核人可以是用户本人、另一个 Codex 线程、Pursue goal 中的 review 子任务，或用户指定的设计/前端审核人。

审核人必须检查：

- 本阶段目标是否真的完成。
- 是否符合“二次元优先，个人站其次”的方向。
- 是否出现小打小闹式改色、普通卡片堆叠、只靠背景图的问题。
- 截图里是否有文字重叠、卡片溢出、横向滚动、背景遮挡正文。
- 功能是否保持可用：搜索、评论、点赞、GitHub 热力图、API 降级。
- 代码是否局限在允许范围内，没有误改后台、数据库和 API。

审核结果只能是：

- `approved`：本阶段通过，可以进入下一阶段。
- `approved-with-fixes`：可以进入下一阶段，但下一阶段第一步必须先修复本阶段建议。
- `rework-required`：不能进入下一阶段，必须回修并重新提交审核。

### 阶段最终档路径

每个阶段都要生成一份 Markdown 最终档，命名格式：

```text
phase-XX-short-name-YYYYMMDD.md
```

本地工作路径：

```text
/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/bug-check/reports/
```

线上站点归档路径：

```text
/data/sites/blog/html/reports/
https://192.168.31.248:8086/reports/
```

GitHub 归档路径：

```text
Jlemonz2020/Joe
design-redesign/jlemonz-anime-terminal/
```

### GitHub 上传要求

每个阶段完成并通过审核后，必须把阶段最终档上传到：

```text
https://github.com/Jlemonz2020/Joe
```

推荐本地仓库路径：

```text
/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe
```

首次准备：

```bash
mkdir -p /home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github
cd /home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github
git clone ssh://git@ssh.github.com:443/Jlemonz2020/Joe.git
```

每阶段归档命令：

```bash
cd /home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe
git remote set-url origin ssh://git@ssh.github.com:443/Jlemonz2020/Joe.git
git pull --ff-only
mkdir -p design-redesign/jlemonz-anime-terminal
cp /home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/bug-check/reports/phase-XX-short-name-YYYYMMDD.md design-redesign/jlemonz-anime-terminal/
cp /home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/bug-check/ANIME_REDESIGN_PROMPT.md design-redesign/jlemonz-anime-terminal/
cp /home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/bug-check/PURSUE_GOAL_HANDOFF.md design-redesign/jlemonz-anime-terminal/
git add design-redesign/jlemonz-anime-terminal
git commit -m "docs: archive anime redesign phase XX"
git push
```

如果 GitHub 推送被权限、账号、Token 或 SSH key 阻塞：

- 不要假装上传成功。
- 本地和线上站点归档仍然要完成。
- 阶段最终档必须写明 `GitHub upload: blocked`。
- 给出缺失的认证方式和下一条可执行命令。
- 除非用户明确接受“先本地归档”，否则该阶段不能标记为完全完成。

### 阶段最终档模板

```md
# Phase XX - 阶段名称

## Objective

本阶段要解决什么。

## Changed Files

- 文件路径
- 修改摘要

## Visual Evidence

- 390 截图：
- 1280 截图：
- 1920 截图：
- 2560/3840 截图：

## Functional Checks

- `/api/health`：
- `/assets/style.css`：
- 搜索：
- 评论/点赞：
- 页面状态码：

## Reviewer

- 审核人：
- 审核时间：
- 结论：`approved` / `approved-with-fixes` / `rework-required`

## Reviewer Notes

- 建议 1
- 建议 2

## Must Fix Before Next Phase

- 必修项 1
- 必修项 2

## Next Phase Correction Plan

下一阶段开始时先怎么修正这些问题。

## Archive

- Local report：
- Site report：
- GitHub path：
- GitHub commit：
```

### 下一阶段继承规则

每个新阶段开工前，必须先读取上一阶段最终档里的：

- `Reviewer Notes`
- `Must Fix Before Next Phase`
- `Next Phase Correction Plan`

如果上一阶段有 `rework-required`，不得进入下一阶段。
如果上一阶段是 `approved-with-fixes`，本阶段第一批改动必须优先修复这些项。

### 最终归档

所有阶段完成后，生成最终归档：

```text
final-anime-redesign-YYYYMMDD.md
```

最终归档必须包含：

- 每个阶段链接。
- 每个审核结论。
- 所有 GitHub commit。
- 最终截图清单。
- 线上验证命令输出摘要。
- 未解决问题和后续建议。

## 11. 质量门槛

实现后必须通过下面的“不是小打小闹”检查：

- 是否新增了至少 10 种明确二次元组件细节。
- 是否至少 5 个页面有独立视觉身份。
- 是否 Header、Hero、状态卡、列表、搜索、页脚都被重做。
- 是否 CSS 不只是颜色覆盖，而是结构性组件语言。
- 是否移动端和大屏都看起来是设计过的。

如果上述任意两项不满足，继续迭代，不算完成。

## 12. 验证命令

上线后至少执行：

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

浏览器验证：

- 首页首屏。
- 瞬间页。
- 笔记页。
- 项目页。
- 关于页。
- 搜索弹层。
- 移动端 390 宽。
- 大屏 2560 和 3840 宽。

## 13. 最终验收标准

最终完成时必须满足：

- 第一眼就是二次元技术日记站。
- 二次元感来自组件，不只是背景图。
- `瞬间` 和 `笔记` 视觉上不冲突。
- `项目` 有任务面板感。
- `关于` 有角色资料页感。
- 搜索、评论、点赞、GitHub 热力图不坏。
- 背景固定，不恢复滚动视角移动。
- 手机和大屏无明显布局问题。
- 不新增版权不明外链图片。
