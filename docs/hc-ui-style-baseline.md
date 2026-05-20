# HC UI 风格基准

更新时间：2026-05-20

## 参考来源

- 线上参考站：`https://www.u3008503.nyat.app:60865/`
- 本地资料目录：`D:\Linux\pi`
- 重点参考文件：
  - `D:\Linux\pi\blog-redesign\assets\style.css`
  - `D:\Linux\pi\blog-redesign\index.html`
  - `D:\Linux\pi\PROJECT-COLLAB.md`
- 重点参考截图：
  - `D:\Linux\pi\archive-local\cleanup-20260520\browse-reports\browse-report-20260520-syncpass-online\home-desktop-1366x900.png`
  - `D:\Linux\pi\archive-local\cleanup-20260520\browse-reports\browse-report-20260520-syncpass-online\mobile-index.html.png`
  - `D:\Linux\pi\archive-local\cleanup-20260520\browse-reports\browse-report-20260520-heatpass-online\desktop-projects.html.png`

## 设计方向

HC 的后续 UI 以 Jlemonz 当前站点为视觉基准，但不照搬个人博客的页面结构。HC 是工作型 IDE，应保留工作台密度、文件树、编辑器、终端、聊天和设置等核心操作区，不做落地页和大段宣传式 Hero。

核心方向：

- 白底、淡酒红、樱粉、低饱和灰作为主视觉。
- 半透明玻璃感面板，但透明度必须服务可读性。
- 细边框、轻阴影、柔和背景层次，避免厚重暗色块。
- 背景图或氛围图可以使用，但只能作为低存在感背景，不遮挡内容。
- UI 要像成熟工具，不像作业页面；信息层级清楚，动作入口明确。

## 视觉 Token

建议从这些值起步，再按实际页面微调：

```css
:root {
  --hc-bg: #fbfbfa;
  --hc-bg-soft: #fff8fb;
  --hc-panel: rgba(255, 255, 255, 0.86);
  --hc-panel-solid: #ffffff;
  --hc-field: rgba(151, 78, 96, 0.06);
  --hc-text: #303235;
  --hc-muted: rgba(48, 50, 53, 0.68);
  --hc-soft: rgba(48, 50, 53, 0.46);
  --hc-line: rgba(151, 78, 96, 0.14);
  --hc-line-strong: rgba(151, 78, 96, 0.25);
  --hc-accent: #b87083;
  --hc-accent-hot: #ff65c8;
  --hc-cyan: #9dcfc8;
  --hc-purple: #a7839d;
  --hc-warning: #dfb06c;
  --hc-shadow-soft: 0 14px 34px rgba(151, 78, 96, 0.10);
  --hc-shadow-panel: 0 18px 42px rgba(72, 76, 80, 0.11);
  --hc-radius-card: 8px;
  --hc-radius-control: 10px;
  --hc-font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif;
}
```

## 布局规则

- 首屏必须是可用的 IDE 工作台，不是介绍页。
- 主结构优先保持三栏或四区：文件/项目、编辑工作区、AI 聊天、终端/日志。
- 顶部栏使用轻玻璃感和细边框，固定但不要压迫内容。
- 卡片只用于独立功能块、列表项、设置分组和弹窗；不要卡片套卡片。
- 工作区背景可以有淡粉/酒红氛围，但主要内容区域必须保持高对比度。
- 移动或窄窗口下优先保证导航、输入框、运行按钮、聊天输出不溢出。

## 组件基调

- 导航：类似参考站的轻量分段导航，选中态用浅底、细线和小阴影，不用高饱和大色块。
- 按钮：主要按钮用淡酒红/粉色强调，次要按钮透明或浅底；图标按钮优先使用图标。
- 输入框：浅底、细边框、聚焦时轻微粉色描边，不做重投影。
- 列表：项目行、模型行、文件行要紧凑，hover 只做浅色背景和细线变化。
- 日志/终端：可以保持深色代码区，但外围容器仍用浅色玻璃体系；深色区域要有明确边界。
- 空状态：不写大段解释，用短句和明确动作按钮。

## 禁止方向

- 不要把 HC 做成普通博客首页或宣传页。
- 不要只换颜色就当成 UI 升级。
- 不要大面积暗色厚重块。
- 不要突兀的黑色投影、强紫蓝渐变、彩色光球或装饰 blob。
- 不要大圆角泡泡堆叠；工作型卡片圆角控制在 8px 左右。
- 不要让文字和按钮拥挤、溢出、遮挡或依赖横向滚动。

## 验收标准

每次重做 HC UI 后至少检查：

- 桌面首屏是否一眼能看出这是 AI IDE，而不是博客/作业页面。
- 文件树、编辑区、AI 聊天、终端是否都有清楚边界和优先级。
- 浅色玻璃、淡酒红/樱粉、轻阴影是否统一。
- 390px 宽度下无页面级横向溢出。
- 输入框、按钮、模型选择、设置项文字不截断。
- 普通 AI 流式聊天不被 UI 改动破坏。

