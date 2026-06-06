# Phase 035 GitHub 同步手帐格设计说明

## 阶段目标

把首页 GitHub 热力图从“默认贡献图复制品”调整为粉色赛蕾手帐里的同步频率模块。组件必须保留真实数据来源，不能伪造贡献数据，接口失败时也要像站内手帐提示，而不是显示技术错误。

## 实现文件

- Astro 组件：`src/components/GithubSyncGrid.astro`
- 规则文件：`src/data/githubSyncRules.ts`
- 样式文件：`src/styles/github-sync.css`
- 首页接入：`src/pages/index.astro`
- 全局样式接入：`src/layouts/BaseLayout.astro`

## 视觉策略

- 使用 `SYNC FREQUENCY` 作为 HUD 式小标题，但不走黑色终端风。
- 主容器沿用 `diary-card diary-card--glass`，保持粉色透明玻璃、奶白底和柔和描边。
- 三个元信息卡显示账号、年度同步、显示范围，让数据先有阅读层级。
- 98 个贡献格保留真实频率等级，但颜色改为樱粉递进。
- 增加“同步便签”区域，解决大屏下格子过小、右侧空白的问题，同时强化手帐叙事。
- 失败态使用 49 枚淡粉格和温和文案，避免把接口失败暴露成生硬错误。

## 数据规则

- 组件通过 `/api/github/contributions` 获取数据。
- 使用返回值中的 `username`、`total`、`days`。
- 只展示最近 98 天。
- `level` 被限制在 `0..4`，防止异常值破坏视觉。
- 请求失败或 `days` 为空时进入 fallback。

## 可访问性和响应式

- 组件区域使用 `aria-labelledby`。
- 格子带 `title` 和 `aria-label`，内容包含日期和同步次数。
- 状态章使用 `aria-live="polite"`。
- 移动端元信息改为单列，格子和便签上下排列。
- 横向空间不足时滚动只发生在 `.github-sync__grid-wrap` 内，不扩大页面宽度。

## 动效

- ready 状态下格子轻微入场。
- 状态灯做低强度呼吸。
- `prefers-reduced-motion: reduce` 下关闭组件内动画。

## 审核结论

`approved`

理由：组件已经从默认热力图变为粉色手帐同步格，数据真实、失败态可读，大屏不再出现空白感，移动端无横向溢出。
