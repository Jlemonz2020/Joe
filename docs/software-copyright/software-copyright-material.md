# Jlemonz 个人内容网站软件著作权申请材料

## 一、软件基本信息

软件名称：Jlemonz 个人内容管理与展示系统

软件简称：Jlemonz Site

版本号：V1.0

开发完成日期：2026 年 8 月

运行环境：现代浏览器、Node.js 服务端环境、Nginx 静态资源服务环境。归档版本可作为纯前端静态站点运行，完整版本可连接后端接口和数据库。

## 二、开发背景

这个系统最初是为了把学习记录、项目过程、面试训练和日常瞬间统一放在一个地方。普通博客只能放文章，项目页又常常像作品集，面试题训练往往独立在另一个工具里。Jlemonz Site 把这些内容放到同一套页面风格和交互里：文章负责沉淀，瞬间负责记录，项目负责展示过程，面试页负责训练和复盘，关于页则保留个人说明和扩展模块。

系统的设计重点不是堆页面，而是让内容能持续更新、能被搜索、能适应移动端，也能在接口不可用时保持基本展示。前端部分保留静态预览数据，方便公开归档和演示；完整部署时则通过后端接口读取真实内容。

## 三、主要功能

1. 首页展示：展示站点入口、项目摘要、瞬间片段、进度组件和导航。
2. 瞬间记录：展示碎片内容、日常内容和项目留痕，并支持页面内筛选。
3. 小记文章：展示文章列表、分类、详情页和搜索入口。
4. 项目展示：展示项目列表、项目详情、进度状态和项目描述。
5. 面试训练：展示面试题库、题目答案、实例拆解、标签筛选和训练记录。
6. 关于页面：展示个人说明、DDV 歌单、留言和页尾信息。
7. 资源兜底：当后端接口不可用时，前端使用静态预览数据保障页面可读。
8. 主题与页尾：提供统一视觉风格、主题切换、页尾短句轮换和品牌标识。

## 四、技术特点

- 前端采用原生 HTML、CSS、JavaScript 编写，不依赖大型前端框架，便于静态归档。
- 页面资源使用版本号管理，避免浏览器刷新时继续加载旧 CSS 或旧 JS。
- 动态接口统一封装，正式环境读取后端接口，本地和 GitHub Pages 环境自动走静态预览数据。
- 面试题卡的答案和实例分开展开，实例可以按题目编号独立拉取详情。
- 外部图片和推荐内容在后端进行缓存，减少用户打开页面时等待外部服务的时间。
- 页尾短句由前端从短句池中轮换展示，避免页面长期固定同一段文字。

## 五、模块说明

首页模块负责整合站点关键入口，通过统一导航进入瞬间、小记、项目、面试和关于页面。瞬间模块强调轻量筛选，用户可以在当前页面切换不同记录类型。小记模块负责文章列表和详情展示，项目模块负责项目卡片和详情页展示。面试模块是系统中交互最多的部分，题卡提供答案、实例、见解和完成状态等训练动作。关于页放置个人介绍、歌单推荐和留言入口。公共模块包括主题、搜索、接口请求、页尾渲染、动态内容加载和静态预览兜底。

## 六、核心源代码摘录

### 1. 接口请求与静态预览兜底

```javascript
const canUseLocalPreview = () => {
  const host = window.location.hostname;
  return window.location.protocol === "file:"
    || ["", "localhost", "127.0.0.1", "::1"].includes(host)
    || host.endsWith(".github.io")
    || ["4173", "4174"].includes(window.location.port);
};

const apiGet = async (path) => {
  try {
    const response = await fetch(apiUrl(path), {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`API ${path} failed`);
    return response.json();
  } catch (error) {
    if (String(path).startsWith("/api/") && canUseLocalPreview()) {
      return localPreviewApiGet(path);
    }
    throw error;
  }
};
```

### 2. 面试题实例数据标准化

```javascript
const normalizeBackendInterviewExampleCase = (item = {}) => {
  const rawCase = item.exampleCase ?? item.example_case ?? null;
  let parsed = rawCase;
  if (typeof rawCase === "string") {
    try {
      parsed = JSON.parse(rawCase);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const profile = {
    title: String(parsed.title || "实例拆解").trim() || "实例拆解",
    example: String(parsed.example || "").trim(),
    solution: String(parsed.solution || "").trim(),
    cause: String(parsed.cause || "").trim(),
    summary: String(parsed.summary || "").trim()
  };
  return profile.example && profile.solution && profile.cause && profile.summary
    ? profile
    : null;
};
```

### 3. 面试题实例独立加载

```javascript
const ensureQuestionDetail = async (item = {}, need = "any") => {
  const hasAnswer = Boolean(item.answer);
  const hasExample = Boolean(normalizeBackendInterviewExampleCase(item));
  if (item.detailReady && (need === "answer" ? hasAnswer : need === "example" ? hasExample : (hasAnswer || hasExample))) {
    return item;
  }
  const lookupKey = questionDetailLookupKey(item);
  if (!lookupKey) throw new Error("question_detail_key_missing");
  const cached = state.bank.detailCache.get(lookupKey);
  if (cached) {
    const cachedHasAnswer = Boolean(cached.answer);
    const cachedHasExample = Boolean(normalizeBackendInterviewExampleCase(cached));
    if (need === "answer" ? cachedHasAnswer : need === "example" ? cachedHasExample : (cachedHasAnswer || cachedHasExample)) {
      return cached;
    }
  }
  const detail = await apiJson(`/api/interview/questions/${encodeURIComponent(lookupKey)}`);
  const normalized = normalizeQuestionDetailForCard(item, detail);
  cacheQuestionDetail(normalized);
  return normalized;
};
```

### 4. 页尾短句轮换

```javascript
const renderFooterLyric = () => {
  const blocks = document.querySelectorAll(".footer-lyric-card blockquote");
  if (!blocks.length) return;
  const seed = `${page}:${new Date().toDateString()}:${Math.floor(Date.now() / 60000)}`;
  const index = Math.abs([...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0)
    + Math.floor(Math.random() * footerLyricPool.length)) % footerLyricPool.length;
  const lyric = footerLyricPool[index] || footerLyricPool[0];
  blocks.forEach((node) => {
    node.dataset.footerLyric = "active";
    node.innerHTML = `${escapeHtml(lyric.line1)}<br><span>${escapeHtml(lyric.line2)}</span>`;
  });
};
```

### 5. 样式片段

```css
.meeting-card,
.desk-card,
.interview-card {
  border-radius: 24px;
  background: rgba(255, 250, 253, 0.86);
  border: 1px solid rgba(255, 180, 215, 0.32);
  box-shadow: 0 18px 45px rgba(170, 92, 132, 0.12);
}

.train-card-actions button {
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  transition: transform 0.22s ease, box-shadow 0.22s ease;
}
```

## 七、运行流程

用户访问页面后，浏览器先加载静态 HTML、CSS 和 JavaScript。脚本初始化主题、导航状态和搜索入口，然后根据当前页面类型加载对应模块。若后端接口可用，页面读取真实数据；若处于本地文件或 GitHub Pages 环境，则使用静态预览数据，保证页面不会因为缺少接口而空白。面试页在列表中只加载轻量题目，用户点击答案或实例时再按题目编号请求详情，减少首屏负担。

## 八、原创性说明

本系统的页面结构、交互方式、视觉风格和前端逻辑均围绕个人内容管理场景独立设计。系统没有套用通用博客模板，而是把学习记录、项目展示、瞬间记录和面试训练合并到同一套体验中。面试题训练、页尾轮换、静态预览兜底、缓存版本管理等逻辑都结合实际使用问题逐步完善，属于面向个人知识与项目沉淀的定制化实现。

## 九、提交材料建议

软著提交时建议准备以下内容：

- 软件说明书：可使用本文前半部分整理。
- 源代码文档：可从 `assets/app.js` 和 `assets/style.css` 中继续补充前端源代码页。
- 界面截图：建议截取首页、瞬间页、小记页、项目页、面试页和关于页。
- 版本说明：V1.0 作为当前正式上线归档版本。