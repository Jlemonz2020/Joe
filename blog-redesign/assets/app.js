const root = document.documentElement;
const page = document.body.dataset.page || "home";
const header = document.querySelector("[data-header]");
const searchModal = document.querySelector("[data-search-modal]");
const searchInput = document.querySelector("[data-search-input]");
const openSearch = document.querySelector("[data-search-open]");
const closeSearch = document.querySelector("[data-search-close]");
const themeToggle = document.querySelector("[data-theme-toggle]");
const requestedTheme = new URLSearchParams(window.location.search).get("theme");
const savedTheme = requestedTheme || localStorage.getItem("theme");
const isVisualEditor = new URLSearchParams(window.location.search).get("editor") === "1";
const themeAliases = {
  dark: "white",
  light: "white",
  aqua: "white",
  amber: "white",
  violet: "wine",
  sakura: "wine",
  green: "white",
  sky: "white",
  yellow: "white"
};
const themes = [
  { id: "white", label: "樱粉白昼", color: "#ff8cc8", themeColor: "#fff2f8" },
  { id: "wine", label: "莓粉夜樱", color: "#d95d9f", themeColor: "#fff2f8" }
];

const applyTheme = (themeId) => {
  const themeKey = themeAliases[themeId] || themeId;
  const activeTheme = themes.find((item) => item.id === themeKey) || themes[0];
  const normalized = activeTheme.id;
  if (normalized === "white") {
    root.removeAttribute("data-theme");
  } else {
    root.dataset.theme = normalized;
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", activeTheme.themeColor);
  localStorage.setItem("theme", normalized);
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.themeChoice === normalized);
  });
};

applyTheme(savedTheme || "white");

document.querySelector(`[data-nav="${page}"]`)?.classList.add("is-active");

const setHeaderState = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
};

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

let themeMenu;
if (themeToggle) {
  themeMenu = document.createElement("div");
  themeMenu.className = "theme-menu";
  themeMenu.hidden = true;
  themeMenu.setAttribute("data-theme-menu", "");
  themeMenu.innerHTML = themes.map((item) => `
    <button type="button" data-theme-choice="${item.id}">
      <i style="--theme-dot:${item.color}"></i>
      <span>${item.label}</span>
    </button>
  `).join("");
  document.body.appendChild(themeMenu);

  themeToggle.addEventListener("click", () => {
    themeMenu.hidden = !themeMenu.hidden;
  });

  themeMenu.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.dataset.themeChoice);
      themeMenu.hidden = true;
    });
  });

  applyTheme(localStorage.getItem("theme") || "white");
}

const showSearch = () => {
  if (!searchModal) return;
  searchModal.hidden = false;
  requestAnimationFrame(() => searchInput?.focus());
};

const hideSearch = () => {
  if (!searchModal) return;
  searchModal.hidden = true;
};

openSearch?.addEventListener("click", showSearch);
closeSearch?.addEventListener("click", hideSearch);
searchModal?.addEventListener("click", (event) => {
  if (event.target === searchModal) hideSearch();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && searchModal && !searchModal.hidden) hideSearch();
  if (event.key === "Escape" && themeMenu && !themeMenu.hidden) themeMenu.hidden = true;
  if (event.key === "Escape") closeAboutGalleryModal?.();
});

document.addEventListener("click", (event) => {
  const galleryLike = event.target.closest?.("[data-about-gallery-like]");
  if (galleryLike) {
    event.preventDefault();
    event.stopPropagation();
    handleAboutGalleryLike?.(galleryLike);
    return;
  }
  const galleryOpen = event.target.closest?.("[data-about-gallery-open], [data-about-gallery-entry]");
  if (galleryOpen && !galleryOpen.closest("[data-about-gallery-modal]")) {
    event.preventDefault();
    openAboutGalleryModal?.();
    return;
  }
  if (event.target.closest?.("[data-about-gallery-close]")) {
    event.preventDefault();
    closeAboutGalleryModal?.();
    return;
  }
  if (!themeMenu || themeMenu.hidden) return;
  if (!themeMenu.contains(event.target) && !themeToggle?.contains(event.target)) {
    themeMenu.hidden = true;
  }
});

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#039;"
}[char]));

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
  return profile.example && profile.solution && profile.cause && profile.summary ? profile : null;
};

const renderInterviewExampleButton = (item = {}) => (
  normalizeBackendInterviewExampleCase(item)
    || item.exampleCaseReady
    || item.example_case_ready
    || item.id
    || item.slug
    || item.questionId
    || item.questionKey
    ? '<button type="button" class="train-ghost" data-card-example>实例</button>'
    : '<button type="button" class="train-ghost is-disabled" disabled title="后台实例生成完成后可查看">实例生成中</button>'
);

const renderInterviewExample = (item = {}) => {
  const profile = normalizeBackendInterviewExampleCase(item);
  if (!profile && (item.exampleCaseReady || item.example_case_ready)) {
    return `
    <div class="train-example is-pending" hidden>
      <div class="train-example-head"><strong>实例加载中</strong><span>正在读取后端详情</span></div>
      <div class="train-example-grid">
        <section><h3>提示</h3><p>后台实例已经生成，点击后会拉取完整实例。</p></section>
      </div>
    </div>
  `;
  }
  if (!profile) return "";
  const sections = [
    ["具体例子", profile.example],
    ["解决方法", profile.solution],
    ["原因分析", profile.cause],
    ["思路总结", profile.summary]
  ];
  return `
    <div class="train-example" hidden>
      <div class="train-example-head"><strong>${escapeHtml(profile.title || "实例拆解")}</strong><span>按真实项目讲</span></div>
      <div class="train-example-grid">
        ${sections.map(([title, body]) => `<section><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></section>`).join("")}
      </div>
    </div>
  `;
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const formatDateOnly = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const imageMarkup = (url, className, alt = "") => {
  const src = String(url || "").trim();
  if (!src || !/^(https?:\/\/|\/(?!\/))/i.test(src)) return "";
  return `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">`;
};

const postPagerCoverStyle = (cover = "") => {
  const src = String(cover || "").trim();
  if (!src || !/^(https?:\/\/|\/(?!\/))/i.test(src)) return "";
  return ` style="--post-pager-cover:url(&quot;${escapeHtml(src)}&quot;)"`;
};

const postPagerPanelMarkup = (item, role = "current") => {
  const labels = {
    prev: "\u4e0a\u4e00\u7bc7",
    current: "\u5f53\u524d\u5c0f\u8bb0",
    next: "\u4e0b\u4e00\u7bc7"
  };
  const fallbacks = {
    prev: "\u4e0a\u4e00\u7bc7\u5c0f\u8bb0",
    current: "\u5f53\u524d\u5c0f\u8bb0",
    next: "\u4e0b\u4e00\u7bc7\u5c0f\u8bb0"
  };
  const isCurrent = role === "current";
  const title = item?.title || fallbacks[role] || fallbacks.current;
  if (!item && !isCurrent) {
    return `<div class="post-page-panel is-adjacent is-disabled" data-pager-role="${role}"><span class="post-page-empty">${escapeHtml(title)}</span></div>`;
  }
  const date = formatDate(item?.published_at || item?.updated_at || "");
  const summary = String(item?.summary || "").trim();
  const tag = isCurrent || !item?.slug ? "div" : "a";
  const href = !isCurrent && item?.slug ? ` href="/post.html?slug=${encodeURIComponent(item.slug)}"` : "";
  const ariaCurrent = isCurrent ? ' aria-current="page"' : "";
  return `<${tag} class="post-page-panel ${isCurrent ? "is-current" : "is-adjacent"} has-post" data-pager-role="${role}"${href}${ariaCurrent}${postPagerCoverStyle(item?.cover_url)}>
    <span class="post-page-kicker">${escapeHtml(labels[role] || labels.current)}</span>
    <strong>${escapeHtml(title)}</strong>
    ${date ? `<time>${escapeHtml(date)}</time>` : ""}
    ${summary ? `<small class="post-page-summary">${escapeHtml(summary)}</small>` : ""}
  </${tag}>`;
};

const brokenImageTargets = ".project-row-cover,.project-tile-cover,.article-row-cover,.moment-item img,.detail-cover,.about-gallery-image";

const recoverBrokenImage = (image) => {
  if (!(image instanceof HTMLImageElement)) return;
  image.hidden = true;
  image.removeAttribute("src");
  image.closest(".project-row,.project-tile,.article-row,.moment-item,.post-meta-card,.project-meta-card,.about-gallery-item")?.classList.add("image-failed");
};

document.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches(brokenImageTargets)) return;
  recoverBrokenImage(image);
}, true);

const setOptionalImage = (selector, url, alt = "") => {
  const image = document.querySelector(selector);
  if (!image) return;
  const src = String(url || "").trim();
  const valid = src && /^(https?:\/\/|\/(?!\/))/i.test(src);
  image.hidden = !valid;
  if (!valid) {
    image.removeAttribute("src");
    return;
  }
  image.src = src;
  image.alt = alt;
};

let mermaidLoadPromise = null;

const ensureMermaid = () => {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  if (mermaidLoadPromise) return mermaidLoadPromise;
  mermaidLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
    script.async = true;
    script.onload = () => resolve(window.mermaid);
    script.onerror = () => reject(new Error("mermaid_load_failed"));
    document.head.appendChild(script);
  });
  return mermaidLoadPromise;
};

const renderMermaidBlocks = async (scope = document) => {
  const nodes = [...scope.querySelectorAll(".mermaid")].filter((node) => !node.dataset.processed);
  if (!nodes.length) return;
  try {
    const mermaid = await ensureMermaid();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        primaryColor: "#fff7fb",
        primaryTextColor: "#3d2a37",
        primaryBorderColor: "#ed8fbe",
        lineColor: "#cf6da0",
        secondaryColor: "#eaf8ff",
        tertiaryColor: "#f8f4ff",
        fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
      }
    });
    await mermaid.run({ nodes });
  } catch {
    nodes.forEach((node) => {
      node.classList.add("mermaid-fallback");
    });
  }
};

const localPreviewProjects = [];
const localPreviewMoments = [];
const localPreviewPosts = [];

const localPreviewInterviews = [
  { id: 301, title: "浏览器输入 URL 后发生了什么", slug: "what-happens-after-url", section: "bagu", section_label: "八股文专区", summary: "从 DNS、TCP/TLS、HTTP 缓存到浏览器渲染链路，按面试回答节奏拆成可背诵版本。", difficulty: "高频", tags: ["网络", "浏览器"], question_count: 0, finished_count: 0, sort_order: 10, updated_at: new Date().toISOString() },
  { id: 302, title: "一面复盘：项目经历怎么讲", slug: "project-interview-retro", section: "experience", section_label: "面经", summary: "把项目背景、技术决策、踩坑修复和最终结果串成 3 分钟讲述。", difficulty: "复盘", tags: ["项目", "表达"], question_count: 0, finished_count: 0, sort_order: 20, updated_at: new Date(Date.now() - 3600_000).toISOString() },
  { id: 303, title: "今日 JavaScript 高频 50 题", slug: "daily-js-50", section: "daily50", section_label: "每日 50 题", summary: "闭包、原型链、事件循环、Promise、模块化和手写题，今天先刷完一轮。", difficulty: "每日", tags: ["JavaScript", "每日50题"], question_count: 50, finished_count: 18, sort_order: 30, updated_at: new Date(Date.now() - 7200_000).toISOString() }
];

const buildLocalPreviewGithub = () => {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let index = 364; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const seed = (index * 7 + date.getDate() + date.getMonth() * 11) % 13;
    const count = date.getDay() === 0 || date.getDay() === 6 ? (seed > 9 ? 1 : 0) : Math.max(0, Math.min(6, seed - 5));
    days.push({ date: date.toISOString().slice(0, 10), count, level: count <= 0 ? 0 : Math.min(4, Math.ceil(count / 2)) });
  }
  return { username: "jlemonz", total: days.reduce((sum, day) => sum + day.count, 0), days, source: "static-preview" };
};

const localPreviewSearch = (keyword) => {
  const q = String(keyword || "").trim().toLowerCase();
  if (!q) return { items: [] };
  const items = [
    ...localPreviewProjects.map((item) => ({ id: item.id, type: "project", title: item.name, summary: item.summary || item.status_text, url: `/project.html?id=${item.id}` })),
    ...localPreviewMoments.map((item) => ({ id: item.id, type: "moment", title: item.content.slice(0, 34), summary: item.tags.map((tag) => `#${tag}`).join(" "), url: `/moments.html?kind=${item.kind}` })),
    ...localPreviewPosts.map((item) => ({ id: item.id, type: "post", title: item.title, summary: item.summary, url: `/post.html?slug=${item.slug}` })),
    ...localPreviewInterviews.map((item) => ({ id: item.id, type: "interview", title: item.title, summary: item.summary, url: `/interview.html?section=${item.section}` }))
  ];
  return { items: items.filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(q)).slice(0, 12), source: "static-preview" };
};

const localPreviewApiGet = (path) => {
  const url = new URL(path, window.location.origin);
  if (url.pathname === "/api/health") return { ok: true, database: "static-preview" };
  if (url.pathname === "/api/quote") return { text: "把想说的话慢慢写下来。", from: "Hz", source: "static-preview" };
  if (url.pathname === "/api/moyu") return { source: "static-preview", modules: [
    { label: "今日状态", title: "本地进度卡已启用", body: "接口不可用时也会显示当天周/月/年进度。", percent: 72 },
    { label: "进度", title: "内容加载中", body: "线上环境会优先读取后端真实接口。", percent: 66 }
  ] };
  if (url.pathname === "/api/weather/current") {
    const city = url.searchParams.get("city") || "北京市";
    return {
      location: { name: city, city, admin1: city.includes("北京") ? "北京市" : "四川省", country: "中国", latitude: city.includes("北京") ? 39.9042 : 30.57, longitude: city.includes("北京") ? 116.4074 : 104.07 },
      current: { temperature: 27, apparentTemperature: 31, weatherText: "多云", weatherCode: 3, windSpeed: 6, humidity: 70, isDay: true },
      daily: { max: 32, min: 23, precipitationProbability: 42 },
      updatedAt: new Date().toISOString(),
      source: "static-preview"
    };
  }
  if (url.pathname === "/api/career/events") return {
    updatedAt: new Date().toISOString(),
    days: 30,
    groups: {
      campus: [
        { id: "preview-campus-1", kind: "campus", region: "成都", source: "静态预览", title: "2026年8月29日成都高校毕业生双选会", summary: "成都人才服务中心 · 校招 / 双选 / 应届信息", date: "2026-08-29", url: "" },
        { id: "preview-campus-2", kind: "campus", region: "上海", source: "静态预览", title: "2026年9月19日青年人才就业专场招聘会", summary: "上海公共就业服务 · 校招 / 青年人才信息", date: "2026-09-19", url: "" }
      ],
      social: [
        { id: "preview-social-1", kind: "social", region: "北京", source: "静态预览", title: "2026年8月28日北京现场综合招聘会", summary: "公共就业服务大厅 · 社招 / 现场招聘会信息", date: "2026-08-28", url: "" },
        { id: "preview-social-2", kind: "social", region: "深圳", source: "静态预览", title: "2026年9月6日深圳制造业技能人才招聘会", summary: "产业园区服务中心 · 社招 / 技能岗位信息", date: "2026-09-06", url: "" }
      ]
    },
    items: [],
    source: "static-preview"
  };
  if (url.pathname === "/api/music/ddv" || url.pathname === "/api/music/breakup") return {
    updatedAt: new Date().toISOString(),
    items: [
      { id: "preview-ddv-1", title: "晴天", artist: "周杰伦", album: "叶惠美", summary: "热评：前奏一响，青春就自动回头。", artwork: "", url: "", previewUrl: "", mood: "晴朗", source: "fallback" },
      { id: "preview-ddv-2", title: "生如夏花", artist: "朴树", album: "生如夏花", summary: "热评：疲惫的时候，它像把人从原地扶起来。", artwork: "", url: "", previewUrl: "", mood: "明亮", source: "fallback" },
      { id: "preview-ddv-3", title: "Somewhere Only We Know", artist: "Keane", album: "Hopes and Fears", summary: "热评：总有一个地方，只要想起就会安静下来。", artwork: "", url: "", previewUrl: "", mood: "安静", source: "fallback" },
      { id: "preview-ddv-4", title: "Flower Dance", artist: "DJ Okawari", album: "Diorama", summary: "热评：像把一段日常剪成了轻轻发光的片段。", artwork: "", url: "", previewUrl: "", mood: "轻快", source: "fallback" }
    ],
    source: "static-preview"
  };
  if (url.pathname === "/api/thinking/questions") return {
    updatedAt: new Date().toISOString(),
    items: [
      { id: "preview-thinking-1", title: "沉没成本", prompt: "如果一个项目已经投入很多时间，但继续做的收益变低，你会用哪三个指标判断该不该停？", hint: "只看未来成本、未来收益和替代选择。", difficulty: "中等", tags: ["决策", "取舍"] },
      { id: "preview-thinking-2", title: "反事实", prompt: "如果今天的结论是错的，最可能是哪一个前提错了？你会怎么验证？", hint: "先找最关键、最脆弱的假设。", difficulty: "轻量", tags: ["验证", "表达"] }
    ],
    source: "static-preview"
  };
  if (url.pathname === "/api/tech/hotspots") return {
    updatedAt: new Date().toISOString(),
    sources: ["GitHub", "Hacker News"],
    items: [
      { id: "preview-github-ros2", source: "GitHub", title: "ROS2 Navigation Stack", summary: "机器人导航相关开源项目正在持续更新，适合追踪规划、定位和工程化实践。", url: "https://github.com/ros-navigation/navigation2", score: 12000, tags: ["robotics", "ros2"], publishedAt: new Date().toISOString(), meta: "12k stars · C++" },
      { id: "preview-hn-robotics", source: "Hacker News", title: "Robotics systems are becoming more software-defined", summary: "工程讨论聚焦机器人系统、AI 工具链和开源协作。", url: "https://news.ycombinator.com/", score: 320, tags: ["AI", "robotics"], publishedAt: new Date().toISOString(), meta: "320 points · HN" }
    ],
    source: "static-preview"
  };
  if (url.pathname === "/api/site/texts") return { texts: {}, rules: [], footerSections: undefined, layout: undefined, ui: undefined, source: "static-preview" };
  if (url.pathname === "/api/site/overview") return { stats: { posts: localPreviewPosts.length, moments: localPreviewMoments.length, projects: localPreviewProjects.length, interviews: localPreviewInterviews.length, categories: 4 }, latestMoments: localPreviewMoments.slice(0, 2), source: "static-preview" };
  if (url.pathname === "/api/github/contributions") return buildLocalPreviewGithub();
  if (url.pathname === "/api/projects") return { items: localPreviewProjects, source: "static-preview" };
  if (url.pathname.startsWith("/api/projects/")) { const key = decodeURIComponent(url.pathname.split("/").pop()); const project = localPreviewProjects.find((item) => String(item.id) === key || item.slug === key); if (project) return project; }
  if (url.pathname === "/api/interviews") { const section = url.searchParams.get("section") || ""; return { items: localPreviewInterviews.filter((item) => !section || section === "all" || item.section === section), source: "static-preview" }; }
  if (url.pathname.startsWith("/api/interviews/")) { const key = decodeURIComponent(url.pathname.split("/").pop()); const item = localPreviewInterviews.find((entry) => String(entry.id) === key || entry.slug === key); if (item) return { ...item, content_html: `<h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p>` }; }
  if (url.pathname === "/api/moments") { const kind = url.searchParams.get("kind") || ""; const q = String(url.searchParams.get("q") || "").trim().toLowerCase(); return { items: localPreviewMoments.filter((item) => (!kind || kind === "all" || item.kind === kind) && (!q || `${item.content || ""} ${(item.tags || []).join(" ")} ${item.kind || ""}`.toLowerCase().includes(q))), source: "static-preview" }; }
  if (url.pathname === "/api/posts") { const cat = url.searchParams.get("cat") || ""; return { items: localPreviewPosts.filter((item) => !cat || item.category_slug === cat), source: "static-preview" }; }
  if (url.pathname.startsWith("/api/posts/")) { const slug = decodeURIComponent(url.pathname.split("/").pop()); const post = localPreviewPosts.find((item) => item.slug === slug); if (post) return post; }
  if (url.pathname === "/api/categories") return { items: [
    { id: 1, name: "Ubuntu", slug: "linux", description: "Ubuntu、ROS、FOC 学习笔记" },
    { id: 2, name: "机器人", slug: "robot", description: "学习路线和项目复盘" },
    { id: 3, name: "服务", slug: "server", description: "Nginx、Docker 与备份" },
    { id: 4, name: "生活", slug: "life", description: "日常碎片" }
  ], source: "static-preview" };
  if (url.pathname === "/api/search") return localPreviewSearch(url.searchParams.get("q"));
  if (url.pathname === "/api/reactions") return { target: url.searchParams.get("target") || "site-home", likes: 0, source: "static-preview" };
  if (url.pathname === "/api/reactions/batch") {
    const targets = String(url.searchParams.get("targets") || "").split(",").filter(Boolean);
    return { items: targets.map((target) => ({ target, likes: 0, reacted: false })), source: "static-preview" };
  }
  throw new Error(`No static preview data for ${path}`);
};

const localBackendOrigin = `${window.location.protocol}//${window.location.hostname}:8097`;
const apiUrl = (path) => {
  if (!String(path).startsWith("/api/")) return path;
  if (["4173", "4174"].includes(window.location.port)) return `${localBackendOrigin}${path}`;
  return path;
};

const canUseLocalPreview = () => {
  const host = window.location.hostname;
  return window.location.protocol === "file:"
    || ["", "localhost", "127.0.0.1", "::1"].includes(host)
    || host.endsWith(".github.io")
    || ["4173", "4174"].includes(window.location.port);
};

const apiGet = async (path) => {
  try {
    const response = await fetch(apiUrl(path), { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`API ${path} failed`);
    return response.json();
  } catch (error) {
    if (String(path).startsWith("/api/") && canUseLocalPreview()) return localPreviewApiGet(path);
    throw error;
  }
};

const apiPost = async (path, data) => {
  try {
    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`API ${path} failed`);
    return response.json();
  } catch (error) {
    if (path === "/api/reactions/batch") {
      const targets = Array.isArray(data?.targets) ? data.targets : [];
      return { items: targets.map((target) => ({ target, likes: 0, reacted: false })), source: "static-preview" };
    }
    if (path === "/api/reactions/like") return { target: data?.target || "site-home", likes: 1, counted: true, source: "static-preview" };
    if (path === "/api/comments") return { target: data?.target || "site-home", items: [{ id: Date.now(), author_name: data?.author_name || "Guest", content: data?.content || "", created_at: new Date().toISOString(), likes: 0 }], source: "static-preview" };
    if (path === "/api/view-events") return { ok: true, target: data?.target || `page:${page}`, counted: false, source: "static-preview" };
    throw error;
  }
};

const TEXT_CORRUPTION_MARK_LIMIT = 3;
const TEXT_CORRUPTION_RATIO_LIMIT = 0.15;

const normalizeEditableText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const isCorruptEditableText = (value) => {
  const text = normalizeEditableText(value);
  if (!text) return true;
  if (text.includes("\uFFFD")) return true;
  const questionMarks = (text.match(/\?/g) || []).length;
  return /\?{2,}/.test(text)
    || (questionMarks >= TEXT_CORRUPTION_MARK_LIMIT && questionMarks / text.length > TEXT_CORRUPTION_RATIO_LIMIT);
};

const getSafeEditableText = (value, { optional = false } = {}) => {
  const text = normalizeEditableText(value);
  if (optional && !text) return "";
  return isCorruptEditableText(text) ? "" : text;
};

const SITE_TEXT_CACHE_KEY = "jlemonz:site-texts:v8";
const QUOTE_CACHE_KEY = "jlemonz:quote:hz-v1";
const WEATHER_CITY_CACHE_KEY = "jlemonz:weather-city:v7";
const WEATHER_DATA_CACHE_KEY = "jlemonz:weather-data:v7";
const defaultFrontendLayout = {
  home: {
    width: "balanced",
    density: "comfortable",
    projectPreviewLimit: 4,
    momentPreviewLimit: 2,
    showStatusStrip: true,
    showProjectPreview: true,
    showMomentPreview: true,
    showProfileCard: true,
    showStatsCard: true,
    showCategoryCard: true
  },
  archive: {
    defaultCategory: "",
    showSearchPanel: true,
    showGithubPanel: true
  },
  moments: {
    defaultKind: "all",
    showDraftPanel: true
  },
  projects: {
    cardStyle: "cover",
    showRoadmap: true,
    showMaintain: true
  },
  footer: {
    motion: "candles"
  }
};
let frontendLayout = JSON.parse(JSON.stringify(defaultFrontendLayout));
const defaultFrontendUi = {
  profile: { avatarUrl: "/assets/sailei/avatar.jpg" },
  archiveCategories: [
    { id: "all", label: "全部", slug: "", description: "所有公开小记", countText: "", href: "/archive.html", visibleInHome: false, visibleInArchive: true, sortOrder: 0 },
    { id: "robot", label: "机器人", slug: "robot", description: "机器人学习与项目记录", countText: "", href: "/archive.html?cat=robot", visibleInHome: true, visibleInArchive: true, sortOrder: 10 },
    { id: "linux", label: "Ubuntu", slug: "linux", description: "Ubuntu、ROS、FOC 学习笔记", countText: "", href: "/archive.html?cat=linux", visibleInHome: true, visibleInArchive: true, sortOrder: 20 },
    { id: "project", label: "项目", slug: "project", description: "项目复盘和阶段总结", countText: "", href: "/projects.html", visibleInHome: true, visibleInArchive: true, sortOrder: 30 },
    { id: "life", label: "生活", slug: "life", description: "日常碎片和灵感", countText: "", href: "/moments.html?kind=life", visibleInHome: true, visibleInArchive: true, sortOrder: 40 }
  ],
  aboutStackItems: [
    { id: "database", label: "PostgreSQL / MySQL", visible: true, sortOrder: 10 },
    { id: "redis", label: "Redis", visible: true, sortOrder: 20 },
    { id: "meilisearch", label: "Meilisearch", visible: true, sortOrder: 30 },
    { id: "markdown", label: "Markdown", visible: true, sortOrder: 40 },
    { id: "nginx", label: "Nginx", visible: true, sortOrder: 50 },
    { id: "backup", label: "备份", visible: true, sortOrder: 60 }
  ],
  aboutGalleryImages: [],
  momentKinds: [
    { id: "all", label: "碎片", kind: "all", subLabel: "灵机一动", visible: true, sortOrder: 0 },
    { id: "project", label: "痕迹", kind: "project", subLabel: "合理摸鱼", visible: true, sortOrder: 10 },
    { id: "life", label: "日常", kind: "life", subLabel: "是这样的", visible: true, sortOrder: 20 }
  ],
  pageChips: {
    archive: [{ id: "article", label: "小记", subLabel: "长记录", visible: true, sortOrder: 10 }, { id: "debug", label: "调试", subLabel: "可回溯", visible: true, sortOrder: 20 }, { id: "note", label: "知识", subLabel: "慢慢补", visible: true, sortOrder: 30 }],
    projects: [{ id: "public", label: "公开", subLabel: "可复盘", visible: true, sortOrder: 10 }, { id: "progress", label: "进度", subLabel: "看得见", visible: true, sortOrder: 20 }, { id: "next", label: "下一步", subLabel: "不丢线索", visible: true, sortOrder: 30 }],
    interview: [{ id: "study", label: "学习", subLabel: "知识库", visible: true, sortOrder: 10 }, { id: "daily", label: "题单", subLabel: "今日练习", visible: true, sortOrder: 20 }, { id: "review", label: "复盘", subLabel: "错题整理", visible: true, sortOrder: 30 }],
    about: [{ id: "ubuntu", label: "Ubuntu", subLabel: "系统", visible: true, sortOrder: 10 }, { id: "ros", label: "ROS", subLabel: "机器人", visible: true, sortOrder: 20 }, { id: "foc", label: "FOC", subLabel: "电机控制", visible: true, sortOrder: 30 }]
  },
  footer: { brandBody: "Ubuntu、ROS、FOC、项目和图文，慢慢归档。", tags: [{ id: "ubuntu", label: "Ubuntu", visible: true, sortOrder: 10 }, { id: "ros", label: "ROS", visible: true, sortOrder: 20 }, { id: "foc", label: "FOC", visible: true, sortOrder: 30 }] },
  searchSuggestions: [{ id: "projects", label: "项目", href: "/projects.html", visible: true, sortOrder: 10 }, { id: "notes", label: "小记", href: "/archive.html", visible: true, sortOrder: 20 }, { id: "interview", label: "面试", href: "/interview.html", visible: true, sortOrder: 30 }],
  sectionTitles: { homeProjects: "Projects", homeMoments: "Moments", homeCategory: "\u5206\u7c7b\u8109\u7edc" }
};
let frontendUi = JSON.parse(JSON.stringify(defaultFrontendUi));

const preferredMomentKinds = {
  all: { id: "all", label: "碎片", kind: "all", subLabel: "灵机一动", visible: true, sortOrder: 0 },
  project: { id: "project", label: "痕迹", kind: "project", subLabel: "合理摸鱼", visible: true, sortOrder: 10 },
  life: { id: "life", label: "日常", kind: "life", subLabel: "是这样的", visible: true, sortOrder: 20 }
};
const preferredMomentKindOrder = ["all", "project", "life"];
const legacyMomentKindText = {
  all: { label: new Set(["", "全部", "碎片"]), subLabel: new Set(["", "随手记"]) },
  project: { label: new Set(["", "项目"]), subLabel: new Set(["", "进度留痕"]) },
  life: { label: new Set(["", "生活"]), subLabel: new Set(["", "轻一点"]) }
};

const normalizeMomentKindForHero = (item = {}, fallback = {}, index = 0) => {
  const rawKind = item.kind ?? item.id ?? fallback.kind ?? fallback.id;
  const kind = safeKey(rawKind, index === 0 ? "all" : `kind-${index + 1}`);
  const preferred = preferredMomentKinds[kind];
  if (!preferred) return null;
  const legacyText = legacyMomentKindText[kind];
  const rawLabel = localizeLegacyUiText(item.label ?? fallback.label ?? preferred.label) || "";
  const rawSubLabel = localizeLegacyUiText(item.subLabel ?? fallback.subLabel ?? preferred.subLabel) || "";
  const label = legacyText.label.has(rawLabel.trim()) ? preferred.label : rawLabel;
  const subLabel = legacyText.subLabel.has(rawSubLabel.trim()) ? preferred.subLabel : rawSubLabel;
  return {
    id: preferred.id,
    label,
    kind: preferred.kind,
    subLabel,
    visible: pickLayoutBoolean(item.visible, fallback.visible ?? preferred.visible),
    sortOrder: preferred.sortOrder
  };
};

const normalizeMomentKindList = (value) => {
  const source = Array.isArray(value) ? value : [];
  const normalized = source
    .map((item, index) => normalizeMomentKindForHero(item || {}, preferredMomentKinds[item?.kind] || {}, index))
    .filter(Boolean);
  const byKind = new Map(normalized.map((item) => [item.kind, item]));
  return preferredMomentKindOrder
    .map((kind, index) => byKind.get(kind) || normalizeMomentKindForHero(preferredMomentKinds[kind], preferredMomentKinds[kind], index))
    .filter(Boolean);
};

const legacyUiTextMap = new Map(Object.entries({
  Project: "项目",
  Projects: "项目",
  Moment: "瞬间",
  Moments: "瞬间",
  Note: "小记",
  Notes: "小记",
  About: "关于",
  Blog: "FOC",
  博客: "FOC",
  Pi5: "ROS",
  PI5: "ROS",
  Linux: "Ubuntu",
  树莓派: "ROS",
  service: "服务",
  notes: "笔记",
  archive: "归档"
}));

const localizeLegacyUiText = (value) => {
  const text = getSafeEditableText(value, { optional: true });
  return legacyUiTextMap.get(text) || text;
};

const normalizeKnowledgeBrandBody = (value) => {
  const text = getSafeEditableText(value, { optional: true });
  const legacyBody = "Linux、Pi5、项目和图文，慢慢归档。";
  return text === legacyBody ? defaultFrontendUi.footer.brandBody : text;
};

const normalizeHomeSectionTitle = (value, fallback, aliases) => {
  const text = localizeLegacyUiText(value ?? fallback);
  if (!text) return fallback;
  return aliases.has(String(text).trim().toLowerCase()) ? fallback : text;
};

const pageTitleFallbackMap = new Map(Object.entries({
  "archive.hero.title": "Notes",
  "moments.hero.title": "Moments",
  "projects.hero.title": "Projects",
  "about.hero.title": "About"
}));

const pageTitleAliasMap = new Map(Object.entries({
  "小记": "Notes",
  "札记": "Notes",
  "瞬间": "Moments",
  "项目": "Projects",
  "关于": "About",
  "Notes": "Notes",
  "Moments": "Moments",
  "Projects": "Projects",
  "About": "About"
}));

const normalizePageTitleText = (key, value) => {
  const text = localizeLegacyUiText(value) || value;
  if (!pageTitleFallbackMap.has(key)) return text;
  return pageTitleAliasMap.get(String(text || "").trim()) || pageTitleFallbackMap.get(key);
};

const readCachedJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeCachedJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const pickLayoutChoice = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const pickLayoutBoolean = (value, fallback) => typeof value === "boolean" ? value : fallback;
const pickLayoutInteger = (value, min, max, fallback) => {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};
const sortByOrder = (items) => [...items].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
const safeKey = (value, fallback = "") => {
  const key = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return key || fallback;
};
const safeHref = (value, fallback = "") => {
  const href = String(value || "").trim();
  return /^(https?:\/\/|mailto:|\/(?!\/))/i.test(href) ? href : fallback;
};
const safeGalleryImageUrl = (value) => {
  const href = String(value || "").trim();
  if (/^https:\/\//i.test(href)) return href;
  if (/^\/(?:assets|uploads)\//i.test(href)) return href;
  return "";
};
const normalizeSiteHref = (value, fallback = "") => {
  const href = safeHref(value, fallback);
  if (!href || /^mailto:/i.test(href)) return href;
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return href;
    const staticRoutes = new Map([
      ["/archive", "/archive.html"],
      ["/moments", "/moments.html"],
      ["/projects", "/projects.html"],
      ["/project", "/project.html"],
      ["/post", "/post.html"],
      ["/interview", "/interview.html"],
      ["/about", "/about.html"]
    ]);
    const normalizedPath = staticRoutes.get(url.pathname.replace(/\/$/, "")) || url.pathname;
    return `${normalizedPath}${url.search}${url.hash}`;
  } catch {
    return safeHref(fallback, "");
  }
};

const normalizeFrontendLayout = (layout = {}) => {
  const source = layout && typeof layout === "object" ? layout : {};
  const home = source.home || {};
  const archive = source.archive || {};
  const moments = source.moments || {};
  const projects = source.projects || {};
  const footer = source.footer || {};
  return {
    home: {
      width: pickLayoutChoice(home.width, ["narrow", "balanced", "wide"], defaultFrontendLayout.home.width),
      density: pickLayoutChoice(home.density, ["compact", "comfortable", "airy"], defaultFrontendLayout.home.density),
      projectPreviewLimit: pickLayoutInteger(home.projectPreviewLimit, 1, 8, defaultFrontendLayout.home.projectPreviewLimit),
      momentPreviewLimit: pickLayoutInteger(home.momentPreviewLimit, 1, 6, defaultFrontendLayout.home.momentPreviewLimit),
      showStatusStrip: pickLayoutBoolean(home.showStatusStrip, defaultFrontendLayout.home.showStatusStrip),
      showProjectPreview: pickLayoutBoolean(home.showProjectPreview, defaultFrontendLayout.home.showProjectPreview),
      showMomentPreview: pickLayoutBoolean(home.showMomentPreview, defaultFrontendLayout.home.showMomentPreview),
      showProfileCard: pickLayoutBoolean(home.showProfileCard, defaultFrontendLayout.home.showProfileCard),
      showStatsCard: pickLayoutBoolean(home.showStatsCard, defaultFrontendLayout.home.showStatsCard),
      showCategoryCard: pickLayoutBoolean(home.showCategoryCard, defaultFrontendLayout.home.showCategoryCard)
    },
    archive: {
      defaultCategory: safeKey(archive.defaultCategory, defaultFrontendLayout.archive.defaultCategory),
      showSearchPanel: pickLayoutBoolean(archive.showSearchPanel, defaultFrontendLayout.archive.showSearchPanel),
      showGithubPanel: pickLayoutBoolean(archive.showGithubPanel, defaultFrontendLayout.archive.showGithubPanel)
    },
    moments: {
      defaultKind: safeKey(moments.defaultKind, defaultFrontendLayout.moments.defaultKind),
      showDraftPanel: pickLayoutBoolean(moments.showDraftPanel, defaultFrontendLayout.moments.showDraftPanel)
    },
    projects: {
      cardStyle: pickLayoutChoice(projects.cardStyle, ["cover", "compact", "minimal"], defaultFrontendLayout.projects.cardStyle),
      showRoadmap: pickLayoutBoolean(projects.showRoadmap, defaultFrontendLayout.projects.showRoadmap),
      showMaintain: pickLayoutBoolean(projects.showMaintain, defaultFrontendLayout.projects.showMaintain)
    },
    footer: {
      motion: pickLayoutChoice(footer.motion, ["candles", "loader", "both", "none"], defaultFrontendLayout.footer.motion)
    }
  };
};

const normalizeUiList = (value, fallback, normalizer) => {
  const source = Array.isArray(value) ? value : fallback;
  const normalized = source.map((item, index) => normalizer(item || {}, fallback[index] || {}, index)).filter(Boolean);
  return normalized.length ? sortByOrder(normalized) : fallback;
};

const aboutGalleryImageLimit = 1000;

const normalizeAboutGalleryImages = (value) => {
  const source = Array.isArray(value) ? value : defaultFrontendUi.aboutGalleryImages;
  const seenUrls = new Set();
  const ordered = source
    .map((item, index) => ({
      item,
      index,
      sortOrder: pickLayoutInteger(item?.sortOrder, 0, 999999, index + 1)
    }))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.index - b.index);
  const images = [];
  for (const { item, index, sortOrder } of ordered) {
    const url = safeGalleryImageUrl(item?.url);
    const urlKey = url.trim();
    if (!url || seenUrls.has(urlKey)) continue;
    seenUrls.add(urlKey);
    images.push({
      id: safeKey(item?.id || `about-gallery-${images.length + 1}`, `about-gallery-${images.length + 1}`),
      url,
      visible: pickLayoutBoolean(item?.visible, true),
      sortOrder: sortOrder || index + 1
    });
    if (images.length >= aboutGalleryImageLimit) break;
  }
  return images.map((item, index) => ({ ...item, sortOrder: index + 1 }));
};

const normalizeFrontendUi = (ui = {}) => {
  const source = ui && typeof ui === "object" ? ui : {};
  const pageChips = source.pageChips || {};
  const footer = source.footer || {};
  const sectionTitles = source.sectionTitles || {};
  const profile = source.profile || {};
  return {
    profile: {
      avatarUrl: safeHref(profile.avatarUrl || defaultFrontendUi.profile.avatarUrl, defaultFrontendUi.profile.avatarUrl)
    },
    archiveCategories: normalizeUiList(source.archiveCategories, defaultFrontendUi.archiveCategories, (item, fallback, index) => {
      const slug = safeKey(item.slug ?? fallback.slug ?? "", "");
      const fallbackHref = slug ? `/archive.html?cat=${slug}` : "/archive.html";
      return {
        id: safeKey(item.id || slug || fallback.id, `cat-${index + 1}`),
        label: localizeLegacyUiText(item.label ?? fallback.label) || "分类",
        slug,
        description: getSafeEditableText(item.description ?? fallback.description, { optional: true }),
        countText: getSafeEditableText(item.countText ?? fallback.countText, { optional: true }),
        href: normalizeSiteHref(item.href || fallback.href || fallbackHref, fallbackHref),
        visibleInHome: pickLayoutBoolean(item.visibleInHome, fallback.visibleInHome ?? true),
        visibleInArchive: pickLayoutBoolean(item.visibleInArchive, fallback.visibleInArchive ?? true),
        sortOrder: pickLayoutInteger(item.sortOrder, 0, 9999, fallback.sortOrder ?? index * 10)
      };
    }),
    aboutStackItems: normalizeUiList(source.aboutStackItems, defaultFrontendUi.aboutStackItems, (item, fallback, index) => ({
      id: safeKey(item.id || fallback.id, `stack-${index + 1}`),
      label: localizeLegacyUiText(item.label ?? fallback.label) || "技术项",
      visible: pickLayoutBoolean(item.visible, fallback.visible ?? true),
      sortOrder: pickLayoutInteger(item.sortOrder, 0, 9999, fallback.sortOrder ?? index * 10)
    })),
    aboutGalleryImages: normalizeAboutGalleryImages(source.aboutGalleryImages),
    momentKinds: normalizeMomentKindList(source.momentKinds),
    pageChips: {
      archive: normalizeUiList(pageChips.archive, defaultFrontendUi.pageChips.archive, normalizeChipItem),
      projects: normalizeUiList(pageChips.projects, defaultFrontendUi.pageChips.projects, normalizeChipItem),
      interview: normalizeUiList(pageChips.interview, defaultFrontendUi.pageChips.interview, normalizeChipItem),
      about: normalizeUiList(pageChips.about, defaultFrontendUi.pageChips.about, normalizeChipItem)
    },
    footer: {
      brandBody: normalizeKnowledgeBrandBody(footer.brandBody ?? defaultFrontendUi.footer.brandBody),
      tags: normalizeUiList(footer.tags, defaultFrontendUi.footer.tags, (item, fallback, index) => ({
        id: safeKey(item.id || fallback.id, `footer-tag-${index + 1}`),
        label: localizeLegacyUiText(item.label ?? fallback.label) || "标签",
        visible: pickLayoutBoolean(item.visible, fallback.visible ?? true),
        sortOrder: pickLayoutInteger(item.sortOrder, 0, 9999, fallback.sortOrder ?? index * 10)
      }))
    },
    searchSuggestions: normalizeUiList(source.searchSuggestions, defaultFrontendUi.searchSuggestions, (item, fallback, index) => ({
      id: safeKey(item.id || fallback.id, `suggestion-${index + 1}`),
      label: localizeLegacyUiText(item.label ?? fallback.label) || "入口",
      href: normalizeSiteHref(item.href || fallback.href, "/"),
      visible: pickLayoutBoolean(item.visible, fallback.visible ?? true),
      sortOrder: pickLayoutInteger(item.sortOrder, 0, 9999, fallback.sortOrder ?? index * 10)
    })),
    sectionTitles: {
      homeProjects: normalizeHomeSectionTitle(sectionTitles.homeProjects, "Projects", new Set(["\u9879\u76ee", "project", "projects"])),
      homeMoments: normalizeHomeSectionTitle(sectionTitles.homeMoments, "Moments", new Set(["\u77ac\u95f4", "moment", "moments"])),
      homeCategory: normalizeHomeStatusTitle(sectionTitles.homeCategory ?? defaultFrontendUi.sectionTitles.homeCategory)
    }
  };
};

function normalizeChipItem(item = {}, fallback = {}, index = 0) {
  return {
    id: safeKey(item.id || fallback.id, `chip-${index + 1}`),
    label: localizeLegacyUiText(item.label ?? fallback.label) || "标签",
    subLabel: localizeLegacyUiText(item.subLabel ?? fallback.subLabel),
    visible: pickLayoutBoolean(item.visible, fallback.visible ?? true),
    sortOrder: pickLayoutInteger(item.sortOrder, 0, 9999, fallback.sortOrder ?? index * 10)
  };
}

const setLayoutVisibility = (key, visible) => {
  document.querySelectorAll(`[data-layout-key="${CSS.escape(key)}"]`).forEach((node) => {
    node.toggleAttribute("hidden", !visible);
    node.dataset.layoutHidden = visible ? "false" : "true";
  });
};

const chipMarkup = (chip, targetPrefix) => `
  <span class="hero-chip" data-edit-target="${targetPrefix}:${escapeHtml(chip.id)}">
    <span class="hero-chip-btn">
      <strong>${escapeHtml(chip.label)}</strong>
      <span aria-hidden="true" class="hero-chip-glitch">${escapeHtml(chip.label)}</span>
      <small>${escapeHtml(chip.subLabel || "")}</small>
    </span>
  </span>
`;

const renderPageChips = (name, items) => {
  const container = document.querySelector(`[data-page-chips="${CSS.escape(name)}"]`);
  if (!container) return;
  const chips = sortByOrder(items || []).filter((item) => item.visible);
  if (chips.length) container.innerHTML = chips.map((chip) => chipMarkup(chip, `ui:page-chip:${name}`)).join("");
};

const normalizeHomeStatusTitle = (value) => {
  const text = localizeLegacyUiText(value);
  const key = String(text || "").trim().toLowerCase();
  if (!key || ["\u6574\u7406\u72b6\u6001", "\u5206\u7c7b\u5165\u53e3", "\u5206\u7c7b", "category", "categories", "\u9352\u55d9\u7c7b\u935f\u5fdb\u5f49"].includes(key)) return "\u5206\u7c7b\u8109\u7edc";
  return text;
};

const renderArchiveCategories = (categories) => {
  const normalized = sortByOrder(categories || []);
  const archive = document.querySelector("[data-archive-categories]");
  if (archive) {
    const items = normalized.filter((item) => item.visibleInArchive);
    if (items.length) {
      archive.innerHTML = items.map((item) => {
        const fallbackHref = item.slug ? `/archive.html?cat=${item.slug}` : "/archive.html";
        const href = normalizeSiteHref(item.href, fallbackHref);
        return `<a href="${escapeHtml(href)}" data-edit-target="ui:archive-category:${escapeHtml(item.id)}">${escapeHtml(item.label)}</a>`;
      }).join("");
    }
  }
};
const renderProfileUi = (profile) => {
  const avatarUrl = safeHref(profile?.avatarUrl, defaultFrontendUi.profile.avatarUrl);
  document.querySelectorAll("[data-profile-avatar]").forEach((image) => {
    image.dataset.editTarget = "ui:profile:avatarUrl";
    image.src = avatarUrl;
  });
};

const renderAboutStackItems = (items) => {
  const stackItems = sortByOrder(items || []).filter((item) => item.visible);
  document.querySelectorAll("[data-about-stack-items]").forEach((container) => {
    if (!stackItems.length) return;
    container.innerHTML = stackItems.map((item) => (
      `<span data-edit-target="ui:about-stack:${escapeHtml(item.id)}">${escapeHtml(item.label)}</span>`
    )).join("");
  });
};

let aboutGalleryImagesAll = [];
const aboutGalleryLikeCache = new Map();

const shuffleItems = (items) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

const applyAboutGalleryImageShape = (image) => {
  const item = image.closest(".about-gallery-item");
  if (!item || !image.naturalWidth || !image.naturalHeight) return;
  const ratio = Math.max(0.35, Math.min(2.8, image.naturalWidth / image.naturalHeight));
  item.style.setProperty("--ratio", ratio.toFixed(3));
  item.classList.remove("is-wide", "is-tall", "is-square");
  item.classList.add(ratio >= 1.35 ? "is-wide" : ratio <= 0.78 ? "is-tall" : "is-square");
};

const aboutGalleryLikeTarget = (item) => `about-gallery:${safeKey(item?.id || item?.url || "image", "image")}`;

const aboutGalleryLikeCount = (item) => Number(aboutGalleryLikeCache.get(aboutGalleryLikeTarget(item))?.likes || 0);

const updateAboutGalleryLikeNodes = (target, data = {}) => {
  document.querySelectorAll("[data-about-gallery-like]").forEach((button) => {
    if (button.dataset.likeTarget !== target) return;
    const count = Number(data.likes || 0);
    button.querySelector("[data-like-count]")?.replaceChildren(document.createTextNode(String(count)));
    button.classList.toggle("is-liked", Boolean(data.reacted));
    const checkbox = button.querySelector(".checkbox");
    if (checkbox) checkbox.checked = Boolean(data.reacted);
  });
};

const hydrateAboutGalleryLikes = async (items = aboutGalleryImagesAll) => {
  const targets = [...new Set((items || []).map(aboutGalleryLikeTarget).filter(Boolean))];
  const chunkSize = 80;
  for (let index = 0; index < targets.length; index += chunkSize) {
    const chunk = targets.slice(index, index + chunkSize);
    try {
      const data = await apiPost("/api/reactions/batch", { targets: chunk });
      (data.items || []).forEach((item) => {
        const target = item.target;
        if (!target) return;
        aboutGalleryLikeCache.set(target, { likes: Number(item.likes || 0), reacted: Boolean(item.reacted) });
        updateAboutGalleryLikeNodes(target, aboutGalleryLikeCache.get(target));
      });
    } catch {}
  }
};

const handleAboutGalleryLike = async (button) => {
  const target = button?.dataset?.likeTarget;
  if (!target || button.dataset.loading === "true") return;
  button.dataset.loading = "true";
  button.classList.add("is-loading");
  try {
    const data = await apiPost("/api/reactions/like", { target });
    aboutGalleryLikeCache.set(target, { likes: Number(data.likes || 0), reacted: true });
    updateAboutGalleryLikeNodes(target, aboutGalleryLikeCache.get(target));
    document.querySelectorAll(`[data-about-gallery-like][data-like-target="${CSS.escape(target)}"]`).forEach((likeNode) => {
      likeNode.classList.remove("is-burst");
      void likeNode.offsetWidth;
      likeNode.classList.add("is-burst");
      window.setTimeout(() => likeNode.classList.remove("is-burst"), 720);
    });
  } catch {
  } finally {
    button.dataset.loading = "false";
    button.classList.remove("is-loading");
  }
};

const aboutGalleryItemMarkup = (item, index, { modal = false } = {}) => `
  <figure class="about-gallery-item${modal ? " is-modal" : ""}" style="--ratio:1;" data-about-gallery-entry data-edit-target="ui:about-gallery:${escapeHtml(item.id)}">
    ${modal ? `<span class="about-gallery-rank">#${index + 1}</span>` : ""}
    <span class="about-gallery-frame">
      <img class="about-gallery-image" src="${escapeHtml(item.url)}" alt="About gallery ${index + 1}" loading="lazy" decoding="async">
    </span>
    <label class="about-gallery-like heart-container" title="Like" data-about-gallery-like data-like-target="${escapeHtml(aboutGalleryLikeTarget(item))}" aria-label="Like this photo">
      <input type="checkbox" class="checkbox" autocomplete="off">
      <div class="svg-container" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="svg-outline" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Zm-3.585,18.4a2.973,2.973,0,0,1-3.83,0C4.947,16.006,2,11.87,2,8.967a4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,11,8.967a1,1,0,0,0,2,0,4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,22,8.967C22,11.87,19.053,16.006,13.915,20.313Z"></path>
        </svg>
        <svg viewBox="0 0 24 24" class="svg-filled" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Z"></path>
        </svg>
        <svg class="svg-celebrate" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <polygon points="10,10 20,20"></polygon>
          <polygon points="10,50 20,50"></polygon>
          <polygon points="20,80 30,70"></polygon>
          <polygon points="90,10 80,20"></polygon>
          <polygon points="90,50 80,50"></polygon>
          <polygon points="80,80 70,70"></polygon>
        </svg>
      </div>
      <strong class="about-gallery-like-count" data-like-count>${aboutGalleryLikeCount(item)}</strong>
    </label>
  </figure>
`;

const bindAboutGalleryImages = (container) => {
  container?.querySelectorAll(".about-gallery-image").forEach((image) => {
    image.addEventListener("load", () => applyAboutGalleryImageShape(image), { once: true });
    if (image.complete && image.naturalWidth) applyAboutGalleryImageShape(image);
  });
};

const renderAboutGalleryModal = () => {
  const modalGrid = document.querySelector("[data-about-gallery-modal-grid]");
  if (!modalGrid) return;
  const rankedImages = [...aboutGalleryImagesAll].sort((a, b) => (
    aboutGalleryLikeCount(b) - aboutGalleryLikeCount(a)
    || (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
  ));
  modalGrid.innerHTML = rankedImages.map((item, index) => (
    aboutGalleryItemMarkup(item, index, { modal: true })
  )).join("");
  bindAboutGalleryImages(modalGrid);
};

const openAboutGalleryModal = async () => {
  const modal = document.querySelector("[data-about-gallery-modal]");
  if (!modal || !aboutGalleryImagesAll.length) return;
  renderAboutGalleryModal();
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("about-gallery-modal-open");
  await hydrateAboutGalleryLikes(aboutGalleryImagesAll);
  renderAboutGalleryModal();
};

const closeAboutGalleryModal = () => {
  const modal = document.querySelector("[data-about-gallery-modal]");
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("about-gallery-modal-open");
};

const renderAboutGalleryImages = (items) => {
  const grid = document.querySelector("[data-about-gallery-grid]");
  if (!grid) return;
  const openButton = document.querySelector("[data-about-gallery-open]");
  const images = sortByOrder(items || []).filter((item) => item.visible && safeGalleryImageUrl(item.url));
  aboutGalleryImagesAll = images;
  if (!images.length) {
    grid.innerHTML = '<div class="about-gallery-empty">后台添加图片链接后展示</div>';
    if (openButton) openButton.hidden = true;
    closeAboutGalleryModal();
    return;
  }
  const previewCount = images.length <= 5 ? images.length : 4 + Math.floor(Math.random() * 2);
  const previewImages = shuffleItems(images).slice(0, previewCount);
  if (openButton) {
    openButton.hidden = false;
    openButton.innerHTML = '<span></span><span></span><span></span><span></span><span>BANK</span>';
    openButton.title = "Reze Bank";
    openButton.setAttribute("aria-label", "Open Reze Bank");
  }
  grid.innerHTML = previewImages.map((item, index) => aboutGalleryItemMarkup(item, index)).join("");
  bindAboutGalleryImages(grid);
  hydrateAboutGalleryLikes(previewImages);
};

const renderMomentKinds = (kinds) => {
  const container = document.querySelector("[data-moment-kinds]");
  if (!container) return;
  const active = currentMomentFilter || "all";
  const items = sortByOrder(kinds || []).filter((item) => item.visible);
  if (!items.length) return;
  container.innerHTML = items.map((item) => {
    const isActive = item.kind === active;
    return `
      <button type="button" class="hero-chip${isActive ? " active" : ""}" data-filter="${escapeHtml(item.kind)}" role="tab" aria-selected="${String(isActive)}" data-edit-target="ui:moment-kind:${escapeHtml(item.id)}">
        <span class="hero-chip-btn">
          <strong>${escapeHtml(item.label)}</strong>
          <span aria-hidden="true" class="hero-chip-glitch">${escapeHtml(item.label)}</span>
          <small>${escapeHtml(item.subLabel || "")}</small>
        </span>
      </button>
    `;
  }).join("");
};

const renderFooterUi = (footer) => {
  const body = getSafeEditableText(footer?.brandBody, { optional: true });
  document.querySelectorAll("[data-footer-brand-body]").forEach((node) => {
    if (body) node.textContent = body;
    node.dataset.editTarget = "ui:footer:brandBody";
  });
  const tags = sortByOrder(footer?.tags || []).filter((item) => item.visible);
  document.querySelectorAll("[data-footer-tags]").forEach((node) => {
    if (tags.length) {
      node.innerHTML = tags.map((item) => `<span data-edit-target="ui:footer-tag:${escapeHtml(item.id)}">${escapeHtml(item.label)}</span>`).join("");
    }
  });
  renderFooterLyric();
};

const footerLyricPool = [
  { line1: "风从页面旁边经过", line2: "把今天翻到下一页", note: "footer note · page drift" },
  { line1: "夜色把灯慢慢收好", line2: "我把没写完的留给明天", note: "footer note · keep writing" },
  { line1: "路过的云停了一秒", line2: "像替我保存了片刻", note: "footer note · soft cache" },
  { line1: "旧日子没有消失", line2: "只是换了一个更轻的名字", note: "footer note · memory" },
  { line1: "晚风把句子吹散", line2: "又在下一页重新排好", note: "footer note · rotating" },
  { line1: "灯光落在键盘上", line2: "像把心事调成低亮度", note: "footer note · low light" },
  { line1: "把今天折成一枚书签", line2: "夹在还没到来的地方", note: "footer note · bookmark" },
  { line1: "时间没有停下来", line2: "只是走得比我温柔一点", note: "footer note · slow step" }
];

const renderFooterLyric = () => {
  const blocks = document.querySelectorAll(".footer-lyric-card blockquote");
  if (!blocks.length) return;
  const seed = `${page}:${new Date().toDateString()}:${Math.floor(Date.now() / 60000)}`;
  const index = Math.abs([...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) + Math.floor(Math.random() * footerLyricPool.length)) % footerLyricPool.length;
  const lyric = footerLyricPool[index] || footerLyricPool[0];
  blocks.forEach((node) => {
    node.dataset.footerLyric = "active";
    node.innerHTML = `${escapeHtml(lyric.line1)}<br><span>${escapeHtml(lyric.line2)}</span>`;
  });
  document.querySelectorAll("[data-footer-lyric-note], .footer-lyric-card small").forEach((node) => {
    node.textContent = lyric.note;
  });
};

const renderSearchSuggestionsUi = (items) => {
  const suggestions = sortByOrder(items || []).filter((item) => item.visible);
  if (!suggestions.length) return;
  document.querySelectorAll("[data-search-results]").forEach((node) => {
    node.innerHTML = suggestions.map((item) => {
      const href = normalizeSiteHref(item.href, "/");
      return `<a href="${escapeHtml(href)}" data-edit-target="ui:search-suggestion:${escapeHtml(item.id)}">${escapeHtml(item.label)}</a>`;
    }).join("");
  });
};

const applyFrontendUi = (ui) => {
  frontendUi = normalizeFrontendUi(ui || defaultFrontendUi);
  renderProfileUi(frontendUi.profile);
  renderArchiveCategories(frontendUi.archiveCategories);
  renderAboutStackItems(frontendUi.aboutStackItems);
  renderAboutGalleryImages(frontendUi.aboutGalleryImages);
  renderMomentKinds(frontendUi.momentKinds);
  renderPageChips("archive", frontendUi.pageChips.archive);
  renderPageChips("projects", frontendUi.pageChips.projects);
  renderPageChips("interview", frontendUi.pageChips.interview);
  renderPageChips("about", frontendUi.pageChips.about);
  renderFooterUi(frontendUi.footer);
  renderSearchSuggestionsUi(frontendUi.searchSuggestions);
  document.querySelectorAll("[data-ui-text='home.section.projects']").forEach((node) => {
    node.textContent = frontendUi.sectionTitles.homeProjects;
    node.dataset.editTarget = "ui:sectionTitles:homeProjects";
  });
  document.querySelectorAll("[data-ui-text='home.section.moments']").forEach((node) => {
    node.textContent = frontendUi.sectionTitles.homeMoments;
    node.dataset.editTarget = "ui:sectionTitles:homeMoments";
  });
  document.querySelectorAll("[data-ui-text='home.section.category']").forEach((node) => {
    node.textContent = frontendUi.sectionTitles.homeCategory;
    node.dataset.editTarget = "ui:sectionTitles:homeCategory";
  });
  applyArchiveCategoryState();
  if (page === "moments") applyMomentFilter(currentMomentFilter);
};

const applyFrontendLayout = (layout) => {
  frontendLayout = normalizeFrontendLayout(layout || defaultFrontendLayout);
  document.body.dataset.layoutWidth = frontendLayout.home.width;
  document.body.dataset.layoutDensity = frontendLayout.home.density;
  document.body.dataset.projectCardStyle = frontendLayout.projects.cardStyle;
  document.body.dataset.footerMotion = frontendLayout.footer.motion;

  setLayoutVisibility("home.statusStrip", frontendLayout.home.showStatusStrip);
  setLayoutVisibility("home.projectPreview", frontendLayout.home.showProjectPreview);
  setLayoutVisibility("home.momentPreview", frontendLayout.home.showMomentPreview);
  setLayoutVisibility("home.profileCard", frontendLayout.home.showProfileCard);
  setLayoutVisibility("home.statsCard", frontendLayout.home.showStatsCard);
  setLayoutVisibility("home.categoryCard", frontendLayout.home.showCategoryCard);
  setLayoutVisibility("archive.searchPanel", frontendLayout.archive.showSearchPanel);
  setLayoutVisibility("archive.githubPanel", frontendLayout.archive.showGithubPanel);
  setLayoutVisibility("moments.draftPanel", frontendLayout.moments.showDraftPanel);
  setLayoutVisibility("projects.roadmap", frontendLayout.projects.showRoadmap);
  setLayoutVisibility("projects.maintain", frontendLayout.projects.showMaintain);

  if (page === "archive") applyArchiveCategoryState();
  if (page === "moments" && typeof applyMomentFilter === "function") {
    const urlKind = new URLSearchParams(window.location.search).get("kind");
    const filter = urlKind || frontendLayout.moments.defaultKind || "all";
    currentMomentFilter = filter;
    document.querySelectorAll("[data-filter]").forEach((button) => {
      const isActive = (button.dataset.filter || "all") === filter;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
    applyMomentFilter(filter);
  }
};

const setSearchInputPrompt = (value) => {
  const prompt = getSafeEditableText(value, { optional: true }) || "试试 Ubuntu、ROS、FOC、机器人项目...";
  document.querySelectorAll("[data-search-input]").forEach((input) => {
    input.setAttribute("placeholder", prompt);
    input.setAttribute("aria-label", prompt);
  });
};

setSearchInputPrompt();

const renderFooterSections = (sections) => {
  const footer = document.querySelector("[data-footer-sections]");
  if (!footer || !Array.isArray(sections) || !sections.length) return;
  const markup = sections.filter((section) => {
    const title = getSafeEditableText(section?.title);
    return title && title !== "站内" && title !== "站内入口";
  }).map((section) => {
    const title = getSafeEditableText(section?.title);
    const links = Array.isArray(section?.links) ? section.links : [];
    if (!title || !links.length) return "";
    const items = links.map((link) => {
      const label = getSafeEditableText(link?.label);
      const href = String(link?.href || "").trim();
      if (!label || !href) return "";
      const externalAttrs = /^https?:\/\//i.test(href) ? ' target="_blank" rel="noreferrer"' : "";
      return `<a href="${escapeHtml(href)}"${externalAttrs}><span>${escapeHtml(label)}</span></a>`;
    }).join("");
    return items ? `<nav class="footer-links" aria-label="${escapeHtml(title)}"><p>${escapeHtml(title)}</p>${items}</nav>` : "";
  }).join("");
  if (markup) footer.innerHTML = markup;
};

const createAnimeLogoSvgNode = (tag, attrs = {}) => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
};

const subpageLogoKickers = {
  moments: "Moments",
  archive: "Notes",
  interview: "Interview",
  projects: "Projects",
  about: "About"
};

const createLogoSpan = (className, text, hidden = false) => {
  const span = document.createElement("span");
  span.className = className;
  if (hidden) span.setAttribute("aria-hidden", "true");
  span.textContent = text;
  return span;
};

const renderSubpageAnimeLogo = (node, text) => {
  node.classList.add("anime-logo", "anime-logo-subpage");
  node.setAttribute("aria-label", text);
  node.dataset.logoText = text;
  node.textContent = "";

  const badge = document.createElement("span");
  badge.className = "anime-title-badge";
  badge.append(
    createLogoSpan("anime-title-kicker", subpageLogoKickers[page] || "角色档案", true),
    createLogoSpan("anime-title-text", text),
    createLogoSpan("anime-title-spark", "✦", true)
  );

  const underline = document.createElement("span");
  underline.className = "anime-title-underline";
  underline.setAttribute("aria-hidden", "true");

  node.append(badge, underline);
};

const renderAnimeLogo = (node, value = "Jlemonz") => {
  if (!node) return;
  const rawText = getSafeEditableText(value) || "Jlemonz";
  if (node.dataset.animeLogo === "subpage") {
    renderSubpageAnimeLogo(node, rawText);
    return;
  }
  const isHomeLogo = node.dataset.animeLogo === "true";
  const text = isHomeLogo ? "Jlemonz" : rawText;
  const uniqueId = `animeLogo${Math.random().toString(36).slice(2)}`;
  const gradientId = `${uniqueId}Gradient`;
  const glowId = `${uniqueId}Glow`;
  const cleanText = text.replace(/\s+/g, "").toLowerCase();

  node.classList.add("anime-logo");
  node.setAttribute("aria-label", text);
  node.dataset.logoText = text;
  node.textContent = "";

  const visual = document.createElement("span");
  visual.className = "anime-logo-visual";
  visual.setAttribute("aria-hidden", "true");

  const svg = createAnimeLogoSvgNode("svg", {
    class: cleanText === "jlemonz" ? "anime-logo-svg anime-logo-svg-handmade" : "anime-logo-svg anime-logo-svg-text",
    viewBox: cleanText === "jlemonz" ? "0 0 920 270" : "0 0 850 230",
    role: "img",
    focusable: "false",
    preserveAspectRatio: "xMidYMid meet"
  });

  const defs = createAnimeLogoSvgNode("defs");
  const gradient = createAnimeLogoSvgNode("linearGradient", {
    id: gradientId,
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%"
  });
  [
    ["0%", "#ffffff"],
    ["26%", "#fff1fb"],
    ["48%", "#ffb2dd"],
    ["68%", "#ff62b4"],
    ["86%", "#f22b94"],
    ["100%", "#fff8fd"]
  ].forEach(([offset, color]) => gradient.appendChild(createAnimeLogoSvgNode("stop", { offset, "stop-color": color })));

  const filter = createAnimeLogoSvgNode("filter", {
    id: glowId,
    x: "-16%",
    y: "-34%",
    width: "132%",
    height: "180%"
  });
  filter.appendChild(createAnimeLogoSvgNode("feDropShadow", {
    dx: "0",
    dy: "9",
    stdDeviation: "7",
    "flood-color": "#ff72bf",
    "flood-opacity": ".5"
  }));
  filter.appendChild(createAnimeLogoSvgNode("feDropShadow", {
    dx: "11",
    dy: "14",
    stdDeviation: "0",
    "flood-color": "#2b1130",
    "flood-opacity": ".58"
  }));
  defs.append(gradient, filter);
  svg.appendChild(defs);

  const burst = createAnimeLogoSvgNode("g", { class: "anime-logo-burst" });
  [
    "M70 132 L8 114 L80 93 Z",
    "M768 56 L904 20 L792 98 Z",
    "M735 174 L894 204 L752 143 Z",
    "M142 55 L94 10 L168 73 Z",
    "M326 26 L384 4 L359 66 Z"
  ].forEach((path) => burst.appendChild(createAnimeLogoSvgNode("path", { d: path })));

  const marks = createAnimeLogoSvgNode("g", { class: "anime-logo-marks" });
  [
    ["circle", { cx: "760", cy: "44", r: "8" }],
    ["circle", { cx: "812", cy: "126", r: "5" }],
    ["circle", { cx: "132", cy: "186", r: "6" }],
    ["path", { d: "M824 74 l9 20 22 3-17 14 5 22-19-11-19 11 5-22-17-14 22-3z" }],
    ["path", { d: "M196 28 l7 15 17 2-13 11 4 17-15-8-15 8 4-17-13-11 17-2z" }],
    ["path", { d: "M750 24 c18 6 27 15 36 31-28-7-45-15-62-28 9-6 17-8 26-3z" }]
  ].forEach(([tag, attrs]) => marks.appendChild(createAnimeLogoSvgNode(tag, attrs)));

  const createPath = (className, d, attrs = {}) => createAnimeLogoSvgNode("path", {
    class: className,
    d,
    fill: "none",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    ...attrs
  });

  if (cleanText === "jlemonz") {
    const glyphs = [
      { char: "J", x: 58, y: 183, size: 170, rotate: -11, skew: -18, stretch: .94 },
      { char: "l", x: 182, y: 177, size: 150, rotate: 7, skew: -12, stretch: .78 },
      { char: "e", x: 249, y: 182, size: 154, rotate: -8, skew: -14, stretch: 1.02 },
      { char: "m", x: 356, y: 183, size: 150, rotate: 5, skew: -14, stretch: 1.08 },
      { char: "o", x: 526, y: 182, size: 153, rotate: -9, skew: -13, stretch: 1 },
      { char: "n", x: 639, y: 182, size: 151, rotate: 6, skew: -14, stretch: .98 },
      { char: "z", x: 754, y: 183, size: 156, rotate: -10, skew: -15, stretch: 1.08 }
    ];
    const underpaint = createAnimeLogoSvgNode("path", {
      class: "anime-logo-underpaint",
      d: "M52 169 C120 60 248 55 330 112 C420 24 552 52 606 118 C688 54 810 65 873 137 C842 231 708 230 632 200 C542 251 418 235 348 199 C244 245 110 238 52 169 Z"
    });
    const logoGroup = createAnimeLogoSvgNode("g", {
      class: "anime-logo-lettering anime-logo-handmade-lettering",
      filter: `url(#${glowId})`,
      transform: "translate(0 0)"
    });
    [
      ["jm-glyph-layer jm-glyph-shadow", { fill: "#2b1130", stroke: "#2b1130", "stroke-width": "42", opacity: ".48" }, "translate(14 16)"],
      ["jm-glyph-layer jm-glyph-black", { fill: "#ffd7ef", stroke: "#2a102f", "stroke-width": "39" }],
      ["jm-glyph-layer jm-glyph-paper", { fill: "#fff8fd", stroke: "#fff8fd", "stroke-width": "24" }],
      ["jm-glyph-layer jm-glyph-fill", { fill: `url(#${gradientId})`, stroke: "#ffe8f7", "stroke-width": "8" }],
      ["jm-glyph-layer jm-glyph-shine", { fill: "none", stroke: "#ffffff", "stroke-width": "4", "stroke-dasharray": "28 68", "stroke-dashoffset": "8", opacity: ".9" }]
    ].forEach(([className, attrs, layerTransform]) => {
      const layer = createAnimeLogoSvgNode("g", {
        class: className,
        ...(layerTransform ? { transform: layerTransform } : {})
      });
      glyphs.forEach((glyph) => {
        const glyphNode = createAnimeLogoSvgNode("text", {
          class: "jm-glyph-text",
          x: "0",
          y: "0",
          "font-size": String(glyph.size),
          transform: `translate(${glyph.x} ${glyph.y}) rotate(${glyph.rotate}) skewX(${glyph.skew}) scale(${glyph.stretch} 1)`,
          ...attrs
        });
        glyphNode.textContent = glyph.char;
        layer.appendChild(glyphNode);
      });
      logoGroup.appendChild(layer);
    });

    const slashes = createAnimeLogoSvgNode("g", { class: "anime-logo-cutlines anime-logo-speedlines" });
    [
      "M66 88 L256 58",
      "M284 178 L622 126",
      "M604 83 L842 50",
      "M58 205 L290 168",
      "M706 224 L902 190"
    ].forEach((d) => slashes.appendChild(createPath("anime-logo-speedline", d)));
    svg.append(burst, underpaint, marks, logoGroup, slashes);
  } else {
    const logoGroup = createAnimeLogoSvgNode("g", {
      class: "anime-logo-lettering anime-logo-text-lettering",
      filter: `url(#${glowId})`,
      transform: "skewX(-9)"
    });
    const makeText = (className, extra = {}) => {
      const textNode = createAnimeLogoSvgNode("text", {
        class: `anime-logo-text ${className}`,
        x: "42",
        y: "146",
        textLength: "710",
        lengthAdjust: "spacingAndGlyphs",
        ...extra
      });
      textNode.textContent = text;
      return textNode;
    };
    logoGroup.append(
      makeText("anime-logo-text-shadow"),
      makeText("anime-logo-text-outer"),
      makeText("anime-logo-text-inner"),
      makeText("anime-logo-text-fill", { fill: `url(#${gradientId})` }),
      makeText("anime-logo-text-slice anime-logo-text-slice-top"),
      makeText("anime-logo-text-slice anime-logo-text-slice-bottom")
    );
    const cutLines = createAnimeLogoSvgNode("g", { class: "anime-logo-cutlines" });
    ["M70 78 L255 52", "M326 158 L628 115", "M578 72 L770 50", "M54 171 L255 141"].forEach((d) => cutLines.appendChild(createPath("anime-logo-speedline", d)));
    svg.append(burst, marks, logoGroup, cutLines);
  }

  visual.appendChild(svg);

  const caption = document.createElement("span");
  caption.className = "anime-logo-caption";
  caption.setAttribute("aria-hidden", "true");
  caption.textContent = cleanText === "jlemonz" ? "个人学习档案" : "角色档案";

  node.append(visual, caption);
};

const renderExistingAnimeLogos = () => {
  document.querySelectorAll("[data-anime-logo]").forEach((node) => {
    renderAnimeLogo(node, node.dataset.logoText || node.textContent || node.getAttribute("aria-label") || "Jlemonz");
  });
};

const applyEditableTextData = (data) => {
  const texts = data?.texts || {};
  Object.entries(texts).forEach(([key, value]) => {
    const normalizedValue = getSafeEditableText(normalizePageTitleText(key, value));
    if (!normalizedValue) return;
    document.querySelectorAll(`[data-text-key="${CSS.escape(key)}"]`).forEach((node) => {
      const attrs = (node.dataset.textAttr || "").split(",").map((item) => item.trim()).filter(Boolean);
      if (attrs.length) {
        attrs.forEach((attr) => node.setAttribute(attr, normalizedValue));
      } else if (node.dataset.animeLogo) {
        renderAnimeLogo(node, normalizedValue);
      } else {
        node.textContent = normalizedValue;
      }
    });
  });
  setSearchInputPrompt(texts["shared.search.input"]);
  applyFrontendLayout(data?.layout);
  applyFrontendUi(data?.ui);
  (data?.rules || []).forEach((rule) => {
    if (!rule.selector) return;
    const safeValue = getSafeEditableText(rule.value, { optional: true });
    if (rule.value && !safeValue) return;
    try {
      document.querySelectorAll(rule.selector).forEach((node) => {
        if (rule.attr) {
          node.setAttribute(rule.attr, safeValue);
        } else {
          node.textContent = safeValue;
        }
      });
    } catch {}
  });
  renderFooterSections(data?.footerSections);
};

const hydrateEditableTextsFromCache = () => {
  // Keep first paint tied to the deployed static HTML instead of stale localStorage.
  // The live API still applies immediately after load, then refreshes this cache.
  return;
};

const applyEditableTexts = async () => {
  try {
    const data = await apiGet("/api/site/texts");
    applyEditableTextData(data);
    if (!isVisualEditor) writeCachedJson(SITE_TEXT_CACHE_KEY, data);
  } catch {}
};

const momentMarkup = (item) => {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const image = item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="" loading="lazy">` : "";
  const body = `
    <div>
      <time datetime="${escapeHtml(item.created_at || "")}">${formatDate(item.created_at)}</time>
      <p>${escapeHtml(item.content)}</p>
      <div class="tags">${tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>
    </div>
    ${image}
  `;
  return `<article class="moment-item${image ? " with-image" : ""}" data-kind="${escapeHtml(item.kind || "life")}" data-edit-target="content:moment:${escapeHtml(item.id || "")}">${body}</article>`;
};

const projectProgressValue = (item) => Math.max(0, Math.min(100, Math.round(Number(item?.progress) || 0)));

const projectProgressMarkup = (progress, label = "项目进度") => `
  <div class="rangeWrapper project-progress-kawaii" aria-label="${escapeHtml(`${label} ${progress}%`)}" style="--project-progress:${progress}%">
    <input class="kawaii" type="range" min="0" max="100" value="${progress}" tabindex="-1" aria-hidden="true">
    <strong>${progress}%</strong>
  </div>
`;

const projectRowMarkup = (item) => {
  const progress = projectProgressValue(item);
  return `
  <a class="project-row${item.cover_url ? " has-cover" : ""}" href="/project.html?id=${encodeURIComponent(item.id)}" data-edit-target="content:project:${escapeHtml(item.id || "")}">
    ${imageMarkup(item.cover_url, "project-row-cover", item.name)}
    <div class="project-row-copy">
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.status_text)}</p>
      <time>${escapeHtml(item.last_update || "")}</time>
    </div>
    ${projectProgressMarkup(progress)}
  </a>
`;
};

const projectTileMarkup = (item) => {
  const progress = projectProgressValue(item);
  return `
    <a class="article-row project-tile project-article-row${item.cover_url ? " has-cover" : ""}" href="/project.html?id=${encodeURIComponent(item.id)}" data-title="${escapeHtml(item.name || "")}" data-edit-target="content:project:${escapeHtml(item.id || "")}">
      <div class="article-row-media project-row-media">
        <time datetime="${escapeHtml(item.updated_at || item.last_update || "")}">${escapeHtml(item.last_update || formatDate(item.updated_at))}</time>
        ${imageMarkup(item.cover_url, "article-row-cover project-tile-cover", item.name)}
      </div>
      <div class="project-article-copy">
        <div class="tile-head"><span class="pin"></span><strong>${escapeHtml(item.name || "未命名项目")}</strong></div>
        <p>${escapeHtml(item.summary || item.status_text || "还没有项目摘要。")}</p>
        <div class="project-article-bottom">
          <span>${escapeHtml(item.status_text || "进行中")}</span>
          ${projectProgressMarkup(progress)}
        </div>
      </div>
    </a>
  `;
};

const postMarkup = (item) => `
  <a class="article-row post-article-row${item.cover_url ? " has-cover" : ""}" href="/post.html?slug=${encodeURIComponent(item.slug || "")}" data-title="${escapeHtml(item.title || "")}" data-edit-target="content:post:${escapeHtml(item.id || "")}">
    <div class="article-row-copy post-article-copy">
      <time datetime="${escapeHtml(item.published_at || "")}">${formatDateOnly(item.published_at)}</time>
      <h2>${escapeHtml(item.title || "未命名记录")}</h2>
      <p>${escapeHtml(item.summary || "还没有摘要。")}</p>
      <div class="tags">${item.category ? `<span>#${escapeHtml(item.category)}</span>` : ""}</div>
    </div>
    <div class="article-row-media post-article-media">
      ${imageMarkup(item.cover_url, "article-row-cover", item.title)}
    </div>
  </a>
`;

const interviewSectionLabels = {
  bagu: "八股文专区",
  experience: "面经",
  daily50: "每日 50 题"
};

let currentInterviewFilter = new URLSearchParams(window.location.search).get("section") || "all";

const interviewTags = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value).split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
  }
};

const interviewMarkup = (item) => {
  const section = item.section || "bagu";
  const tags = interviewTags(item.tags);
  const total = Number(item.question_count) || 0;
  const done = Math.min(total, Number(item.finished_count) || 0);
  const progress = total ? Math.round((done / total) * 100) : 0;
  return `
    <article class="interview-card" data-section="${escapeHtml(section)}" data-edit-target="content:interview:${escapeHtml(item.id || "")}">
      <div class="interview-card-top">
        <span class="interview-badge">${escapeHtml(item.section_label || interviewSectionLabels[section] || "面试")}</span>
        <time datetime="${escapeHtml(item.updated_at || "")}">${formatDate(item.updated_at || item.created_at)}</time>
      </div>
      <h2>${escapeHtml(item.title || "未命名面试题")}</h2>
      <p>${escapeHtml(item.summary || "后台补一段摘要后，这里会变成可复盘的面试卡。")}</p>
      <div class="interview-meta">
        ${item.difficulty ? `<span>${escapeHtml(item.difficulty)}</span>` : ""}
        ${tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}
      </div>
      ${total ? `<div class="interview-progress" aria-label="完成 ${done}/${total} 题"><span style="width:${progress}%"></span><strong>${done}/${total}</strong></div>` : ""}
    </article>
  `;
};

const applyInterviewFilter = (filter = currentInterviewFilter) => {
  currentInterviewFilter = filter || "all";
  document.querySelectorAll("[data-interview-filter]").forEach((button) => {
    const isActive = (button.dataset.interviewFilter || "all") === currentInterviewFilter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  document.querySelectorAll("[data-section]").forEach((item) => {
    item.classList.toggle("is-hidden", currentInterviewFilter !== "all" && item.dataset.section !== currentInterviewFilter);
  });
};

const renderInterviewDaily = (items = []) => {
  const panel = document.querySelector("[data-interview-daily]");
  if (!panel) return;
  const dailyItems = items.filter((item) => item.section === "daily50");
  const total = dailyItems.reduce((sum, item) => sum + (Number(item.question_count) || 0), 0);
  const done = dailyItems.reduce((sum, item) => sum + (Number(item.finished_count) || 0), 0);
  const progress = total ? Math.round((done / total) * 100) : 0;
  panel.querySelector("[data-daily-progress]")?.style.setProperty("--daily-progress", `${progress}%`);
  panel.querySelector("[data-daily-count]")?.replaceChildren(document.createTextNode(total ? `${done}/${total}` : "0/50"));
  const list = panel.querySelector("[data-daily-list]");
  if (list) {
    list.innerHTML = dailyItems.length
      ? dailyItems.slice(0, 4).map((item) => `<li><span>${escapeHtml(item.title)}</span><strong>${Number(item.finished_count) || 0}/${Number(item.question_count) || 50}</strong></li>`).join("")
      : "<li><span>后台新建一条“每日 50 题”后会显示进度</span><strong>待开始</strong></li>";
  }
};

const renderInterviews = (items) => {
  const list = document.querySelector("[data-interview-list]");
  if (!list) return;
  if (!items?.length) {
    list.innerHTML = '<div class="empty-state"><strong>还没有面试内容</strong><a href="/admin/interviews">去后台导入 MD</a></div>';
    renderInterviewDaily([]);
    return;
  }
  list.innerHTML = items.map(interviewMarkup).join("");
  renderInterviewDaily(items);
  applyInterviewFilter(currentInterviewFilter);
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-interview-filter]");
  if (!button) return;
  applyInterviewFilter(button.dataset.interviewFilter || "all");
});

const renderOverview = (overview) => {
  const stats = overview?.stats;
  if (!stats) return;
  Object.entries(stats).forEach(([key, value]) => {
    document.querySelectorAll(`[data-stat="${key}"]`).forEach((node) => {
      node.textContent = value;
    });
  });

  const preview = document.querySelector("[data-moment-preview]");
  if (preview && overview.latestMoments?.length) {
    preview.innerHTML = overview.latestMoments.slice(0, frontendLayout.home.momentPreviewLimit).map(momentMarkup).join("");
  }
};

const runDynamicTask = async (task) => {
  try {
    await task();
  } catch (error) {
    console.info("Dynamic content fallback:", error.message);
  }
};

let currentMomentSearch = new URLSearchParams(window.location.search).get("q") || "";
let momentSearchTimer = null;
let lastMomentResultCount = 0;

const momentSearchStatus = () => document.querySelector("[data-moment-search-status]");
const setMomentSearchStatus = (text) => {
  const status = momentSearchStatus();
  if (status) status.textContent = text;
};
const momentApiPath = () => {
  const params = new URLSearchParams();
  if (currentMomentSearch) params.set("q", currentMomentSearch);
  const query = params.toString();
  return `/api/moments${query ? `?${query}` : ""}`;
};
const renderMomentEmpty = () => currentMomentSearch
  ? '<div class="empty-state"><strong>没有找到相关瞬间</strong><span>换个关键词，或清空搜索查看全部。</span></div>'
  : '<div class="empty-state"><strong>还没有公开瞬间</strong><span>去后台发布后会显示在这里。</span></div>';
const updateMomentSearchStatus = () => {
  if (!document.querySelector("[data-moment-search]")) return;
  if (currentMomentSearch) {
    setMomentSearchStatus(`已搜索“${currentMomentSearch}”，找到 ${lastMomentResultCount} 条 · 清空查看全部`);
  } else {
    setMomentSearchStatus("输入关键词，搜索已经发布的瞬间内容和标签。");
  }
};

const renderMoments = (items) => {
  const fullList = document.querySelector("[data-moment-list]");
  if (!fullList) return;
  const rows = Array.isArray(items) ? items : [];
  lastMomentResultCount = rows.length;
  fullList.innerHTML = rows.length ? rows.map(momentMarkup).join("") : renderMomentEmpty();
  applyMomentFilter(currentMomentFilter);
  updateMomentSearchStatus();
};

const loadMoments = async () => {
  if (!document.querySelector("[data-moment-list]")) return;
  if (currentMomentSearch) setMomentSearchStatus(`正在搜索“${currentMomentSearch}”...`);
  const data = await apiGet(momentApiPath());
  renderMoments(data.items);
};

const formatWeatherTemperature = (value) => {
  if (value === null || value === undefined || value === "") return "--°";
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}°` : "--°";
};

const formatWeatherMetric = (value, suffix, fallback = "--") => {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}${suffix}` : fallback;
};

const hasWeatherNumber = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

const hasUsableWeatherData = (data = {}) => {
  const current = data.current || {};
  const daily = data.daily || {};
  return hasWeatherNumber(current.temperature)
    || hasWeatherNumber(current.apparentTemperature)
    || hasWeatherNumber(current.humidity)
    || hasWeatherNumber(current.windSpeed)
    || hasWeatherNumber(daily.max)
    || hasWeatherNumber(daily.min);
};

const weatherUpdatedLabel = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "等待天气同步";
  return `数据更新 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
};

const weatherCityName = (data = {}) => {
  const location = data.location || {};
  return location.city || location.name || location.admin1 || location.country || "当前位置";
};

const setWeatherLoading = (card, message) => {
  if (!card) return;
  card.classList.add("is-loading");
  card.classList.remove("has-error");
  const text = card.querySelector("[data-weather-text]");
  const updated = card.querySelector("[data-weather-updated]");
  if (text) text.textContent = message;
  if (updated) updated.textContent = "天气同步中";
};

const applyWeatherData = (card, data = {}, { cache = true, rememberCity = false } = {}) => {
  if (!card) return;
  const current = data.current || {};
  const daily = data.daily || {};
  const city = weatherCityName(data);
  const usableWeather = hasUsableWeatherData(data);
  const weatherText = current.weatherText || (data.error || !usableWeather ? "天气暂时同步失败" : "天气同步中");
  card.classList.remove("is-loading");
  card.classList.toggle("has-error", Boolean(data.error || !usableWeather));
  card.classList.toggle("is-night", current.isDay === false);
  const cityNode = card.querySelector("[data-weather-city]");
  const tempNode = card.querySelector("[data-weather-temp]");
  const textNode = card.querySelector("[data-weather-text]");
  const rangeNode = card.querySelector("[data-weather-range]");
  const feelsNode = card.querySelector("[data-weather-feels]");
  const humidityNode = card.querySelector("[data-weather-humidity]");
  const windNode = card.querySelector("[data-weather-wind]");
  const updatedNode = card.querySelector("[data-weather-updated]");
  if (cityNode) cityNode.textContent = city;
  if (tempNode) tempNode.textContent = formatWeatherTemperature(current.temperature);
  if (textNode) textNode.textContent = `${weatherText} · 适合记录一点进度`;
  if (rangeNode) {
    const max = formatWeatherTemperature(daily.max);
    const min = formatWeatherTemperature(daily.min);
    const rain = formatWeatherMetric(daily.precipitationProbability, "%", "--%");
    rangeNode.textContent = `今日 ${max} / ${min} · 降水 ${rain}`;
  }
  if (feelsNode) feelsNode.textContent = formatWeatherTemperature(current.apparentTemperature);
  if (humidityNode) humidityNode.textContent = formatWeatherMetric(current.humidity, "%", "--%");
  if (windNode) windNode.textContent = formatWeatherMetric(current.windSpeed, " km/h", "-- km/h");
  if (updatedNode) updatedNode.textContent = usableWeather
    ? (data.stale ? `${weatherUpdatedLabel(data.updatedAt)} · 缓存` : weatherUpdatedLabel(data.updatedAt))
    : "等待天气同步";
  if (cache && !data.error && usableWeather) {
    writeCachedJson(WEATHER_DATA_CACHE_KEY, data);
    if (rememberCity && city && city !== "当前位置") {
      try { localStorage.setItem(WEATHER_CITY_CACHE_KEY, city); } catch {}
    }
  }
};

const getWeatherPosition = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error("geolocation unavailable"));
    return;
  }
  navigator.geolocation.getCurrentPosition(resolve, reject, {
    enableHighAccuracy: false,
    timeout: 7000,
    maximumAge: 10 * 60 * 1000
  });
});

const canUseBrowserWeatherLocation = () => {
  const protocol = window.location?.protocol || "";
  const hostname = window.location?.hostname || "";
  return protocol === "https:"
    || hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1";
};

const fetchWeatherForCity = async (card, city) => {
  const safeCity = String(city || "").trim();
  if (!safeCity) return null;
  setWeatherLoading(card, `正在同步 ${safeCity} 天气...`);
  const data = await apiGet(`/api/weather/current?city=${encodeURIComponent(safeCity)}`);
  applyWeatherData(card, data, { rememberCity: true });
  return data;
};

const fetchWeatherForPosition = async (card, position) => {
  const coords = position?.coords || {};
  const lat = Number(coords.latitude);
  const lon = Number(coords.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("invalid position");
  setWeatherLoading(card, "定位成功，正在同步天气...");
  const data = await apiGet(`/api/weather/current?lat=${encodeURIComponent(lat.toFixed(5))}&lon=${encodeURIComponent(lon.toFixed(5))}`);
  applyWeatherData(card, data);
  return data;
};

const browserIpLocationApis = [
  {
    source: "ipip",
    url: "https://myip.ipip.net/json",
    parse: (payload) => {
      const location = Array.isArray(payload?.data?.location) ? payload.data.location : [];
      return location[2] || location[1] || "";
    }
  }
];

const normalizeWeatherCityInput = (value = "") => String(value || "")
  .replace(/\s+/g, "")
  .replace(/市$/g, "")
  .trim();

const fetchBrowserIpWeatherCity = async () => {
  for (const api of browserIpLocationApis) {
    try {
      const response = await fetch(api.url, { cache: "no-store", headers: { Accept: "application/json,text/plain,*/*" } });
      if (!response.ok) throw new Error(`location api ${api.source} failed`);
      const text = await response.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch {}
      const city = normalizeWeatherCityInput(api.parse(payload, text));
      if (city) return { city, source: api.source };
    } catch (error) {
      console.warn("weather browser location failed", api.source, error?.message || error);
    }
  }
  throw new Error("browser ip location unavailable");
};

const fetchWeatherForBrowserIpLocation = async (card) => {
  setWeatherLoading(card, "正在用定位 API 同步城市...");
  const located = await fetchBrowserIpWeatherCity();
  if (!located?.city) throw new Error("browser ip city unavailable");
  return fetchWeatherForCity(card, located.city);
};

const fetchWeatherForVisitorIp = async (card) => {
  setWeatherLoading(card, "正在按网络出口估算天气...");
  const timeZone = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
  })();
  const params = new URLSearchParams({ ip: "1" });
  if (timeZone) params.set("tz", timeZone);
  const query = `?${params.toString()}`;
  const data = await apiGet(`/api/weather/current${query}`);
  applyWeatherData(card, data, { cache: false });
  return data;
};

const fallbackWeatherToSavedOrHomeCity = async (card, message = "定位失败，显示北京天气") => {
  const savedCity = (() => {
    try { return localStorage.getItem(WEATHER_CITY_CACHE_KEY) || ""; } catch { return ""; }
  })();
  const fallbackCity = savedCity || "北京";
  return fetchWeatherForCity(card, fallbackCity).catch(() => applyWeatherData(card, {
    error: "weather_unavailable",
    location: { city: fallbackCity || "当前位置" },
    current: { temperature: null, apparentTemperature: null, weatherText: message, humidity: null, windSpeed: null },
    daily: { max: null, min: null, precipitationProbability: null },
    updatedAt: new Date().toISOString()
  }, { cache: false }));
};

const bindWeatherCard = (card) => {
  if (!card || card.dataset.weatherBound === "1") return;
  card.dataset.weatherBound = "1";
  const form = card.querySelector("[data-weather-form]");
  const input = form?.querySelector("input[name='city']");
  const locateButton = card.querySelector("[data-weather-locate]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const city = input?.value?.trim();
    if (!city) {
      setWeatherLoading(card, "输入城市后再更新天气");
      return;
    }
    try {
      await fetchWeatherForCity(card, city);
    } catch (error) {
      applyWeatherData(card, { error: "weather_unavailable", updatedAt: new Date().toISOString(), current: { weatherText: "天气暂时同步失败" }, location: { city } }, { cache: false });
    }
  });
  locateButton?.addEventListener("click", async () => {
    if (canUseBrowserWeatherLocation()) {
      try {
        const position = await getWeatherPosition();
        await fetchWeatherForPosition(card, position);
        return;
      } catch {}
    }
    try {
      await fetchWeatherForBrowserIpLocation(card);
    } catch {
      await fallbackWeatherToSavedOrHomeCity(card, "定位 API 失败，显示北京天气");
    }
  });
};

const loadWeatherCard = async () => {
  const card = document.querySelector("[data-weather-card]");
  if (!card) return;
  bindWeatherCard(card);
  ["jlemonz:weather-city:v2", "jlemonz:weather-data:v2", "jlemonz:weather-city:v3", "jlemonz:weather-data:v3", "jlemonz:weather-city:v4", "jlemonz:weather-data:v4", "jlemonz:weather-city:v5", "jlemonz:weather-data:v5", "jlemonz:weather-city:v6", "jlemonz:weather-data:v6"].forEach((key) => {
    try { localStorage.removeItem(key); } catch {}
  });
  const cachedData = readCachedJson(WEATHER_DATA_CACHE_KEY);
  if (cachedData && hasUsableWeatherData(cachedData)) {
    applyWeatherData(card, cachedData, { cache: false });
  } else {
    try { localStorage.removeItem(WEATHER_DATA_CACHE_KEY); } catch {}
  }
  if (canUseBrowserWeatherLocation()) {
    try {
      const position = await getWeatherPosition();
      await fetchWeatherForPosition(card, position);
      return;
    } catch {}
  }
  try {
    await fetchWeatherForBrowserIpLocation(card);
    return;
  } catch {}
  await fallbackWeatherToSavedOrHomeCity(card, "定位 API 失败，显示北京天气");
};

const renderProjects = (items) => {
  const preview = document.querySelector("[data-project-preview]");
  const board = document.querySelector("[data-project-board]");
  if (!items?.length) {
    const empty = '<div class="empty-state"><strong>还没有公开项目</strong><a href="/about#contact">先留一个想法</a></div>';
    if (preview) preview.innerHTML = empty;
    if (board) board.innerHTML = empty;
    return;
  }
  if (preview) preview.innerHTML = items?.length ? items.slice(0, frontendLayout.home.projectPreviewLimit).map(projectRowMarkup).join("") : '<p class="muted">还没有公开项目。</p>';
  if (board) board.innerHTML = items?.length ? items.map(projectTileMarkup).join("") : '<p class="muted">还没有公开项目。</p>';
};

const renderPosts = (items) => {
  const list = document.querySelector("[data-post-list]");
  if (list && !items?.length) {
    list.innerHTML = '<div class="empty-state"><strong>这个筛选下还没有公开小记</strong><a href="/archive.html">查看全部</a></div>';
    return;
  }
  if (list) list.innerHTML = items?.length ? items.map(postMarkup).join("") : '<p class="muted">这个筛选下还没有公开札记。</p>';
};

const compactNumber = (value) => {
  const number = Number(value) || 0;
  if (number >= 10000) return `${(number / 10000).toFixed(number >= 100000 ? 0 : 1)}w`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
  return String(number);
};

const homeLiveRepoMarkup = (repo = {}, index = 0) => {
  const href = safeHref(repo.html_url || "", "");
  const tag = href ? "a" : "article";
  const hrefAttr = href ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"` : "";
  const name = repo.full_name || repo.name || "Repository";
  const meta = [
    repo.language || "Code",
    `${compactNumber(repo.stargazers_count)} stars`,
    formatDate(repo.pushed_at || repo.updated_at)
  ].filter(Boolean).join(" · ");
  const topic = Array.isArray(repo.topics) && repo.topics[0] ? repo.topics[0] : `#${index + 1}`;
  return `
    <${tag} class="home-live-repo"${hrefAttr}>
      <span>${escapeHtml(topic)}</span>
      <strong>${escapeHtml(name)}</strong>
      <p>${escapeHtml(repo.description || "这个热门仓库暂时没有说明。")}</p>
      <small>${escapeHtml(meta)}</small>
    </${tag}>
  `;
};

const renderHomeLivePanel = async () => {
  const panel = document.querySelector("[data-home-live-panel]");
  if (!panel) return;
  panel.classList.add("is-loading");
  let trending = {};
  try {
    trending = await apiGet("/api/github/trending?limit=4");
  } catch {}
  const repos = Array.isArray(trending.items) ? trending.items.filter((item) => item?.name || item?.full_name).slice(0, 4) : [];
  const status = {
    label: "GitHub Robotics",
    title: repos.length ? "热门机器人项目" : "等待后端同步",
    body: repos.length ? "从后端缓存读取 robotics 热门仓库，适合快速扫技术方向。" : "接口暂时没有返回项目，稍后刷新会继续尝试。"
  };
  panel.innerHTML = `
    <article class="home-live-state">
      <small>${escapeHtml(status.label)}</small>
      <strong>${escapeHtml(status.title)}</strong>
      <p>${escapeHtml(status.body)}</p>
    </article>
    <div class="home-live-repos">
      ${repos.length ? repos.map(homeLiveRepoMarkup).join("") : '<article class="home-live-empty"><strong>GitHub 热门项目同步中</strong><span>稍后会自动从后端缓存接口读取。</span></article>'}
    </div>
  `;
  panel.classList.remove("is-loading");
};

const techHotspotMarkup = (item = {}, index = 0) => {
  const href = safeHref(item.url || "", "");
  const tag = href ? "a" : "article";
  const hrefAttr = href ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"` : "";
  const source = item.source || "Tech";
  const score = Number(item.score || 0);
  const meta = item.meta || [
    source,
    score > 0 ? `${compactNumber(score)} 热度` : "",
    formatDate(item.publishedAt || item.updatedAt || "")
  ].filter(Boolean).join(" · ");
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 2) : [];
  return `
    <${tag} class="tech-hotspot-item"${hrefAttr}>
      <span class="tech-hotspot-rank">${String(index + 1).padStart(2, "0")}</span>
      <span class="tech-hotspot-copy">
        <strong>${escapeHtml(item.title || "科技热点同步中")}</strong>
        <p>${escapeHtml(item.summary || "暂时没有摘要，稍后会从后端缓存刷新。")}</p>
        <small>${escapeHtml(meta)}</small>
      </span>
      <span class="tech-hotspot-tags">${tags.map((tagText) => `<em>${escapeHtml(tagText)}</em>`).join("") || `<em>${escapeHtml(source)}</em>`}</span>
    </${tag}>
  `;
};

const renderTechHotspotsPanel = async () => {
  const card = document.querySelector("[data-tech-hotspots-card]");
  if (!card) return;
  const list = card.querySelector("[data-tech-hotspots-list]");
  const updated = card.querySelector("[data-tech-hotspots-updated]");
  const sourcesNode = card.querySelector("[data-tech-hotspot-sources]");
  card.classList.add("is-loading");
  if (updated) updated.textContent = "同步中";
  try {
    const data = await apiGet("/api/tech/hotspots?limit=6");
    const items = Array.isArray(data.items) ? data.items.filter((item) => item?.title).slice(0, 6) : [];
    const sources = Array.isArray(data.sources) && data.sources.length ? data.sources : ["GitHub", "Hacker News"];
    if (sourcesNode) sourcesNode.innerHTML = sources.slice(0, 3).map((source) => `<span>${escapeHtml(source)}</span>`).join("");
    if (updated) updated.textContent = data.updatedAt ? `更新 ${formatDate(data.updatedAt)}` : "刚刚同步";
    if (list) {
      list.innerHTML = items.length
        ? items.map(techHotspotMarkup).join("")
        : '<article class="tech-hotspot-empty"><strong>热点同步中</strong><span>GitHub / HN 暂时没有返回数据，稍后会自动刷新。</span></article>';
    }
  } catch {
    if (updated) updated.textContent = "同步失败";
    if (list) list.innerHTML = '<article class="tech-hotspot-empty"><strong>热点暂时不可用</strong><span>不影响今日题单和出题工作台。</span></article>';
  } finally {
    card.classList.remove("is-loading");
  }
};

const animeRecommendationMarkup = (item = {}, index = 0) => {
  const href = safeHref(item.url || "", "");
  const tag = href ? "a" : "article";
  const hrefAttr = href ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"` : "";
  const cover = safeHref(item.cover || "", "");
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 2) : [];
  const meta = item.meta || [item.score ? `${item.score} 分` : "", item.episodes ? `${item.episodes} 集` : ""].filter(Boolean).join(" · ");
  return `
    <${tag} class="anime-recommend-item ${index === 0 ? "is-featured" : ""}"${hrefAttr}>
      <span class="anime-cover">${cover ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(item.title || "动漫封面")}" loading="lazy">` : ""}</span>
      <span class="anime-copy">
        <small>${escapeHtml(meta || "今日推荐")}</small>
        <strong>${escapeHtml(item.title || "今日动漫推荐")}</strong>
        <p>${escapeHtml(item.summary || "今天自动挑一部适合放松的动画。")}</p>
        <span class="anime-tags">${tags.map((tagText) => `<em>${escapeHtml(tagText)}</em>`).join("")}</span>
      </span>
    </${tag}>
  `;
};

const renderAnimeRecommendationPanel = async () => {
  const card = document.querySelector("[data-anime-recommend-card]");
  if (!card) return;
  const list = card.querySelector("[data-anime-recommend-list]");
  const updated = card.querySelector("[data-anime-updated]");
  card.classList.add("is-loading");
  if (updated) updated.textContent = "同步中";
  try {
    const data = await apiGet("/api/anime/daily?limit=2");
    const items = Array.isArray(data.items) ? data.items.filter((item) => item?.title).slice(0, 2) : [];
    if (updated) updated.textContent = data.updatedAt ? `更新 ${formatDate(data.updatedAt)}` : "每日推荐";
    if (list) {
      list.innerHTML = items.length
        ? items.map(animeRecommendationMarkup).join("")
        : '<article class="anime-recommend-empty"><strong>今天还没同步到推荐</strong><span>稍后会从后端缓存继续刷新。</span></article>';
    }
  } catch {
    if (updated) updated.textContent = "同步失败";
    if (list) list.innerHTML = '<article class="anime-recommend-empty"><strong>动漫推荐暂时不可用</strong><span>不影响小记列表阅读。</span></article>';
  } finally {
    card.classList.remove("is-loading");
  }
};

const careerKindLabel = (item = {}) => item.kind === "campus" ? "校招" : "社招";

const careerEventMarkup = (item = {}) => {
  const href = safeHref(item.url || "", "");
  const tag = href ? "a" : "article";
  const hrefAttr = href ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"` : "";
  const dateText = item.date ? String(item.date).slice(5).replace("-", "/") : "时间待同步";
  const kind = careerKindLabel(item);
  return `
    <${tag} class="career-event-item is-${escapeHtml(item.kind || "social")}"${hrefAttr}>
      <span class="career-event-date"><strong>${escapeHtml(dateText)}</strong><small>${escapeHtml(item.region || "全国")}</small></span>
      <span class="career-event-copy">
        <span class="career-event-meta"><em>${escapeHtml(kind)}</em><small>${escapeHtml(item.source || "招聘会源")}</small></span>
        <strong>${escapeHtml(item.title || "线下面试招聘会")}</strong>
        <p>${escapeHtml(item.summary || item.venue || "近期线下招聘会信息。")}</p>
      </span>
    </${tag}>
  `;
};

const inferCareerKind = (item = {}) => {
  const text = `${item.title || ""} ${item.summary || ""} ${item.venue || ""}`;
  return /校招|校园|双选|应届|毕业生|高校|大学|学院|实习|青年人才|春招|秋招/i.test(text) ? "campus" : "social";
};

const careerEventSectionMarkup = (title, items = [], emptyText = "暂无同步场次") => `
  <section class="career-events-section">
    <div class="career-section-head"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(String(items.length || 0))} 条</small></div>
    <div class="career-section-list">
      ${items.length ? items.map(careerEventMarkup).join("") : `<article class="career-event-empty"><strong>${escapeHtml(emptyText)}</strong><span>后端会继续同步全国公开招聘会源。</span></article>`}
    </div>
  </section>
`;

const renderCareerEventsPanel = async () => {
  const card = document.querySelector("[data-career-events-card]");
  if (!card) return;
  const list = card.querySelector("[data-career-events-list]");
  const updated = card.querySelector("[data-career-updated]");
  card.classList.add("is-loading");
  if (updated) updated.textContent = "同步中";
  try {
    const data = await apiGet("/api/career/events?days=45&limit=24");
    const rawItems = Array.isArray(data.items) ? data.items.filter((item) => item?.title) : [];
    const campus = Array.isArray(data.groups?.campus) && data.groups.campus.length
      ? data.groups.campus.filter((item) => item?.title).slice(0, 12)
      : rawItems.filter((item) => inferCareerKind(item) === "campus").map((item) => ({ ...item, kind: "campus" })).slice(0, 12);
    const social = Array.isArray(data.groups?.social) && data.groups.social.length
      ? data.groups.social.filter((item) => item?.title).slice(0, 12)
      : rawItems.filter((item) => inferCareerKind(item) !== "campus").map((item) => ({ ...item, kind: "social" })).slice(0, 12);
    if (updated) updated.textContent = data.updatedAt ? `更新 ${formatDate(data.updatedAt)}` : "近 45 天";
    if (list) {
      list.innerHTML = campus.length || social.length
        ? `${careerEventSectionMarkup("校招 / 双选会", campus, "近 45 天暂无校招场次")}${careerEventSectionMarkup("社招 / 现场招聘", social, "近 45 天暂无社招场次")}`
        : '<article class="career-event-empty"><strong>近 45 天暂无公开场次</strong><span>全国招聘会源没有返回可参加活动，稍后自动刷新。</span></article>';
    }
  } catch {
    if (updated) updated.textContent = "同步失败";
    if (list) list.innerHTML = '<article class="career-event-empty"><strong>招聘会暂时不可用</strong><span>稍后会继续从后端缓存同步。</span></article>';
  } finally {
    card.classList.remove("is-loading");
  }
};

const breakupMusicMarkup = (item = {}, index = 0) => {
  const href = safeHref(item.url || item.previewUrl || "", "");
  const tag = href ? "a" : "article";
  const hrefAttr = href ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"` : "";
  const artwork = safeHref(item.artwork || "", "");
  return `
    <${tag} class="breakup-music-item ${index === 0 ? "is-featured" : ""}"${hrefAttr}>
      <span class="breakup-music-cover">${artwork ? `<img src="${escapeHtml(artwork)}" alt="${escapeHtml(item.title || "歌曲封面")}" loading="lazy">` : `<em>${escapeHtml(String(index + 1).padStart(2, "0"))}</em>`}</span>
      <span class="breakup-music-copy">
        <small>${escapeHtml([item.artist, item.mood].filter(Boolean).join(" · ") || "DDV")}</small>
        <strong>${escapeHtml(item.title || "今日歌曲")}</strong>
        <p>${escapeHtml(item.summary || item.hotComment || item.album || "热评：这首歌适合今天循环一遍。")}</p>
      </span>
    </${tag}>
  `;
};

const renderBreakupMusicPanel = async () => {
  const card = document.querySelector("[data-breakup-music-card]");
  if (!card) return;
  const list = card.querySelector("[data-breakup-music-list]");
  const updated = card.querySelector("[data-breakup-music-updated]");
  card.classList.add("is-loading");
  if (updated) updated.textContent = "同步中";
  try {
    const data = await apiGet("/api/music/ddv?limit=5");
    const items = Array.isArray(data.items) ? data.items.filter((item) => item?.title).slice(0, 5) : [];
    if (updated) updated.textContent = data.updatedAt ? `更新 ${formatDate(data.updatedAt)}` : "每日推荐";
    if (list) {
      list.innerHTML = items.length
        ? items.map(breakupMusicMarkup).join("")
        : '<article class="breakup-music-empty">今天歌单还在同步。</article>';
    }
  } catch {
    if (updated) updated.textContent = "同步失败";
    if (list) list.innerHTML = '<article class="breakup-music-empty">歌单暂时不可用，稍后再听。</article>';
  } finally {
    card.classList.remove("is-loading");
  }
};

const thinkingQuestionMarkup = (item = {}, index = 0) => {
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 2) : [];
  return `
    <article class="thinking-question-item">
      <span class="thinking-question-index">${String(index + 1).padStart(2, "0")}</span>
      <div class="thinking-question-copy">
        <small>${escapeHtml([item.difficulty, ...tags].filter(Boolean).join(" · ") || "思考训练")}</small>
        <strong>${escapeHtml(item.title || "今日思考题")}</strong>
        <p>${escapeHtml(item.prompt || "先写下判断，再写下反例。")}</p>
        ${item.hint ? `<em>${escapeHtml(item.hint)}</em>` : ""}
      </div>
    </article>
  `;
};

const renderThinkingQuestionsPanel = async () => {
  const card = document.querySelector("[data-thinking-question-card]");
  if (!card) return;
  const list = card.querySelector("[data-thinking-question-list]");
  const updated = card.querySelector("[data-thinking-updated]");
  card.classList.add("is-loading");
  if (updated) updated.textContent = "生成中";
  try {
    const data = await apiGet("/api/thinking/questions?limit=3");
    const items = Array.isArray(data.items) ? data.items.filter((item) => item?.prompt || item?.title).slice(0, 3) : [];
    if (updated) updated.textContent = data.updatedAt ? `更新 ${formatDate(data.updatedAt)}` : "每日思考";
    if (list) {
      list.innerHTML = items.length
        ? items.map(thinkingQuestionMarkup).join("")
        : '<article class="thinking-question-empty">今天的思考题还在生成。</article>';
    }
  } catch {
    if (updated) updated.textContent = "生成失败";
    if (list) list.innerHTML = '<article class="thinking-question-empty">思考题暂时不可用。</article>';
  } finally {
    card.classList.remove("is-loading");
  }
};

const archiveCategory = () => {
  if (page !== "archive") return "";
  const params = new URLSearchParams(window.location.search);
  return (params.get("cat") || frontendLayout.archive.defaultCategory || "").trim().toLowerCase();
};

const applyArchiveCategoryState = () => {
  const active = archiveCategory();
  document.querySelectorAll(".chip-row a").forEach((link) => {
    const linkCategory = new URL(link.href, window.location.origin).searchParams.get("cat") || "";
    link.classList.toggle("active", linkCategory.toLowerCase() === active);
  });
};

const loadDynamicContent = async () => {
  const tasks = [];
  if (document.querySelector("[data-stat]") || document.querySelector("[data-moment-preview]")) {
    tasks.push(() => apiGet("/api/site/overview").then(renderOverview));
  }
  if (document.querySelector("[data-moment-list]")) {
    tasks.push(loadMoments);
  }
  if (document.querySelector("[data-project-preview]") || document.querySelector("[data-project-board]")) {
    tasks.push(() => apiGet("/api/projects").then((data) => renderProjects(data.items)));
  }
  if (document.querySelector("[data-interview-list]") && !document.querySelector("[data-interview-console]")) {
    tasks.push(() => apiGet("/api/interviews").then((data) => renderInterviews(data.items)));
  }
  if (document.querySelector("[data-post-list]")) {
    const cat = archiveCategory();
    const query = cat ? `?cat=${encodeURIComponent(cat)}` : "";
    tasks.push(() => apiGet(`/api/posts${query}`).then((data) => renderPosts(data.items)));
  }
  if (document.querySelector("[data-home-live-panel]")) {
    tasks.push(renderHomeLivePanel);
  }
  if (document.querySelector("[data-tech-hotspots-card]")) {
    tasks.push(renderTechHotspotsPanel);
  }
  if (document.querySelector("[data-anime-recommend-card]")) {
    tasks.push(renderAnimeRecommendationPanel);
  }
  if (document.querySelector("[data-career-events-card]")) {
    tasks.push(renderCareerEventsPanel);
  }
  if (document.querySelector("[data-breakup-music-card]")) {
    tasks.push(renderBreakupMusicPanel);
  }
  if (document.querySelector("[data-thinking-question-card]")) {
    tasks.push(renderThinkingQuestionsPanel);
  }
  if (document.querySelector("[data-weather-card]")) {
    tasks.push(loadWeatherCard);
  }
  await Promise.all(tasks.map(runDynamicTask));
};

const applyQuoteData = (quote) => {
  document.querySelectorAll("[data-quote-line]").forEach((node) => {
    const fullText = quote?.from ? `${quote.text} - ${quote.from}` : quote?.text;
    const safeText = getSafeEditableText(fullText, { optional: true });
    if (!safeText) return;
    node.textContent = safeText;
    node.title = safeText;
  });
};

const quoteHydratedFromCache = (() => {
  const cached = readCachedJson(QUOTE_CACHE_KEY);
  if (!cached) return false;
  applyQuoteData(cached);
  return true;
})();

const renderQuote = async () => {
  try {
    const quote = await apiGet("/api/quote");
    writeCachedJson(QUOTE_CACHE_KEY, quote);
    if (!quoteHydratedFromCache) applyQuoteData(quote);
  } catch {}
};

const renderMoyuWidget = async () => {
  const cards = [...document.querySelectorAll("[data-moyu-card]")];
  if (!cards.length) return;

  const fallbackModules = [{
    label: "当前状态",
    title: "Moyu module unavailable",
    body: "The fallback state is being shown.",
    percent: null
  }];

  const loadModules = async () => {
    const data = await apiGet("/api/moyu");
    const modules = Array.isArray(data.modules) ? data.modules.filter((item) => item?.title) : [];
    return modules.length ? modules : fallbackModules;
  };

  let sharedModules;
  try {
    sharedModules = await loadModules();
  } catch {
    sharedModules = fallbackModules;
  }

  cards.forEach((card, cardIndex) => {
    const label = card.querySelector("[data-moyu-label]");
    const title = card.querySelector("[data-moyu-title]");
    const body = card.querySelector("[data-moyu-body]");
    const meter = card.querySelector("[data-moyu-meter]");
    const meterBar = card.querySelector("[data-moyu-meter-bar]");
    const refresh = card.querySelector("[data-moyu-refresh]");
    let modules = sharedModules;
    let activeIndex = -1;
    let autoTimer = 0;

    if (refresh) {
      refresh.hidden = true;
      refresh.setAttribute("aria-hidden", "true");
      refresh.tabIndex = -1;
    }

    const showModule = (nextIndex) => {
      if (!modules.length) return;
      activeIndex = nextIndex;
      const item = modules[activeIndex];
      card.dataset.moyuKind = item.kind || "";
      if (label) label.textContent = item.label || "摸鱼办";
      if (title) title.textContent = item.title || "今天也要认真摸鱼";
      if (body) body.textContent = item.body || "";
      const percent = Number(item.percent);
      const hasMeter = Number.isFinite(percent);
      if (meter) meter.hidden = !hasMeter;
      if (hasMeter && meterBar) meterBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    };

    const pickNextIndex = () => {
      if (modules.length < 2) return 0;
      let next = Math.floor(Math.random() * modules.length);
      if (next === activeIndex) next = (next + 1) % modules.length;
      return next;
    };

    const nextAutoDelay = () => 18000 + Math.floor(Math.random() * 18000);

    const refreshAutomatically = async () => {
      if (document.hidden) {
        scheduleAutoRefresh();
        return;
      }
      showModule(pickNextIndex());
      scheduleAutoRefresh();
    };

    const scheduleAutoRefresh = () => {
      window.clearTimeout(autoTimer);
      autoTimer = window.setTimeout(refreshAutomatically, nextAutoDelay());
    };

    showModule(pickNextIndex());
    scheduleAutoRefresh();
  });
};

const toDateKey = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, "0")}-${String(copy.getDate()).padStart(2, "0")}`;
};

const buildGithubCalendarDays = (sourceDays) => {
  const byDate = new Map(sourceDays.map((day) => [day.date, day]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const days = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = toDateKey(cursor);
    const match = byDate.get(date);
    days.push({
      date,
      count: match ? Number(match.count) || 0 : 0,
      level: match ? Number(match.level) || 0 : 0,
      inRange: cursor <= today
    });
  }
  return days;
};

const renderGithubMonths = (calendar, days) => {
  const months = calendar.querySelector("[data-github-months]");
  if (!months) return;
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weekCount = Math.ceil(days.length / 7);
  const monthCells = Array.from({ length: weekCount }, () => "");
  for (let week = 0; week < weekCount; week += 1) {
    const weekDays = days.slice(week * 7, week * 7 + 7);
    const firstOfMonth = weekDays.find((day) => new Date(`${day.date}T00:00:00`).getDate() === 1);
    if (firstOfMonth) {
      monthCells[week] = labels[new Date(`${firstOfMonth.date}T00:00:00`).getMonth()];
    }
  }
  months.style.gridTemplateColumns = `repeat(${weekCount}, minmax(0, 1fr))`;
  months.innerHTML = monthCells.map((label) => `<span>${label}</span>`).join("");
};

const scrollGithubCalendarToRecent = (calendar, options = {}) => {
  const scrollArea = calendar.querySelector(".github-calendar-scroll");
  if (!scrollArea || (!options.force && scrollArea.dataset.initialScrollDone === "true")) return;
  requestAnimationFrame(() => {
    const maxScrollLeft = scrollArea.scrollWidth - scrollArea.clientWidth;
    if (maxScrollLeft <= 0) return;
    scrollArea.scrollLeft = maxScrollLeft;
    scrollArea.dataset.initialScrollDone = "true";
  });
};

const scheduleGithubCalendarsToRecent = () => {
  document.querySelectorAll("[data-github-calendar]").forEach((calendar) => {
    [120, 700, 1600, 3200].forEach((delay) => {
      window.setTimeout(() => scrollGithubCalendarToRecent(calendar), delay);
    });
  });
};

const renderGithub = (data) => {
  const sourceDays = Array.isArray(data.days) ? data.days : [];
  const days = buildGithubCalendarDays(sourceDays);
  const githubUnavailable = /local-preview|unavailable/i.test(String(data.source || ""));
  document.querySelectorAll("[data-github-heatmap]").forEach((heatmap) => {
    const visibleDays = days;
    const weekCount = Math.ceil(visibleDays.length / 7);
    heatmap.style.gridTemplateColumns = `repeat(${weekCount}, minmax(0, 1fr))`;
    heatmap.innerHTML = visibleDays.map((day) => {
      const level = day.inRange && !githubUnavailable ? Number(day.level) || 0 : 0;
      const title = githubUnavailable ? "GitHub \u6682\u4e0d\u53ef\u7528" : `${day.count} \u6b21\u63d0\u4ea4`;
      return `<span data-level="${level}" title="${day.date}: ${title}"></span>`;
    }).join("");
    const calendar = heatmap.closest("[data-github-calendar]");
    if (calendar) {
      renderGithubMonths(calendar, days);
    }
  });
  document.querySelectorAll("[data-github-total]").forEach((node) => {
    node.textContent = githubUnavailable ? "\u6682\u4e0d\u53ef\u7528" : `${data.total || 0} \u6b21\u63d0\u4ea4`;
  });
  document.querySelectorAll("[data-github-summary]").forEach((node) => {
    const name = data.username || "jlemonz";
    node.textContent = githubUnavailable ? `${name} \u5df2\u7ed1\u5b9a\uff0c\u670d\u52a1\u5668\u6682\u65f6\u8fde\u4e0d\u4e0a GitHub\u3002` : `${name} \u8fc7\u53bb\u4e00\u5e74\u7684\u4ee3\u7801\u8282\u594f\u3002`;
  });
  document.querySelectorAll("[data-github-username]").forEach((node) => {
    node.textContent = data.username || "jlemonz";
  });
  document.querySelectorAll(".github-calendar-footer a").forEach((node) => {
    node.href = `https://github.com/${encodeURIComponent(data.username || "jlemonz")}`;
  });
};
const loadGithub = async () => {
  try {
    const data = await apiGet("/api/github/contributions");
    renderGithub(data);
  } catch {
    renderGithub({ username: "jlemonz", total: 0, days: [] });
    document.querySelectorAll("[data-github-summary]").forEach((node) => {
      node.textContent = "Backend snapshot is temporarily unavailable; retrying later.";
    });
  }
};

const renderLikes = async () => {
  const buttons = document.querySelectorAll("[data-like-target]");
  await Promise.all([...buttons].map(async (button) => {
    const target = button.dataset.likeTarget;
    if (!target) return;
    try {
      const data = await apiGet(`/api/reactions?target=${encodeURIComponent(target)}`);
      button.querySelector("[data-like-count]").textContent = data.likes || 0;
    } catch {}
  }));
};

document.querySelectorAll("[data-like-target]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = button.dataset.likeTarget;
    try {
      const data = await apiPost("/api/reactions/like", { target });
      button.querySelector("[data-like-count]").textContent = data.likes || 0;
      button.classList.add("is-liked");
    } catch {}
  });
});

const commentMarkup = (item) => `
  <article class="comment-item" data-edit-target="content:comment:${escapeHtml(item.id || "")}">
    <div class="comment-meta">
      <span>
        <strong>${escapeHtml(item.author_name || "Guest")}</strong>
        <time datetime="${escapeHtml(item.created_at || "")}">${formatDate(item.created_at)}</time>
      </span>
      <button class="comment-like" type="button" data-comment-like-target="comment:${escapeHtml(item.id || "")}" aria-label="给这条留言点赞">
        赞 <span data-comment-like-count>${Number(item.likes) || 0}</span>
      </button>
    </div>
    <p>${escapeHtml(item.content || "")}</p>
  </article>
`;

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-comment-like-target]");
  if (!button) return;
  const target = button.dataset.commentLikeTarget;
  if (!target || button.disabled) return;
  button.disabled = true;
  try {
    const data = await apiPost("/api/reactions/like", { target });
    button.querySelector("[data-comment-like-count]").textContent = data.likes || 0;
    button.classList.add("is-liked");
  } catch {
  } finally {
    button.disabled = false;
  }
});

const loadComments = async () => {
  await Promise.all([...document.querySelectorAll("[data-comment-list]")].map(async (list) => {
    const target = list.dataset.commentTarget;
    if (!target) return;
    try {
      const data = await apiGet(`/api/comments?target=${encodeURIComponent(target)}`);
      list.innerHTML = data.items?.length ? data.items.map(commentMarkup).join("") : '<p class="muted">还没有留言。</p>';
    } catch {}
  }));
};

document.querySelectorAll("[data-comment-form]").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const target = form.dataset.commentTarget;
    if (!target) return;
    try {
      const data = await apiPost("/api/comments", {
        target,
        author_name: formData.get("author_name"),
        content: formData.get("content")
      });
      const list = document.querySelector(`[data-comment-list][data-comment-target="${target}"]`);
      if (list) {
        const items = data.items || [];
        const notice = data.pending ? '<p class="muted comment-notice">留言已进入审核队列，审核通过后会展示。</p>' : '';
        list.innerHTML = notice + (items.length ? items.map(commentMarkup).join("") : '<p class="muted">还没有公开留言。</p>');
      }
      form.reset();
    } catch {}
  });
});

const loadProjectDetail = async () => {
  const title = document.querySelector("[data-project-title]");
  if (!title) return;
  const params = new URLSearchParams(window.location.search);
  const key = params.get("id") || params.get("slug") || "1";
  try {
    const project = await apiGet(`/api/projects/${encodeURIComponent(key)}`);
    const target = `project:${project.id}`;
    document.title = `${project.name} - Jlemonz`;
    document.querySelector(".project-detail-hero")?.setAttribute("data-edit-target", `content:project:${project.id}`);
    title.textContent = project.name;
    document.querySelector("[data-project-summary]").textContent = project.summary || project.status_text || "";
    document.querySelector("[data-project-state]").textContent = project.status_text || "进行中";
    const projectProgress = projectProgressValue(project);
    const projectProgressBar = document.querySelector("[data-project-progress]");
    const projectProgressWrap = projectProgressBar?.closest(".project-progress-kawaii");
    if (projectProgressBar) projectProgressBar.value = String(projectProgress);
    if (projectProgressWrap) {
      projectProgressWrap.style.setProperty("--project-progress", `${projectProgress}%`);
      projectProgressWrap.setAttribute("aria-label", `项目进度 ${projectProgress}%`);
    }
    document.querySelector("[data-project-progress-text]")?.replaceChildren(`${projectProgress}%`);
    document.querySelector("[data-project-update]").textContent = project.last_update || "";
    setOptionalImage("[data-project-cover]", project.cover_url, project.name || "项目展示图");
    const projectContent = document.querySelector("[data-project-content]");
    projectContent.innerHTML = project.content_html || "<p>还没有详细记录。</p>";
    renderMermaidBlocks(projectContent);
    document.querySelectorAll("[data-comment-target]").forEach((node) => {
      node.dataset.commentTarget = target;
    });
    document.querySelectorAll("[data-like-target]").forEach((node) => {
      if (!node.dataset.likeTarget) node.dataset.likeTarget = target;
    });
    trackPageView(target);
    await Promise.all([loadComments(), renderLikes()]);
  } catch {
    title.textContent = "项目不存在";
    document.querySelector("[data-project-summary]").textContent = "没有找到这条项目记录。";
  }
};

const loadPostDetail = async () => {
  const title = document.querySelector("[data-post-title]");
  if (!title) return;
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug") || "";
  if (!slug) {
    title.textContent = "札记不存在";
    document.querySelector("[data-post-summary]").textContent = "缺少文章标识。";
    return;
  }
  try {
    const post = await apiGet(`/api/posts/${encodeURIComponent(slug)}`);
    const target = `post:${slug}`;
    document.title = `${post.title || "札记"} - Jlemonz`;
    document.querySelector(".post-detail-hero")?.setAttribute("data-edit-target", `content:post:${post.id || ""}`);
    title.textContent = post.title || "未命名札记";
    document.querySelector("[data-post-summary]").textContent = post.summary || "还没有摘要。";
    document.querySelector("[data-post-category]").textContent = post.category || "札记";
    document.querySelector("[data-post-published]").textContent = formatDate(post.published_at);
    document.querySelector("[data-post-updated]").textContent = post.updated_at ? `更新 ${formatDate(post.updated_at)}` : "";
    const postPager = document.querySelector("[data-post-pagination]");
    if (postPager) {
      postPager.innerHTML = [
        postPagerPanelMarkup(post.previousPost, "prev"),
        postPagerPanelMarkup(post, "current"),
        postPagerPanelMarkup(post.nextPost, "next")
      ].join("");
    }
    setOptionalImage("[data-post-cover]", post.cover_url, post.title || "札记展示图");
    const postContent = document.querySelector("[data-post-content]");
    postContent.innerHTML = post.content_html || "<p>还没有详细记录。</p>";
    renderMermaidBlocks(postContent);
    document.querySelectorAll("[data-comment-target]").forEach((node) => {
      node.dataset.commentTarget = target;
    });
    document.querySelectorAll("[data-like-target]").forEach((node) => {
      if (!node.dataset.likeTarget) node.dataset.likeTarget = target;
    });
    trackPageView(target);
    await Promise.all([loadComments(), renderLikes()]);
  } catch {
    title.textContent = "札记不存在";
    document.querySelector("[data-post-summary]").textContent = "没有找到这篇公开札记。";
    document.querySelector("[data-post-content]").innerHTML = '<p class="muted">这篇记录可能还没有发布，或链接已经失效。</p>';
  }
};

let currentMomentFilter = new URLSearchParams(window.location.search).get("kind")
  || document.querySelector("[data-filter].active")?.dataset.filter
  || frontendLayout.moments.defaultKind
  || "all";

const syncMomentUrl = () => {
  if (page !== "moments") return;
  const params = new URLSearchParams(window.location.search);
  params.delete("kind");
  if (currentMomentSearch) params.set("q", currentMomentSearch);
  else params.delete("q");
  const query = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
};

const applyMomentFilter = (filter = currentMomentFilter) => {
  currentMomentFilter = filter || "all";
  document.querySelectorAll("[data-kind]").forEach((item) => {
    item.classList.toggle("is-hidden", currentMomentFilter !== "all" && item.dataset.kind !== currentMomentFilter);
  });
};

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.closest("[data-moment-kinds]")) return;
    const filter = button.dataset.filter || "all";
    document.querySelectorAll("[data-filter]").forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });
    applyMomentFilter(filter);
  });
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  const filter = button.dataset.filter || "all";
  const isMomentHeroKind = page === "moments" && Boolean(button.closest("[data-moment-kinds]"));
  document.querySelectorAll("[data-filter]").forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  applyMomentFilter(filter);
  if (isMomentHeroKind) {
    button.classList.remove("is-tapping");
    void button.offsetWidth;
    button.classList.add("is-tapping");
    window.setTimeout(() => button.classList.remove("is-tapping"), 520);
    return;
  }
  if (page === "moments") {
    syncMomentUrl();
    loadMoments();
  }
});

const momentSearchInput = document.querySelector("[data-moment-search]");
if (momentSearchInput) {
  momentSearchInput.value = currentMomentSearch;
  momentSearchInput.addEventListener("input", () => {
    currentMomentSearch = momentSearchInput.value.trim();
    window.clearTimeout(momentSearchTimer);
    setMomentSearchStatus(currentMomentSearch ? `准备搜索“${currentMomentSearch}”...` : "输入关键词，搜索已经发布的瞬间内容和标签。");
    momentSearchTimer = window.setTimeout(() => {
      syncMomentUrl();
      loadMoments();
    }, 260);
  });
  momentSearchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    momentSearchInput.value = "";
    currentMomentSearch = "";
    syncMomentUrl();
    loadMoments();
  });
}

document.querySelector("[data-local-search]")?.addEventListener("input", (event) => {
  const q = event.currentTarget.value.trim().toLowerCase();
  document.querySelectorAll("[data-title]").forEach((item) => {
    item.classList.toggle("is-hidden", q && !item.dataset.title.toLowerCase().includes(q));
  });
});

const renderSearchResults = (items) => {
  const box = document.querySelector("[data-search-results]");
  if (!box) return;
  if (!items?.length) {
    box.innerHTML = '<span class="empty-result">没有找到相关记录</span>';
    return;
  }
  box.innerHTML = items.map((item) => {
    const label = item.title || item.summary || "未命名记录";
    const type = ({ post: "札记", project: "项目", moment: "瞬间" })[item.type] || "记录";
    const href = normalizeSiteHref(item.url || "/archive.html", "/archive.html");
    return `<a href="${escapeHtml(href)}">${escapeHtml(type)} · ${escapeHtml(label)}</a>`;
  }).join("");
};

let searchTimer;
searchInput?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (!q) return;
  searchTimer = setTimeout(async () => {
    try {
      const result = await apiGet(`/api/search?q=${encodeURIComponent(q)}`);
      renderSearchResults(result.items);
    } catch {
      renderSearchResults([]);
    }
  }, 220);
});

const viewTrackedTargets = new Set();

const defaultViewTarget = () => {
  if (document.querySelector("[data-post-title]") || document.querySelector("[data-project-title]")) return "";
  return `page:${page || "home"}`;
};

const trackPageView = async (target = defaultViewTarget()) => {
  const cleanTarget = String(target || "").trim();
  if (isVisualEditor || !cleanTarget || viewTrackedTargets.has(cleanTarget)) return;
  viewTrackedTargets.add(cleanTarget);
  try {
    await apiPost("/api/view-events", {
      target: cleanTarget,
      page,
      path: window.location.pathname
    });
  } catch {}
};

const enableVisualEditorBridge = () => {
  if (new URLSearchParams(window.location.search).get("editor") !== "1") return;
  document.body.dataset.visualEditor = "true";
  let selectedEditorTarget = null;
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-edit-target],[data-text-key],[data-layout-key],[data-like-target],[data-comment-like-target]");
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    if (selectedEditorTarget && selectedEditorTarget !== target) {
      delete selectedEditorTarget.dataset.editorSelected;
    }
    selectedEditorTarget = target;
    selectedEditorTarget.dataset.editorSelected = "true";
    const editTarget = target.dataset.editTarget
      || (target.dataset.textKey ? `text:${target.dataset.textKey}` : "")
      || (target.dataset.layoutKey ? `layout:${target.dataset.layoutKey}` : "")
      || (target.dataset.likeTarget ? `reaction:${target.dataset.likeTarget}` : "")
      || (target.dataset.commentLikeTarget ? `reaction:${target.dataset.commentLikeTarget}` : "");
    window.parent?.postMessage({
      source: "jlemonz-frontend-editor",
      target: editTarget,
      page,
      text: target.textContent?.trim() || "",
      href: target.getAttribute("href") || ""
    }, window.location.origin);
  }, true);
};

const enableVisualEditorPreviewPatches = () => {
  if (new URLSearchParams(window.location.search).get("editor") !== "1") return;
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const message = event.data || {};
    if (message.source !== "jlemonz-admin-editor-preview") return;
    const payload = message.payload || {};
    if (payload.texts && typeof payload.texts === "object") {
      for (const [key, value] of Object.entries(payload.texts)) {
        document.querySelectorAll(`[data-text-key="${CSS.escape(key)}"]`).forEach((node) => {
          const text = String(value ?? "");
          const attrs = (node.dataset.textAttr || "").split(",").map((item) => item.trim()).filter(Boolean);
        if (attrs.length) {
          attrs.forEach((attr) => node.setAttribute(attr, text));
          if ("value" in node) node.value = text;
        } else if (node.dataset.animeLogo) {
          renderAnimeLogo(node, text);
        } else {
          node.textContent = text;
        }
      });
    }
    }
    if (payload.footerSections) renderFooterSections(payload.footerSections);
    if (payload.layout) applyFrontendLayout(payload.layout);
    if (payload.ui) applyFrontendUi(payload.ui);
  });
};

enableVisualEditorBridge();
enableVisualEditorPreviewPatches();
applyFrontendLayout(frontendLayout);
applyFrontendUi(frontendUi);
renderExistingAnimeLogos();
hydrateEditableTextsFromCache();
applyArchiveCategoryState();
const editableTextReady = applyEditableTexts();
editableTextReady.finally(loadDynamicContent);
renderQuote();
renderMoyuWidget();
loadGithub();
trackPageView();
loadProjectDetail();
loadPostDetail();
renderLikes();
loadComments();

const interviewConsoleMessage = (value, fallback = "操作失败，请稍后再试") => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (/502 Bad Gateway/i.test(raw)) return "服务器接口暂时不可用，已切到本地练习题";
  if (/<html|<!doctype|nginx\//i.test(raw)) return "服务器返回了错误页，已切到本地练习题";
  return raw.length > 64 ? raw.slice(0, 64) + "…" : raw;
};

const interviewDevToast = (message, tone = "info") => {
  let stack = document.querySelector("[data-toast-stack]");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.dataset.toastStack = "true";
    document.body.appendChild(stack);
  }
  const toast = document.createElement("div");
  toast.className = `dev-toast is-${tone}`;
  toast.setAttribute("role", tone === "danger" ? "alert" : "status");
  toast.innerHTML = `<span class="toast-dot" aria-hidden="true"></span><span>${escapeHtml(interviewConsoleMessage(message))}</span>`;
  stack.appendChild(toast);
  window.setTimeout(() => toast.classList.add("is-leaving"), 2200);
  window.setTimeout(() => toast.remove(), 2800);
};

const initInterviewDevConsole = () => {
  const root = document.querySelector("[data-interview-console]");
  if (!root) return;

  const list = root.querySelector("[data-interview-list]");
  const status = root.querySelector("[data-train-status]");
  const calendar = root.querySelector("[data-interview-calendar]");
  const topicTop = root.querySelector("[data-topic-top]");
  const modeButtons = [...root.querySelectorAll("[data-train-mode]")];
  const addQuestionPanel = root.querySelector("#add-question");
  const addQuestionForm = root.querySelector("[data-add-question-form]");
  const addQuestionStatus = root.querySelector("[data-add-question-status]");
  const addQuestionSubmit = root.querySelector("[data-add-question-submit]");
  const stateKey = `jlemonz:interview:practice:v1:${new Date().toISOString().slice(0, 10)}`;
  const tokenKey = "jlemonz:interview:generate-token:v1";
  let questions = [];
  let mode = "daily";
  let activeMockIds = [];
  let activeDailyDate = "";
  const state = (() => {
    try {
      return JSON.parse(localStorage.getItem(stateKey) || "{}");
    } catch {
      return {};
    }
  })();
  state.proficiency ||= {};
  state.rounds ||= [];
  if (addQuestionPanel?.tagName === "DETAILS" && window.matchMedia("(max-width: 1100px)").matches) {
    addQuestionPanel.open = false;
  }

  const saveState = () => localStorage.setItem(stateKey, JSON.stringify(state));
  const setAddQuestionStatus = (message, tone = "idle") => {
    if (!addQuestionStatus) return;
    addQuestionStatus.textContent = message;
    addQuestionStatus.dataset.state = tone;
  };
  const normalizeList = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
  const questionId = (item) => String(item.questionId || item.id || item.number || item.question || Math.random());
  const trainingFallbackFromCard = (card) => {
    const id = String(card?.dataset?.questionId || "").trim();
    return {
      id,
      slug: id,
      questionId: id,
      questionKey: id,
      question: card?.querySelector("h2")?.textContent?.trim() || ""
    };
  };
  const toneByLevel = { "不熟": "danger", "模糊": "warning", "基本会": "info", "稳了": "success" };
  const weakLevels = new Set(["不熟", "模糊"]);

  const renderSideCalendar = () => {
    if (!calendar) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const done = Object.keys(state.proficiency).length;
    const total = questions.length || 50;
    const level = done === 0 ? 0 : done < 10 ? 1 : done < 25 ? 2 : done < 45 ? 3 : 4;
    const cells = [];
    for (let i = 0; i < startOffset; i += 1) cells.push('<span class="is-empty" aria-hidden="true"></span>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const isToday = day === today;
      cells.push(`<span class="${isToday ? "is-today" : ""}" data-level="${isToday ? level : 0}" title="${month + 1}月${day}日">${day}</span>`);
    }
    calendar.innerHTML = cells.join("");
    root.querySelector("[data-calendar-title]")?.replaceChildren(`${month + 1} 月训练`);
    root.querySelector("[data-calendar-note]")?.replaceChildren(`今日 ${Math.min(done, total)}/${total} 题，先刷完竖向题单。`);
  };

  const renderTopicTop = () => {
    if (!topicTop) return;
    const counts = new Map();
    questions.forEach((item) => {
      const level = state.proficiency[questionId(item)];
      if (!weakLevels.has(level)) return;
      const key = item.category || item.tag || "未分类";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    topicTop.innerHTML = top.length
      ? top.map(([name, count]) => `<li><span>${escapeHtml(name)}</span><strong>${count}</strong></li>`).join("")
      : '<li><span>先标记几题</span><strong>0</strong></li>';
  };

  const fallbackQuestions = [
    {
      questionId: "dev-q-1",
      number: 1,
      category: "前端",
      tag: "浏览器",
      question: "浏览器输入 URL 后发生了什么？",
      answer: "可以按 DNS、TCP/TLS、HTTP 请求、缓存、HTML 解析、CSSOM/DOM、布局绘制和合成来讲。最后补充性能优化点，比如缓存、CDN、资源优先级和减少阻塞。",
      points: ["先给总链路", "网络和渲染分层讲", "最后落到性能优化"],
      followUps: ["强缓存和协商缓存怎么区别？", "重排、重绘、合成分别是什么？"],
      interviewerFocus: ["能否结构化表达", "是否知道缓存和渲染细节"],
      speechTemplate: ["我会先把链路拆成网络和渲染两段。", "网络侧先 DNS，再建连和请求。", "浏览器侧解析资源，构建 DOM/CSSOM，最后布局绘制合成。"],
      commonMistakes: ["只背流程，不讲缓存", "把重排和重绘混在一起"],
      projectPrompts: ["如果你的博客首页慢，你会从哪里查？"],
      difficulty: "高频必会"
    },
    {
      questionId: "dev-q-2",
      number: 2,
      category: "项目",
      tag: "复盘",
      question: "介绍一个你最能体现成长的项目。",
      answer: "建议按背景、目标、难点、取舍、结果、复盘来讲。重点不是堆功能，而是说明你如何发现问题、权衡方案、落地验证，并沉淀下一步。",
      points: ["用 STAR 结构", "讲清取舍", "给结果和复盘"],
      followUps: ["如果重做一次，你会改哪里？", "这个项目最大的风险是什么？"],
      interviewerFocus: ["是否真正参与", "能否复盘失败和取舍"],
      speechTemplate: ["项目背景是一句话。", "我负责的核心问题是……", "当时有两个方案，我选择……", "结果是……，复盘后我会……"],
      commonMistakes: ["只讲页面好看", "没有指标和取舍"],
      projectPrompts: ["把这个回答迁移到你的后台管理系统怎么讲？"],
      difficulty: "项目追问"
    }
  ];

  const setMode = (nextMode) => {
    mode = nextMode || "daily";
    modeButtons.forEach((button) => {
      const active = button.dataset.trainMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    render();
  };

  const updateStats = () => {
    const entries = Object.values(state.proficiency);
    const weak = entries.filter((value) => weakLevels.has(value)).length;
    const mastered = entries.filter((value) => value === "稳了").length;
    root.querySelector("[data-stat-rounds]")?.replaceChildren(String(state.rounds.length));
    root.querySelector("[data-stat-weak]")?.replaceChildren(String(weak));
    root.querySelector("[data-stat-mastered]")?.replaceChildren(String(mastered));
    const total = questions.length || 50;
    const done = Object.keys(state.proficiency).length;
    const progress = total ? Math.round((done / total) * 100) : 0;
    root.querySelector("[data-daily-progress]")?.style.setProperty("--daily-progress", `${progress}%`);
    root.querySelector("[data-daily-count]")?.replaceChildren(`${Math.min(done, total)}/${total}`);
    renderSideCalendar();
    renderTopicTop();
  };

  const pickMockQuestions = (preferWeak = false) => {
    const scored = [...questions].sort((a, b) => {
      const av = state.proficiency[questionId(a)];
      const bv = state.proficiency[questionId(b)];
      const score = (v) => v === "不熟" ? 0 : v === "模糊" ? 1 : v ? 3 : 2;
      return score(av) - score(bv);
    });
    const pool = preferWeak ? scored.filter((item) => weakLevels.has(state.proficiency[questionId(item)])) : scored;
    activeMockIds = (pool.length ? pool : scored).slice(0, 5).map(questionId);
    state.rounds.push({ at: new Date().toISOString(), ids: activeMockIds });
    saveState();
    setMode("mock");
    interviewDevToast(preferWeak ? "已优先抽取薄弱题" : "模拟面试已抽 5 题", "success");
  };

  const questionGoalIds = (item) => Array.isArray(item.goalIds) ? item.goalIds.map(String) : [];
  const questionGoalLabels = (item) => {
    const objectIds = Array.isArray(item.goals)
      ? item.goals.map((goal) => goal.id ?? goal.goalId ?? goal.goal_id).filter((id) => id !== undefined && id !== null && String(id) !== "")
      : [];
    const fromIds = [...questionGoalIds(item), ...objectIds].map((id) => state.goalLabels?.get(String(id))).filter(Boolean);
    const fromObject = Array.isArray(item.goals)
      ? item.goals.map((goal) => {
        const goalId = goal.id ?? goal.goalId ?? goal.goal_id;
        return (goalId !== undefined && goalId !== null ? state.goalLabels?.get(String(goalId)) : "") || goal.title || goal.slug;
      }).filter(Boolean)
      : [];
    const labels = [...new Set([...fromIds, ...fromObject])].slice(0, 4);
    if (labels.length) return labels;
    if (state.activeGoalTitle) return [state.activeGoalTitle];
    if (item.goalTitle || item.goal_title) return [item.goalTitle || item.goal_title];
    return ["未归类"];
  };

  const questionCard = (item) => {
    const id = questionId(item);
    const level = state.proficiency[id] || "未练";
    const isWeak = weakLevels.has(level);
    const answerBlocks = [
      ["参考回答", item.answer ? [item.answer] : []],
      ["核心要点", normalizeList(item.points)],
      ["追问", normalizeList(item.followUps)],
      ["面试官看点", normalizeList(item.interviewerFocus)],
      ["表达模板", normalizeList(item.speechTemplate)],
      ["常见错误", normalizeList(item.commonMistakes)],
      ["项目迁移追问", normalizeList(item.projectPrompts)]
    ].filter(([, values]) => values.length);
    return `
      <article class="interview-card train-question-card ${isWeak ? "is-weak" : ""}" data-question-id="${escapeHtml(id)}">
        <div class="train-question-body">
          <div class="interview-card-top">
            <span class="interview-badge">${escapeHtml(item.category || "面试")}</span>
            <span class="train-pill">${escapeHtml(item.difficulty || "训练")}</span>
            ${isWeak ? '<span class="train-pill is-warn">优先复盘</span>' : ""}
          </div>
          <h2>${escapeHtml(item.number ? String(item.number).padStart(2, "0") + ". " : "")}${escapeHtml(item.question || item.title || "未命名题目")}</h2>
          <p>${escapeHtml(item.tag || "先想结论，再看答案。")}</p>
          <div class="interview-meta">
            <span>熟练度：${escapeHtml(level)}</span>
            <span>${answerBlocks.length} 个训练区块</span>
          </div>
        </div>
        <aside class="train-card-panel" aria-label="训练操作">
          <div class="train-card-actions">
            <button type="button" class="train-primary" data-toggle-answer>看答案</button>
            ${renderInterviewExampleButton(item)}
            <button type="button" class="train-ghost" data-mark-review>加复盘</button>
          </div>
        </aside>
        ${renderInterviewExample(item)}
        <div class="train-answer" hidden>
          <div class="train-answer-grid">
            ${answerBlocks.map(([title, values]) => `
              <section>
                <h3>${escapeHtml(title)}</h3>
                ${values.length === 1 && title === "参考回答" ? `<p>${escapeHtml(values[0])}</p>` : `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`}
              </section>
            `).join("")}
          </div>
          <div class="train-score-row">
            ${["不熟", "模糊", "基本会", "稳了"].map((value) => `<button type="button" data-level="${value}" class="${state.proficiency[id] === value ? "active" : ""}">${value}</button>`).join("")}
          </div>
        </div>
      </article>
    `;
  };

  const visibleQuestions = () => {
    if (mode === "mock") return questions.filter((item) => activeMockIds.includes(questionId(item))).slice(0, 5);
    if (mode === "review") return questions.filter((item) => weakLevels.has(state.proficiency[questionId(item)]));
    return questions;
  };

  const render = () => {
    updateStats();
    const items = visibleQuestions();
    if (!items.length) {
      list.innerHTML = '<div class="empty-state"><strong>这里暂时没有题</strong><a href="/admin/">去后台补题或先标记几道薄弱题</a></div>';
      return;
    }
    list.innerHTML = items.map(questionCard).join("");
    if (status) {
      const label = mode === "mock" ? "模拟面试：答案默认收起，先想结论再展开。" : mode === "review" ? "错题复盘：只显示不熟和模糊题。" : "今日题单：从服务器训练接口读取。";
      status.innerHTML = `<strong>${label}</strong><span>错误提示已降噪，502 不会再把 HTML 原文塞进页面。</span>`;
    }
  };

  modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.trainMode)));
  root.querySelector("[data-start-mock]")?.addEventListener("click", () => pickMockQuestions(false));
  root.querySelector("[data-review-weak]")?.addEventListener("click", () => {
    const weak = questions.filter((item) => weakLevels.has(state.proficiency[questionId(item)]));
    if (!weak.length) interviewDevToast("还没有薄弱题，先标记几道“不熟/模糊”", "warning");
    else setMode("review");
  });
  root.querySelector("[data-show-tip]")?.addEventListener("click", () => interviewDevToast("建议：先想结论，再看答案补漏洞。", "info"));

  root.querySelector("[data-scroll-add-question]")?.addEventListener("click", () => {
    if (addQuestionPanel?.tagName === "DETAILS") addQuestionPanel.open = true;
    addQuestionPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    root.querySelector('[data-add-question-form] textarea[name="question"]')?.focus({ preventScroll: true });
  });

  const hydrateTrainingQuestionDetail = async (item = {}, id = "") => {
    const lookupKey = String(item.id || item.slug || item.questionId || item.questionKey || id || "").trim();
    if (!lookupKey) throw new Error("question_detail_key_missing");
    const detail = await apiGet(`/api/interview/questions/${encodeURIComponent(lookupKey)}`);
    const next = {
      ...item,
      ...detail,
      question: detail.question || detail.title || item.question || item.title || "",
      answer: detail.answer_md || detail.answer || item.answer || "",
      points: detail.points || detail.answerPoints?.points || item.points || [],
      followUps: detail.followUps || detail.answerPoints?.followUps || item.followUps || [],
      interviewerFocus: detail.interviewerFocus || detail.answerPoints?.interviewerFocus || item.interviewerFocus || [],
      speechTemplate: detail.speechTemplate || detail.answerPoints?.speechTemplate || item.speechTemplate || [],
      commonMistakes: detail.commonMistakes || detail.answerPoints?.commonMistakes || item.commonMistakes || [],
      projectPrompts: detail.projectPrompts || detail.answerPoints?.projectPrompts || item.projectPrompts || [],
      exampleCase: detail.exampleCase ?? detail.example_case ?? item.exampleCase ?? item.example_case ?? null,
      exampleCaseReady: Boolean(detail.exampleCaseReady || detail.example_case_ready || detail.exampleCase || item.exampleCaseReady)
    };
    const index = questions.findIndex((entry) => questionId(entry) === id);
    if (index >= 0) questions[index] = next;
    return next;
  };

  const replaceTrainingQuestionCard = (card, item, openType = "") => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = questionCard(item).trim();
    const nextCard = wrapper.firstElementChild;
    if (!nextCard) return card;
    card.replaceWith(nextCard);
    if (openType === "answer") {
      nextCard.querySelector(".train-answer")?.removeAttribute("hidden");
      const button = nextCard.querySelector("[data-toggle-answer]");
      if (button) button.textContent = "收起答案";
    }
    if (openType === "example") {
      nextCard.querySelector(".train-example")?.removeAttribute("hidden");
      const button = nextCard.querySelector("[data-card-example]");
      if (button) button.textContent = "收起实例";
    }
    return nextCard;
  };

  list.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-question-id]");
    if (!card) return;
    const id = card.dataset.questionId;
    const item = questions.find((entry) => questionId(entry) === id) || trainingFallbackFromCard(card);
    if (event.target.closest("[data-toggle-answer]")) {
      const answer = card.querySelector(".train-answer");
      const hidden = answer?.hasAttribute("hidden");
      if (hidden) {
        answer.removeAttribute("hidden");
        event.target.textContent = "收起答案";
        interviewDevToast("答案已展开，顺手选一下熟练度", "success");
      } else {
        answer.setAttribute("hidden", "");
        event.target.textContent = "看答案";
      }
    }
    if (event.target.closest("[data-card-example]")) {
      const example = card.querySelector(".train-example");
      const button = event.target.closest("[data-card-example]");
      const hidden = !example || example.hasAttribute("hidden");
      if (hidden) {
        if (!normalizeBackendInterviewExampleCase(item)) {
          button.disabled = true;
          button.textContent = "加载中";
          try {
            const detail = await hydrateTrainingQuestionDetail(item, id);
            if (normalizeBackendInterviewExampleCase(detail)) {
              replaceTrainingQuestionCard(card, detail, "example");
            } else {
              replaceTrainingQuestionCard(card, detail, "");
              interviewDevToast("这道题的实例还在生成中", "warning");
            }
          } catch {
            button.disabled = false;
            button.textContent = "实例";
            interviewDevToast("实例详情加载失败，请稍后再试", "warning");
          }
          return;
        }
        example.removeAttribute("hidden");
        button.textContent = "收起实例";
      } else {
        example?.setAttribute("hidden", "");
        button.textContent = "实例";
      }
    }
    if (event.target.closest("[data-mark-review]")) {
      state.proficiency[id] = "模糊";
      saveState();
      render();
      interviewDevToast("已加入错题复盘", "warning");
    }
    const levelButton = event.target.closest("[data-level]");
    if (levelButton) {
      state.proficiency[id] = levelButton.dataset.level;
      saveState();
      render();
      interviewDevToast(`已标记：${levelButton.dataset.level}`, toneByLevel[levelButton.dataset.level] || "info");
    }
  });

  if (addQuestionForm) {
    const tokenInput = addQuestionForm.querySelector('input[name="token"]');
    if (tokenInput) tokenInput.value = sessionStorage.getItem(tokenKey) || "";
    tokenInput?.addEventListener("input", () => sessionStorage.setItem(tokenKey, tokenInput.value.trim()));
    addQuestionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(addQuestionForm);
      const token = String(formData.get("token") || "").trim();
      const question = String(formData.get("question") || "").trim();
      if (!question) {
        setAddQuestionStatus("请先填写题目。", "error");
        return;
      }
      if (!token) {
        setAddQuestionStatus("需要生成 Token 才能添加公共题目。", "error");
        tokenInput?.focus();
        return;
      }
      sessionStorage.setItem(tokenKey, token);
      setAddQuestionStatus("正在保存题目...", "loading");
      if (addQuestionSubmit) addQuestionSubmit.disabled = true;
      try {
        const response = await fetch(apiUrl("/api/interview/daily-question"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            date: activeDailyDate,
            question,
            category: formData.get("category"),
            tag: formData.get("tag"),
            difficulty: formData.get("difficulty"),
            answer: formData.get("answer")
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) throw new Error(data.message || "保存失败");
        const daily = await apiGet("/api/interview/daily");
        activeDailyDate = daily.date || activeDailyDate;
        questions = Array.isArray(daily.questions) && daily.questions.length ? daily.questions : questions;
        render();
        addQuestionForm.reset();
        if (tokenInput) tokenInput.value = token;
        setAddQuestionStatus(`已添加到今日题单，当前 ${data.total || questions.length} 题。`, "success");
        interviewDevToast("题目已添加", "success");
      } catch (error) {
        setAddQuestionStatus(interviewConsoleMessage(error?.message, "题目保存失败"), "error");
      } finally {
        if (addQuestionSubmit) addQuestionSubmit.disabled = false;
      }
    });
  }

  apiGet("/api/interview/daily")
    .then((data) => {
      activeDailyDate = data.date || activeDailyDate;
      questions = Array.isArray(data.questions) && data.questions.length ? data.questions : fallbackQuestions;
      render();
      interviewDevToast(`题单已加载：${questions.length} 题`, "success");
    })
    .catch((error) => {
      questions = fallbackQuestions;
      render();
      interviewDevToast(interviewConsoleMessage(error?.message, "服务器题单暂不可用，已进入测试题模式"), "warning");
    });
};

const initInterviewGoalPlan = (root, clientKey = "") => {
  const tree = root.querySelector("[data-goal-tree]");
  const summary = root.querySelector("[data-goal-summary]");
  const clearButton = root.querySelector("[data-goal-clear]");
  const activeLabel = root.querySelector("[data-goal-active-label]");
  const viewButtons = [...root.querySelectorAll("[data-goal-view]")];
  const hasVisibleGoalPlan = Boolean(tree || summary);

  let plan = null;
  let activeGoalId = "";
  let activeGoalSlug = "";
  let viewMode = "knowledge";
  const openGoalIds = new Set();

  const cssEscape = (value) => window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, "\\$&");
  const collectIds = (node) => [String(node?.id || ""), ...(node?.children || []).flatMap(collectIds)].filter(Boolean);
  const flattenPlanNodes = (nodes = []) => nodes.flatMap((node) => [node, ...flattenPlanNodes(node?.children || [])]);
  const safePercent = (value = 0) => Math.max(0, Math.min(100, Number(value) || 0));
  const goalQuestions = (node) => Array.isArray(node.questionPreview) ? node.questionPreview : [];
  const goalKnowledge = (node) => Array.isArray(node.knowledgePoints) ? node.knowledgePoints.filter(Boolean).slice(0, 8) : [];
  const goalMeta = (node) => `${Number(node.completedCount || 0)}/${Number(node.questionCount || 0)} 题 · ${safePercent(node.displayProgress || 0)}%`;
  const rootGoal = () => (plan?.tree || []).length === 1 ? plan.tree[0] : null;
  const isFallbackGoal = (node = {}) => {
    const slug = String(node.slug || "").trim().toLowerCase();
    const title = String(node.title || "").trim();
    return slug === "other" || title === "其他" || title === "其它";
  };
  const categories = () => (rootGoal()?.children?.length ? rootGoal().children : (plan?.tree || [])).filter((node) => !isFallbackGoal(node));

  const progressBar = (value = 0, label = "") => {
    const safe = safePercent(value);
    return `<div class="robot-progress" aria-label="${escapeHtml(label || `进度 ${safe}%`)}"><span style="width:${safe}%"></span><strong>${safe}%</strong></div>`;
  };

  const emitGoal = (goal = null) => {
    activeGoalId = goal?.id ? String(goal.id) : "";
    activeGoalSlug = goal?.slug || "";
    const descendantIds = goal ? (Array.isArray(goal.descendantIds) && goal.descendantIds.length ? goal.descendantIds.map(String) : collectIds(goal)) : [];
    root.dispatchEvent(new CustomEvent("interview:goal-select", {
      detail: {
        goalId: activeGoalId,
        slug: activeGoalSlug,
        title: goal?.title || "",
        accent: goal?.accent || "",
        descendantIds
      }
    }));
    render();
  };

  const isActive = (node) => {
    if (!activeGoalId) return false;
    return String(node.id) === activeGoalId || (node.descendantIds || []).map(String).includes(activeGoalId);
  };

  const renderSummary = () => {
    if (!summary) return;
    const data = plan?.summary || {};
    const categoryCount = categories().length;
    summary.innerHTML = `
      <article><span>目标</span><strong>${Number(data.totalGoals || 0)}</strong><small>${categoryCount} 个方向</small></article>
      <article><span>方向</span><strong>${categoryCount}</strong><small>目标目录</small></article>
      <article><span>进度</span><strong>${Number(data.questionCount || 0)}</strong><small>${Number(data.completedCount || 0)} 已完成</small></article>
    `;
  };

  const questionTags = (item = {}) => Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 3) : [];
  const renderQuestionPreview = (node) => {
    const rows = goalQuestions(node).slice(0, 8);
    if (!rows.length) return '<p class="goal-tree-empty">暂无绑定题目</p>';
    return `<div class="goal-question-preview">${rows.map((item) => `
      <button type="button" data-goal-question="${escapeHtml(item.questionKey || item.id || "")}">
        <span>${escapeHtml(item.title || "未命名问题")}</span>
        <small>${escapeHtml(questionTags(item).join(" / ") || item.difficulty || "练习")}</small>
      </button>
    `).join("")}</div>`;
  };

  const renderKnowledgeFallback = (node) => {
    const items = goalKnowledge(node);
    if (!items.length) return '<p class="goal-tree-empty">暂无内容</p>';
    return `<div class="goal-knowledge-list static">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
  };

  const renderKnowledgeList = (category) => {
    const children = Array.isArray(category.children) ? category.children : [];
    if (!children.length) return renderKnowledgeFallback(category);
    return `<div class="goal-knowledge-list directory">${children.map((node) => `
      <button type="button" class="goal-knowledge-item ${isActive(node) ? "active" : ""}" data-goal-id="${escapeHtml(node.id)}" style="--goal-accent:${escapeHtml(node.accent || category.accent || "#e95f98")}">
        <span>${escapeHtml(node.title || "方向")}</span>
        <small>${escapeHtml(goalMeta(node))}</small>
      </button>
    `).join("")}</div>`;
  };

  const renderModePanel = (category) => viewMode === "questions" ? `
    <section class="goal-directory-panel">
      <div class="goal-directory-panel-head"><strong>题目</strong><span>${Number(category.questionCount || 0)} 题</span></div>
      ${renderQuestionPreview(category)}
    </section>
  ` : `
    <section class="goal-directory-panel">
      <div class="goal-directory-panel-head"><strong>方向</strong><span>${Number(category.children?.length || goalKnowledge(category).length || 0)} 项</span></div>
      ${renderKnowledgeList(category)}
    </section>
  `;

  const renderCategory = (category, index) => {
    const active = isActive(category);
    const categoryId = String(category.id || "");
    const open = openGoalIds.has(categoryId);
    return `
      <details class="goal-directory-category ${active ? "active" : ""}" ${open ? "open" : ""} data-goal-directory-id="${escapeHtml(categoryId)}" style="--goal-accent:${escapeHtml(category.accent || "#e95f98")}">
        <summary data-goal-id="${escapeHtml(categoryId)}" title="点击筛选本方向，展开查看目标内容">
          <span class="goal-directory-index">${String(index + 1).padStart(2, "0")}</span>
          <span class="goal-directory-title">
            <strong>${escapeHtml(category.title || "未命名分类")}</strong>
            <small>${escapeHtml(category.summary || "分类目录")}</small>
          </span>
          <span class="goal-tree-count">${escapeHtml(goalMeta(category))}</span>
        </summary>
        <div class="goal-directory-body">
          ${progressBar(category.displayProgress || 0, `${category.title || "分类"}进度`)}
          ${renderModePanel(category)}
        </div>
      </details>
    `;
  };

  const syncViewButtons = () => {
    viewButtons.forEach((button) => {
      button.hidden = false;
      button.removeAttribute("aria-hidden");
      const active = button.dataset.goalView === viewMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
  };

  const render = () => {
    renderSummary();
    syncViewButtons();
    clearButton?.classList.toggle("active", !activeGoalId);
    if (activeLabel) activeLabel.textContent = activeGoalId ? `当前筛选：${(plan?.flat || []).find((goal) => String(goal.id) === activeGoalId)?.title || "目标"}` : "";
    if (!tree || !hasVisibleGoalPlan) return;
    const rows = categories();
    tree.innerHTML = rows.length
      ? `<div class="goal-directory-list">${rows.map(renderCategory).join("")}</div>`
      : '<div class="empty-state"><strong>暂无目标目录</strong><span>去后台添加目标方向。</span></div>';
  };

  const findGoal = (id) => (plan?.flat || []).find((node) => String(node.id) === String(id));

  root.addEventListener("click", (event) => {
    const questionButton = event.target.closest("[data-goal-question]");
    if (questionButton && root.contains(questionButton)) {
      const key = questionButton.dataset.goalQuestion;
      const card = key ? root.querySelector(`[data-question-id="${cssEscape(key)}"]`) : null;
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const goalButton = event.target.closest("[data-goal-id]");
    if (!goalButton || !root.contains(goalButton)) return;
    const details = goalButton.closest("[data-goal-directory-id]");
    if (details && goalButton.tagName?.toLowerCase() === "summary") {
      const id = details.dataset.goalDirectoryId;
      if (id) {
        if (details.open) openGoalIds.delete(id);
        else openGoalIds.add(id);
      }
    }
    const goal = findGoal(goalButton.dataset.goalId);
    if (goal) emitGoal(goal);
  });

  viewButtons.forEach((button) => button.addEventListener("click", () => {
    viewMode = button.dataset.goalView === "questions" ? "questions" : "knowledge";
    render();
  }));

  clearButton?.addEventListener("click", () => emitGoal(null));

  const loadPlan = () => fetch(apiUrl("/api/interview/plan"), {
    headers: { Accept: "application/json", "x-client-key": clientKey }
  })
    .then((response) => response.json())
    .then((data) => {
      plan = data || {};
      const flat = Array.isArray(plan.flat) && plan.flat.length ? plan.flat : flattenPlanNodes(plan.tree || []);
      plan.flat = flat;
      root.dispatchEvent(new CustomEvent("interview:plan-loaded", {
        detail: { flat }
      }));
      render();
    })
    .catch(() => {
      if (tree) tree.innerHTML = '<div class="empty-state"><strong>目标目录加载失败</strong><span>稍后刷新再试。</span></div>';
    });

  root.addEventListener("interview:plan-refresh", loadPlan);
  loadPlan();
};
const initInterviewSkyConsole = () => {
  const root = document.querySelector("[data-interview-console]");
  if (!root) return;

  const list = root.querySelector("[data-interview-list]");
  const status = root.querySelector("[data-train-status]");
  const calendar = root.querySelector("[data-interview-calendar]");
  const topicTop = root.querySelector("[data-topic-top]");
  const modeButtons = [...root.querySelectorAll("[data-train-mode]")];
  const addQuestionPanel = root.querySelector("#add-question");
  const addQuestionStatus = root.querySelector("[data-add-question-status]");
  const generationGoal = root.querySelector("[data-generation-goal]");
  const generationGoalSelect = root.querySelector("[data-generation-goal-select]");
  const generationStart = root.querySelector("[data-generation-start]");
  const generationFill = root.querySelector("[data-generation-fill]");
  const generationApproveAll = root.querySelector("[data-generation-approve-all]");
  const generationAnswers = root.querySelector("[data-generation-answers]");
  const generationPublish = root.querySelector("[data-generation-publish]");
  const generationProgress = root.querySelector("[data-generation-progress]");
  const generationCandidates = root.querySelector("[data-generation-candidates]");
  const generationRequirements = root.querySelector("[data-generation-requirements]");
  const generationDifficulty = root.querySelector("[data-generation-difficulty]");
  const generationLiveStatus = root.querySelector("[data-generation-live-status]");
  const generationLiveTitle = root.querySelector("[data-generation-live-title]");
  const generationLiveDetail = root.querySelector("[data-generation-live-detail]");
  const tagFilterPanel = root.querySelector("[data-interview-tag-filter]");
  const tagFilterSummary = root.querySelector("[data-interview-tag-summary]");
  const tagFilterList = root.querySelector("[data-interview-tag-list]");
  const tagFilterClear = root.querySelector("[data-interview-tag-clear]");
  const tomorrowPanel = root.querySelector("#tomorrow-question-set");
  const tomorrowForm = root.querySelector("[data-tomorrow-form]");
  const tomorrowStatus = root.querySelector("[data-tomorrow-status]");
  const tomorrowSubmit = root.querySelector("[data-tomorrow-submit]");
  const tokenKey = "jlemonz:interview:generate-token:v1";
  const generationSpecKey = "jlemonz:interview:generation-spec:v1";
  const generationBatchKey = "jlemonz:interview:generation-batch:v1";
  const clientKeyName = "jlemonz:interview:client:v1";
  const fallbackProgressPrefix = "jlemonz:interview:progress:v2:";
  const fallbackInsightsKey = "jlemonz:interview:insights:v2";
  const checkinKey = "jlemonz:interview:checkins:v1";
  const fallbackQuestions = [
    {
      questionId: "local-i2c-01",
      questionKey: "local-i2c-01",
      number: 1,
      category: "嵌入式",
      tag: "I2C",
      question: "嵌入式 I2C 协议的起始、停止、应答和仲裁怎么讲？",
      answer: "I2C 是两线同步串行总线，SCL 负责时钟，SDA 负责数据。主机发起 START 后发送 7/10 位地址和读写位，从机 ACK。数据按字节传输，每字节后都有 ACK/NACK。STOP 结束传输。多主场景通过 SDA 线与仲裁，谁发送 1 但读到 0 就丢失仲裁。",
      points: ["两线开漏，上拉电阻", "START/STOP 时序", "地址 + R/W + ACK", "多主仲裁和时钟拉伸"],
      followUps: ["ACK 和 NACK 分别什么时候出现？", "为什么 I2C 需要上拉电阻？", "时钟拉伸会造成什么问题？"],
      interviewerFocus: ["是否能画出基本时序", "是否知道硬件电气特性", "是否能结合驱动调试讲"],
      speechTemplate: ["先定义总线角色和两根线。", "再讲一次完整传输：起始、地址、应答、数据、停止。", "最后补充异常：NACK、仲裁丢失、时钟拉伸。"],
      commonMistakes: ["只背 SDA/SCL，不讲 ACK", "把 SPI 的片选逻辑套到 I2C", "忽略开漏和上拉"],
      projectPrompts: ["项目里 I2C 读不到设备，你会怎么排查？"],
      difficulty: "高频必会",
      markers: { starRating: 5, isDifficult: true, isCommon: true, inCollection: true, markerNote: "" }
    }
  ];
  const state = {
    mode: "daily",
    date: "",
    requestedDate: "",
    month: "",
    weekOffset: 0,
    daily: null,
    questions: [],
    progress: {},
    insights: {},
    calendarItems: [],
    markerSaving: {},
    insightTimers: new Map(),
    activeMockIds: [],
    activeGoalId: "",
    activeGoalSlug: "",
    activeGoalTitle: "",
    activeGoalDescendantIds: [],
    activeGoalAccent: "",
    goalLabels: new Map(),
    goalAccents: new Map(),
    bank: {
      page: 1,
      limit: 24,
      total: 0,
      hasMore: false,
      selectedTags: [],
      availableTags: [],
      tagsLoading: false,
      detailCache: new Map()
    },
    generation: {
      batch: null,
      activeCandidateId: "",
      busy: false,
      busyMessage: "",
      liveOverride: null
    }
  };

  const todayText = () => {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date()).reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const monthText = (dateText = todayText()) => dateText.slice(0, 7);
  const getClientKey = () => {
    let key = localStorage.getItem(clientKeyName);
    if (!/^client_[a-z0-9_-]{20,}$/i.test(key || "")) {
      const raw = crypto?.getRandomValues ? [...crypto.getRandomValues(new Uint8Array(24))].map((n) => n.toString(36)).join("") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      key = `client_${raw}`.slice(0, 96);
      localStorage.setItem(clientKeyName, key);
    }
    return key;
  };
  const clientKey = getClientKey();
  initInterviewGoalPlan(root, clientKey);
  const questionKey = (item) => String(item.questionKey || item.questionId || item.id || item.number || item.question || "");
  const formatSource = (daily) => {
    const source = daily?.source || {};
    const provider = source.provider || "admin";
    const model = source.model || "manual";
    return `${provider} / ${model}`;
  };
  const formatTime = (value) => value ? String(value).replace("T", " ").slice(0, 16) : "未记录";
  const tokenInputs = () => [...root.querySelectorAll('input[name="token"]')];
  const currentToken = () => {
    const focused = tokenInputs().find((input) => input.value.trim());
    return (focused?.value || sessionStorage.getItem(tokenKey) || "").trim();
  };
  const syncTokenInputs = (value) => {
    sessionStorage.setItem(tokenKey, value.trim());
    tokenInputs().forEach((input) => {
      if (document.activeElement !== input) input.value = value;
    });
  };
  const currentGenerationSpec = (requireDirection = false) => {
    const direction = String(generationRequirements?.value || "").trim();
    const difficulty = String(generationDifficulty?.value || "进阶").trim() || "进阶";
    if (requireDirection && !direction) {
      setPanelStatus(addQuestionStatus, "请先写清楚出题方向/范围。", "error");
      state.generation.liveOverride = {
        stateName: "error",
        title: "方向不能为空",
        detail: "写清楚知识点、项目场景或排查方向后再生成。"
      };
      setGenerationLiveStatus(state.generation.liveOverride.stateName, state.generation.liveOverride.title, state.generation.liveOverride.detail);
      generationRequirements?.focus();
      return null;
    }
    const requirements = direction;
    return { direction, difficulty, requirements };
  };
  const saveGenerationSpec = () => {
    const spec = currentGenerationSpec(false);
    try {
      sessionStorage.setItem(generationSpecKey, JSON.stringify(spec || {}));
    } catch {
      // Ignore storage failures in private browsing.
    }
  };
  const apiJson = async (path, options = {}) => {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-client-key": clientKey,
      ...(options.headers || {})
    };
    const response = await fetch(apiUrl(path), { cache: "no-store", ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  };
  const setPanelStatus = (node, message, tone = "idle") => {
    if (!node) return;
    node.textContent = message;
    node.dataset.state = tone;
    node.hidden = !message;
  };
  const setGenerationLiveStatus = (stateName = "idle", title = "准备就绪", detail = "填好方向、难度和 Token 后开始生成。") => {
    if (!generationLiveStatus) return;
    generationLiveStatus.dataset.state = stateName;
    if (generationLiveTitle) generationLiveTitle.textContent = title;
    if (generationLiveDetail) generationLiveDetail.textContent = detail;
  };
  const setAllText = (selector, value) => {
    root.querySelectorAll(selector).forEach((node) => node.replaceChildren(String(value)));
  };
  const setMode = (mode) => {
    state.mode = mode || "daily";
    modeButtons.forEach((button) => {
      const active = button.dataset.trainMode === state.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    renderQuestions();
  };
  const readFallbackProgress = (date) => {
    try {
      return JSON.parse(localStorage.getItem(`${fallbackProgressPrefix}${date}`) || "{}");
    } catch {
      return {};
    }
  };
  const writeFallbackProgress = () => {
    if (!state.date) return;
    localStorage.setItem(`${fallbackProgressPrefix}${state.date}`, JSON.stringify(state.progress));
  };
  const readFallbackInsights = () => {
    try {
      return JSON.parse(localStorage.getItem(fallbackInsightsKey) || "{}");
    } catch {
      return {};
    }
  };
  const writeFallbackInsight = (key, content) => {
    if (!key) return;
    const insights = readFallbackInsights();
    insights[key] = { content: String(content || ""), updatedAt: new Date().toISOString() };
    localStorage.setItem(fallbackInsightsKey, JSON.stringify(insights));
  };
  const newerInsight = (left, right) => {
    if (!left) return right || null;
    if (!right) return left;
    const leftTime = Date.parse(left.updatedAt || left.updated_at || "") || 0;
    const rightTime = Date.parse(right.updatedAt || right.updated_at || "") || 0;
    return rightTime >= leftTime ? right : left;
  };
  const mergeInsights = (serverInsights = {}) => {
    const merged = { ...serverInsights };
    const fallback = readFallbackInsights();
    Object.entries(fallback).forEach(([key, value]) => {
      merged[key] = newerInsight(merged[key], value);
    });
    return merged;
  };
  const readCheckins = () => {
    try {
      return JSON.parse(localStorage.getItem(checkinKey) || "{}");
    } catch {
      return {};
    }
  };
  const writeCheckins = (items) => localStorage.setItem(checkinKey, JSON.stringify(items || {}));
  const setupCheckinCalendarShell = () => {
    const card = root.querySelector(".train-checkin-card");
    if (!card) return;
    card.classList.add("meeting-card");
    card.querySelector(".train-calendar-weekdays")?.setAttribute("hidden", "");
    card.querySelector(".eyebrow")?.replaceChildren("\u7b7e\u5230\u8bb0\u5f55");
    const title = card.querySelector("[data-calendar-title]");
    if (title) title.innerHTML = "\u6bcf\u65e5<br>\u6253\u5361";
    const head = card.querySelector(".train-calendar-head");
    const streakNode = card.querySelector("[data-checkin-streak]");
    let weekSwitcher = card.querySelector("[data-week-switcher]");
    if (!weekSwitcher) {
      weekSwitcher = document.createElement("div");
      weekSwitcher.className = "week-switcher";
      weekSwitcher.dataset.weekSwitcher = "";
      weekSwitcher.setAttribute("aria-label", "\u6309\u5468\u5207\u6362\u6253\u5361\u8bb0\u5f55");
      weekSwitcher.innerHTML = '<button type="button" data-week-shift="-1" aria-label="\u4e0a\u4e00\u5468">\u2039</button><strong data-week-offset>0\u5468</strong><button type="button" data-week-shift="1" aria-label="\u4e0b\u4e00\u5468">\u203a</button>';
      if (streakNode) streakNode.replaceWith(weekSwitcher);
      else head?.appendChild(weekSwitcher);
    }
    const navs = [...card.querySelectorAll("[data-calendar-nav]")];
    let nav = navs[0] || null;
    navs.slice(1).forEach((node) => node.remove());
    if (!nav) {
      nav = document.createElement("div");
      nav.className = "date-selector train-calendar-nav";
      nav.dataset.calendarNav = "";
    }
    nav.innerHTML = '<button type="button" data-calendar-shift="-1" aria-label="\u4e0a\u4e00\u5468">\u2039</button><button type="button" data-calendar-current aria-label="\u56de\u5230\u672c\u5468"><span data-calendar-month-label>0\u5468</span></button><button type="button" data-calendar-shift="1" aria-label="\u4e0b\u4e00\u5468">\u203a</button>';
    if (head && nav.previousElementSibling !== head) head.insertAdjacentElement("afterend", nav);
    let meta = card.querySelector("[data-checkin-meta]");
    if (!meta) {
      meta = document.createElement("div");
      meta.className = "calls-info";
      meta.dataset.checkinMeta = "";
      meta.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.2 11.2 3.3 8.3l1-1 1.9 1.9 5.5-5.6 1 1z"></path></svg><span></span>';
    }
    if (nav && meta.previousElementSibling !== nav) nav.insertAdjacentElement("afterend", meta);
  };
  const shiftDateText = (dateText, offset) => {
    const [year, month, day] = String(dateText || todayText()).split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const shiftMonthText = (monthValue, offset) => {
    const [year, month] = String(monthValue || monthText()).split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  const weekStartText = (dateText) => {
    const [year, month, day] = String(dateText || todayText()).split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const shiftWeekText = (dateText, offset) => shiftDateText(dateText, Number(offset || 0) * 7);
  const weekOffsetLabel = (offset) => {
    const value = Number(offset || 0);
    return value === 0 ? "0\u5468" : `${value}\u5468`;
  };
  const weekRangeLabel = (start, end) => {
    const startMonth = Number(start.slice(5, 7));
    const startDay = Number(start.slice(8, 10));
    const endMonth = Number(end.slice(5, 7));
    const endDay = Number(end.slice(8, 10));
    return `${startMonth}/${startDay}-${endMonth}/${endDay}`;
  };
  const doneCount = () => Object.values(state.progress).filter((entry) => Boolean(entry?.completed)).length;
  const totalCount = () => state.questions.length || state.daily?.total || 50;
  const markerLabel = (markers = {}) => [
    Number(markers.starRating || 0) ? `${Number(markers.starRating || 0)} 星` : "",
    markers.isDifficult ? "需复盘" : "",
    markers.isCommon ? "高频" : "",
    markers.inCollection ? "收藏" : ""
  ].filter(Boolean).join(" · ") || "未标记";

  const updateTopStatus = () => {
    const done = doneCount();
    const total = totalCount();
    const percent = total ? Math.round((done / total) * 100) : 0;
    root.querySelector("[data-daily-progress]")?.style.setProperty("--daily-progress", `${percent}%`);
    root.querySelector("[data-daily-count]")?.replaceChildren(`${done}/${total}`);
    setAllText("[data-stat-weak]", state.questions.filter((item) => item.markers?.isDifficult).length);
    setAllText("[data-stat-mastered]", done);
    if (status) {
      const fallbackLine = state.daily?.fallback ? `今日题单未生成，正在使用 ${state.daily.date} 题单。` : "当前日期题单已加载。";
      status.innerHTML = `
        <strong>${escapeHtml(state.daily?.title || "每日 50 问")} · ${escapeHtml(state.date || todayText())}</strong>
        <span>${escapeHtml(formatSource(state.daily))} / ${escapeHtml(state.daily?.generationStatus || "unknown")} / ${escapeHtml(formatTime(state.daily?.source?.generatedAt))}</span>
        <span>${escapeHtml(fallbackLine)} 完成 ${done}/${total}。</span>
      `;
    }
  };

  const renderTopicTop = () => {
    if (!topicTop) return;
    const rows = state.questions
      .filter((item) => item.markers?.isDifficult || item.markers?.isCommon)
      .slice(0, 3);
    topicTop.innerHTML = rows.length
      ? rows.map((item) => `<li><span>${escapeHtml(item.category || item.tag || "面试题")}</span><strong>${escapeHtml(markerLabel(item.markers))}</strong></li>`).join("")
      : '<li><span>先标记几题</span><strong>0</strong></li>';
  };

  const renderCalendar = () => {
    if (!calendar) return;
    setupCheckinCalendarShell();
    const today = todayText();
    const currentMonth = monthText(today);
    const weekOffset = Math.min(0, Number(state.weekOffset || 0));
    state.weekOffset = weekOffset;
    const anchorDate = shiftWeekText(today, weekOffset);
    const weekStart = weekStartText(anchorDate);
    const weekEnd = shiftDateText(weekStart, 6);
    const base = monthText(weekStart);
    const requestedDate = state.requestedDate || state.date || today;
    const weekDates = Array.from({ length: 7 }, (_, index) => shiftDateText(weekStart, index));
    const activeDate = weekDates.includes(requestedDate) ? requestedDate : (weekOffset === 0 ? today : weekStart);
    const byDate = new Map(state.calendarItems.map((item) => [item.date, item]));
    const checkins = readCheckins();
    const checkedDates = new Set([
      ...state.calendarItems.filter((item) => item?.completed).map((item) => item.date),
      ...Object.keys(checkins).filter((date) => checkins[date]?.checked)
    ]);
    const streakForDate = (date) => {
      let streak = 0;
      let cursor = date;
      while (checkedDates.has(cursor) && streak < 730) {
        streak += 1;
        cursor = shiftDateText(cursor, -1);
      }
      return streak;
    };
    const todayChecked = checkedDates.has(today);
    const todayStreak = streakForDate(today);
    const weekCheckedCount = weekDates.filter((date) => checkedDates.has(date)).length;
    const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayItems = [];
    const dots = ['<div class="indicator-line"></div>'];
    weekDates.forEach((date, index) => {
      const day = Number(date.slice(-2));
      const inMonth = monthText(date) === base;
      const item = byDate.get(date);
      const completed = checkedDates.has(date);
      const failed = item?.generationStatus === "failed";
      const active = date === activeDate;
      const future = date > today;
      const classes = ["day-item", active ? "day-active" : "", completed ? "day-complete" : "", failed ? "day-failed" : "", !inMonth ? "day-muted" : "", future ? "day-future" : ""].filter(Boolean).join(" ");
      const label = completed ? String(streakForDate(date)) : failed ? "!" : "";
      dayItems.push(`<button type="button" class="${classes}" data-date="${escapeHtml(date)}" ${future ? "disabled" : ""} title="${escapeHtml(item?.title || date)}"><span class="day-number">${day}</span><span class="day-name">${weekdayNames[index]}</span><small>${escapeHtml(label)}</small></button>`);
      dots.push(`<div class="indicator-dot ${active ? "indicator-active" : ""} ${completed ? "indicator-complete" : ""}"></div>`);
    });
    calendar.innerHTML = `<div class="date-nav-and-indicators"><div class="date-nav-container">${dayItems.join("")}</div><div class="indicator-container">${dots.join("")}</div></div>`;
    root.querySelector("[data-calendar-title]") && (root.querySelector("[data-calendar-title]").innerHTML = "\u6bcf\u65e5<br>\u6253\u5361");
    root.querySelector("[data-calendar-month-label]")?.replaceChildren(`${weekOffsetLabel(weekOffset)} \u00b7 ${weekRangeLabel(weekStart, weekEnd)}`);
    root.querySelector("[data-week-offset]")?.replaceChildren(weekOffsetLabel(weekOffset));
    root.querySelector("[data-checkin-meta] span")?.replaceChildren(todayChecked ? `\u8fde\u7eed\u7b7e\u5230 ${todayStreak} \u5929 \u00b7 \u4eca\u65e5\u5df2\u6253\u5361` : `\u8fde\u7eed\u7b7e\u5230 ${todayStreak} \u5929 \u00b7 \u4eca\u65e5\u672a\u6253\u5361`);
    root.querySelector("[data-calendar-note]")?.replaceChildren(`${weekOffsetLabel(weekOffset)}打卡 ${weekCheckedCount} 天`);
    const checkinButton = root.querySelector("[data-checkin-button]");
    if (checkinButton) {
      checkinButton.textContent = todayChecked ? "\u4eca\u65e5\u5df2\u6253\u5361" : "\u4eca\u65e5\u6253\u5361";
      checkinButton.disabled = todayChecked;
      checkinButton.classList.toggle("is-checked", todayChecked);
    }
    root.querySelector("[data-calendar-current]")?.classList.toggle("is-current", weekOffset === 0);
    root.querySelectorAll("[data-calendar-shift], [data-week-shift]").forEach((button) => {
      const shift = Number(button.dataset.calendarShift || button.dataset.weekShift || 0);
      button.disabled = shift > 0 && weekOffset >= 0;
    });
  };

  const questionCard = (item) => {
    const key = questionKey(item);
    const markers = item.markers || {};
    const progress = Boolean(state.progress[key]?.completed);
    const insight = state.insights[key]?.content || "";
    const goalLabels = questionGoalLabels(item);
    const cardTheme = questionCardTheme(item);
    const knowledgeLabel = item.knowledgePoint || item.tag || "题单";
    const numberLabel = item.number ? String(item.number).padStart(2, "0") : "";
    const questionTitle = item.question || item.title || "未命名题目";
    const answerBlocks = [
      ["参考答案", item.answer ? [item.answer] : []],
      ["核心要点", Array.isArray(item.points) ? item.points : []],
      ["追问", Array.isArray(item.followUps) ? item.followUps : []],
      ["面试官看点", Array.isArray(item.interviewerFocus) ? item.interviewerFocus : []],
      ["表达模板", Array.isArray(item.speechTemplate) ? item.speechTemplate : []],
      ["常见错误", Array.isArray(item.commonMistakes) ? item.commonMistakes : []],
      ["项目追问", Array.isArray(item.projectPrompts) ? item.projectPrompts : []]
    ].filter(([, values]) => values.length);
    const stars = [1, 2, 3, 4, 5].map((value) => `<button type="button" class="${Number(markers.starRating || 0) >= value ? "active" : ""}" data-star="${value}" aria-label="${value} 星">${Number(markers.starRating || 0) >= value ? "★" : "☆"}</button>`).join("");
    return `
      <article class="interview-card train-question-card ${progress ? "is-complete" : ""}" data-question-id="${escapeHtml(key)}" ${cardTheme}>
        <div class="train-question-header">
          <label class="train-done-check"><input type="checkbox" data-progress-toggle ${progress ? "checked" : ""}><span>${progress ? "已完成" : "完成"}</span></label>
          <div class="interview-card-top" aria-label="目标分类">
            <span class="interview-badge">${escapeHtml(item.category || "面试")}</span>
            <span class="train-pill">${escapeHtml(knowledgeLabel)}</span>
            <span class="train-pill">${escapeHtml(item.difficulty || "训练")}</span>
            ${goalLabels.map((label) => `<span class="train-pill goal-pill">${escapeHtml(label)}</span>`).join("")}
          </div>
        </div>
        <div class="train-question-body">
          <div class="train-question-title-row">
            ${numberLabel ? `<span class="train-question-number">${escapeHtml(numberLabel)}</span>` : ""}
            <h2>${escapeHtml(questionTitle)}</h2>
          </div>
        </div>
        <div class="train-card-actions" aria-label="训练操作">
          <button type="button" class="train-primary" data-toggle-answer>查看答案</button>
          ${renderInterviewExampleButton(item)}
        </div>
        ${renderInterviewExample(item)}
        <section class="train-insight-box">
          <label><span>我的见解</span><textarea data-insight-input rows="3" maxlength="2000" placeholder="写自己的理解、项目例子、容易卡住的点。">${escapeHtml(insight)}</textarea></label>
          <small data-insight-status hidden></small>
        </section>
        <div class="train-answer" hidden>
          <div class="train-answer-head"><strong>答案抽屉</strong><span>${answerBlocks.length} 个训练区块</span></div>
          <div class="train-answer-grid">
            ${answerBlocks.map(([title, values]) => `
              <section>
                <h3>${escapeHtml(title)}</h3>
                ${values.length === 1 && title === "参考答案" ? `<p>${escapeHtml(values[0])}</p>` : `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`}
              </section>
            `).join("")}
          </div>
        </div>
      </article>
    `;
  };

  const questionGoalIds = (item) => Array.isArray(item.goalIds) ? item.goalIds.map(String) : [];
  const questionObjectGoalIds = (item) => Array.isArray(item.goals)
    ? item.goals.map((goal) => goal.id ?? goal.goalId ?? goal.goal_id).filter((id) => id !== undefined && id !== null && String(id) !== "").map(String)
    : [];
  const questionLinkedGoalIds = (item) => [...questionGoalIds(item), ...questionObjectGoalIds(item)];
  const safeGoalAccent = (value, fallback = "#e95f98") => {
    const color = String(value || "").trim();
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : fallback;
  };
  const questionGoalAccent = (item) => {
    const accent = questionLinkedGoalIds(item).map((id) => state.goalAccents?.get(String(id))).find(Boolean);
    return safeGoalAccent(accent || state.activeGoalAccent || "#e95f98");
  };
  const questionCardTheme = (item) => {
    const accent = questionGoalAccent(item);
    return `data-goal-accent="${escapeHtml(accent)}" style="--question-card-accent:${escapeHtml(accent)}"`;
  };
  const questionGoalLabels = (item) => {
    const fromIds = questionLinkedGoalIds(item).map((id) => state.goalLabels?.get(String(id))).filter(Boolean);
    const fromObject = Array.isArray(item.goals)
      ? item.goals.map((goal) => {
        const goalId = goal.id ?? goal.goalId ?? goal.goal_id;
        return (goalId !== undefined && goalId !== null ? state.goalLabels?.get(String(goalId)) : "") || goal.title || goal.slug;
      }).filter(Boolean)
      : [];
    const labels = [...new Set([...fromIds, ...fromObject])].slice(0, 4);
    if (labels.length) return labels;
    if (state.activeGoalTitle) return [state.activeGoalTitle];
    if (item.goalTitle || item.goal_title) return [item.goalTitle || item.goal_title];
    return ["未归类"];
  };
  const activeGoalIds = () => state.activeGoalDescendantIds?.length ? state.activeGoalDescendantIds.map(String) : [state.activeGoalId].filter(Boolean);
  const bankSelectedTags = () => Array.isArray(state.bank.selectedTags) ? state.bank.selectedTags.filter(Boolean) : [];
  const renderInterviewTagFilter = () => {
    if (!tagFilterPanel) return;
    const hasGoal = Boolean(state.activeGoalId);
    tagFilterPanel.hidden = !hasGoal;
    if (!hasGoal) return;
    const selected = new Set(bankSelectedTags());
    const tags = Array.isArray(state.bank.availableTags) ? state.bank.availableTags : [];
    if (tagFilterSummary) {
      const countText = state.bank.tagsLoading
        ? "标签加载中..."
        : tags.length
          ? `当前目标 ${tags.length} 个常用标签，多选后按同时满足筛选。`
          : "当前目标暂时没有可筛选标签。";
      tagFilterSummary.textContent = selected.size ? `已选：${[...selected].join(" + ")}` : countText;
    }
    if (tagFilterClear) tagFilterClear.hidden = selected.size === 0;
    if (!tagFilterList) return;
    if (state.bank.tagsLoading) {
      tagFilterList.innerHTML = '<span class="interview-tag-empty">同步标签中</span>';
      return;
    }
    if (!tags.length) {
      tagFilterList.innerHTML = '<span class="interview-tag-empty">暂无标签</span>';
      return;
    }
    tagFilterList.innerHTML = tags.map((item) => {
      const tag = item.tag || item.name || "";
      if (!tag) return "";
      const active = selected.has(tag);
      return `
        <button type="button" data-interview-tag="${escapeHtml(tag)}" class="${active ? "active" : ""}" aria-pressed="${active ? "true" : "false"}">
          <span>${escapeHtml(tag)}</span>
          <small>${escapeHtml(String(item.count || 0))}</small>
        </button>
      `;
    }).join("");
  };
  const loadInterviewTagsForActiveGoal = async () => {
    if (!tagFilterPanel || !state.activeGoalId) {
      state.bank.availableTags = [];
      renderInterviewTagFilter();
      return;
    }
    state.bank.tagsLoading = true;
    renderInterviewTagFilter();
    try {
      const goalIds = activeGoalIds();
      const query = new URLSearchParams({ limit: "48" });
      if (goalIds.length) query.set("goalIds", goalIds.join(","));
      const data = await apiJson(`/api/interview/tags?${query.toString()}`);
      state.bank.availableTags = Array.isArray(data.items) ? data.items : [];
    } catch {
      state.bank.availableTags = [];
    } finally {
      state.bank.tagsLoading = false;
      renderInterviewTagFilter();
    }
  };
  const visibleQuestions = () => {
    let rows = state.questions;
    if (state.activeGoalId) {
      const allowed = new Set(activeGoalIds());
      rows = rows.filter((item) => {
        const ids = questionGoalIds(item);
        if (state.activeGoalSlug === "other") return !ids.length || ids.some((id) => allowed.has(id));
        return ids.some((id) => allowed.has(id));
      });
    }
    if (state.mode === "mock") return rows.filter((item) => state.activeMockIds.includes(questionKey(item))).slice(0, 5);
    if (state.mode === "review") return rows.filter((item) => item.markers?.isDifficult || !state.progress[questionKey(item)]?.completed);
    return rows;
  };
  const isBankView = () => state.daily?.generationStatus === "bank" && state.activeGoalId;
  const renderBankPager = (position = "bottom") => {
    if (!isBankView()) return "";
    const limit = Number(state.bank.limit || 24);
    const total = Number(state.bank.total || state.daily?.total || 0);
    if (total <= limit) return "";
    const page = Math.max(1, Number(state.bank.page || 1));
    const pageCount = Math.max(1, Math.ceil(total / limit));
    const from = Math.min(total, ((page - 1) * limit) + 1);
    const to = Math.min(total, page * limit);
    return `
      <nav class="interview-bank-pager is-${escapeHtml(position)}" aria-label="题库分页">
        <button type="button" data-bank-page="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
        <span><strong>${escapeHtml(String(page))}</strong> / ${escapeHtml(String(pageCount))}</span>
        <small>${escapeHtml(String(from))}-${escapeHtml(String(to))} / ${escapeHtml(String(total))} 题</small>
        <button type="button" data-bank-page="next" ${page >= pageCount ? "disabled" : ""}>下一页</button>
      </nav>
    `;
  };
  const renderQuestions = () => {
    updateTopStatus();
    renderTopicTop();
    const rows = visibleQuestions();
    if (!rows.length) {
      const label = state.activeGoalTitle ? `“${escapeHtml(state.activeGoalTitle)}”下面暂时没有题` : "这里暂时没有题";
      list.innerHTML = `<div class="empty-state"><strong>${label}</strong><a href="#add-question">去 AI 出题</a></div>`;
      return;
    }
    const pagerTop = renderBankPager("top");
    const pagerBottom = renderBankPager("bottom");
    list.innerHTML = `${pagerTop}${rows.map(questionCard).join("")}${pagerBottom}`;
  };


  const generationStatusLabels = {
    pending: "待审",
    approved: "已通过",
    discarded: "已丢弃",
    answered: "已出答案",
    answers_generating: "出答案中",
    published: "已入库"
  };
  const generationActiveCandidates = () => {
    const candidates = Array.isArray(state.generation.batch?.candidates) ? state.generation.batch.candidates : [];
    return candidates.filter((item) => item.status !== "discarded");
  };
  const generationCandidateById = (id) => (state.generation.batch?.candidates || []).find((item) => String(item.id) === String(id));
  const generationCandidateNumber = (item = {}, index = 0) => {
    const fromPosition = Number(item.position || 0);
    if (Number.isFinite(fromPosition) && fromPosition > 0) return String(fromPosition);
    const fromKey = Number(String(item.questionKey || item.question_key || "").replace(/\D/g, ""));
    if (Number.isFinite(fromKey) && fromKey > 0) return String(fromKey);
    return String(index + 1);
  };
  const generationBusyTitle = (message = "") => {
    if (message.includes("补齐")) return "正在补齐候选题";
    if (message.includes("答案")) return "正在生成答案";
    if (message.includes("入库")) return "正在写入题库";
    if (message.includes("通过") || message.includes("丢弃") || message.includes("保存")) return "正在更新审核状态";
    return "正在生成候选题";
  };
  const generationLiveFromBatch = (batch, progress) => {
    if (state.generation.busy) {
      return ["loading", generationBusyTitle(state.generation.busyMessage), state.generation.busyMessage || "正在处理，请稍等。"];
    }
    if (!batch) {
      return state.activeGoalId
        ? ["ready", "准备生成候选题", `目标：${state.activeGoalTitle || "当前目标"}。方向和难度会一起进入内置提示词。`]
        : ["idle", "先选目标分类", "在右侧目标追踪选择方向，再填写具体范围和难度。"];
    }
    const target = Number(progress?.target || batch.targetCount || 50);
    const approved = Number(progress?.approvedCount || 0);
    const answered = Number(progress?.answeredCount || 0);
    const pending = Number(progress?.pendingCount || 0);
    const discarded = Number(progress?.discardedCount || 0);
    if (batch.status === "failed") return ["error", "生成失败", batch.error || "请检查 Token、方向描述或稍后重试。"];
    if (batch.status === "answers_generating") return ["loading", "正在分批生成答案", `已生成 ${answered}/${target}，每次只处理一小批，避免 504。`];
    if (batch.status === "published") return ["success", "已入库题库", `已入库 ${answered || target} 张训练卡片。`];
    if (progress?.canPublish || batch.status === "answered") return ["success", "答案已生成", `已生成答案 ${answered}/${target}，可以入库题库。`];
    if (progress?.canGenerateAnswers) return ["review", "50 题已通过", "现在可以生成答案，再入库题库。"];
    return ["review", "正在审核候选题", `已通过 ${approved}/${target} · 待审 ${pending} · 丢弃 ${discarded}`];
  };
  const generationPickNext = (fromId = "") => {
    const rows = generationActiveCandidates();
    if (!rows.length) return "";
    const startIndex = Math.max(0, rows.findIndex((item) => String(item.id) === String(fromId)));
    return String(rows.slice(startIndex + 1).find((item) => item.status === "pending")?.id || rows.find((item) => item.status === "pending")?.id || rows[Math.min(startIndex + 1, rows.length - 1)]?.id || rows[0].id);
  };
  const generationToken = () => {
    const token = currentToken();
    if (!token) {
      setPanelStatus(addQuestionStatus, "需要 Token 才能调用 AI 出题接口。", "error");
      state.generation.liveOverride = {
        stateName: "error",
        title: "缺少 Token",
        detail: "填入 Token 后才能调用 AI 出题接口。"
      };
      setGenerationLiveStatus(state.generation.liveOverride.stateName, state.generation.liveOverride.title, state.generation.liveOverride.detail);
      tokenInputs()[0]?.focus();
      return "";
    }
    syncTokenInputs(token);
    return token;
  };
  const renderGenerationGoal = () => {
    if (generationGoal) {
      generationGoal.textContent = state.activeGoalTitle ? `${state.activeGoalTitle} · ${state.activeGoalSlug || "goal"}` : "先选择出题目标";
    }
    if (generationGoalSelect) generationGoalSelect.value = state.activeGoalId || "";
    if (generationStart) generationStart.disabled = state.generation.busy || !state.activeGoalId;
  };
  const setGenerationBusy = (busy, message = "") => {
    state.generation.busy = Boolean(busy);
    state.generation.busyMessage = busy ? message : "";
    if (busy) state.generation.liveOverride = null;
    [generationStart, generationFill, generationApproveAll, generationAnswers, generationPublish].forEach((button) => {
      if (button) button.disabled = true;
    });
    if (message) setPanelStatus(addQuestionStatus, message, busy ? "loading" : "idle");
    renderGeneration();
  };
  const renderGeneration = () => {
    renderGenerationGoal();
    const batch = state.generation.batch;
    const progress = batch?.progress || { target: 50, approvedCount: 0, answeredCount: 0, discardedCount: 0, pendingCount: 0, canFill: false, canGenerateAnswers: false, canPublish: false };
    if (generationProgress) {
      generationProgress.innerHTML = `
        <span>${batch ? escapeHtml(generationStatusLabels[batch.status] || batch.status || "审核中") : "待生成"}</span>
        <strong>${Number(progress.approvedCount || 0)}/${Number(progress.target || 50)}</strong>
        <small>待审 ${Number(progress.pendingCount || 0)} · 丢弃 ${Number(progress.discardedCount || 0)} · 答案 ${Number(progress.answeredCount || 0)}</small>
      `;
    }
    if (generationStart) generationStart.disabled = state.generation.busy || !state.activeGoalId;
    const batchLocked = ["published", "failed"].includes(batch?.status || "");
    if (generationFill) generationFill.disabled = state.generation.busy || !batch || batchLocked || !progress.canFill;
    if (generationApproveAll) generationApproveAll.disabled = state.generation.busy || !batch || batchLocked || !Number(progress.pendingCount || 0);
    if (generationAnswers) generationAnswers.disabled = state.generation.busy || !batch || batchLocked || !progress.canGenerateAnswers;
    if (generationPublish) generationPublish.disabled = state.generation.busy || !batch || batchLocked || !progress.canPublish;
    const live = state.generation.liveOverride && !state.generation.busy
      ? [state.generation.liveOverride.stateName, state.generation.liveOverride.title, state.generation.liveOverride.detail]
      : generationLiveFromBatch(batch, progress);
    setGenerationLiveStatus(...live);
    if (!generationCandidates) return;
    if (!batch) {
      generationCandidates.innerHTML = '<div class="empty-state"><strong>选择目标后开始出题</strong><span>候选题会在这里逐题审核。</span></div>';
      return;
    }
    const candidates = Array.isArray(batch.candidates) ? batch.candidates : [];
    const activeRows = generationActiveCandidates();
    const activeIds = new Set(activeRows.map((item) => String(item.id)));
    if (!state.generation.activeCandidateId || !activeIds.has(String(state.generation.activeCandidateId))) {
      state.generation.activeCandidateId = String(activeRows.find((item) => item.status === "pending")?.id || activeRows[0]?.id || "");
    }
    const active = activeRows.find((item) => String(item.id) === String(state.generation.activeCandidateId)) || activeRows[0];
    if (!active) {
      generationCandidates.innerHTML = '<div class="empty-state"><strong>候选题已全部丢弃</strong><span>点击“补齐到 50”重新生成新的候选题。</span></div>';
      return;
    }
    const statusLabel = generationStatusLabels[active.status] || active.status || "待审";
    const currentChipRow = generationCandidates.querySelector(".generation-chip-row");
    const chipScroll = { top: currentChipRow?.scrollTop || 0, left: currentChipRow?.scrollLeft || 0 };
    const activeNumber = String(activeRows.indexOf(active) + 1);
    const chips = activeRows.map((item, index) => {
      const number = String(index + 1);
      const label = `第 ${number} 题`;
      return `<button type="button" class="generation-chip is-${escapeHtml(item.status || "pending")} ${String(item.id) === String(active.id) ? "is-active" : ""}" data-generation-pick="${escapeHtml(item.id)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span>${escapeHtml(number)}</span></button>`;
    }).join("");
    generationCandidates.innerHTML = `
      <div class="generation-chip-row" aria-label="候选题进度">${chips}</div>
      <article class="generation-candidate is-${escapeHtml(active.status || "pending")}" data-generation-candidate-id="${escapeHtml(active.id)}">
        <div class="generation-candidate-head">
          <span>#${escapeHtml(activeNumber)}</span>
          <strong>${escapeHtml(statusLabel)}</strong>
        </div>
        <label><span>题干</span><textarea data-candidate-question rows="4" maxlength="500">${escapeHtml(active.question || "")}</textarea></label>
        <div class="generation-fields">
          <label><span>分类</span><input data-candidate-category maxlength="80" value="${escapeHtml(active.category || "")}"></label>
          <label><span>知识点</span><input data-candidate-knowledge maxlength="100" value="${escapeHtml(active.knowledgePoint || "")}"></label>
          <label><span>难度</span><select data-candidate-difficulty>
            ${["基础", "进阶", "项目追问", "高频必会"].map((item) => `<option ${item === active.difficulty ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
          </select></label>
        </div>
        <label><span>标签</span><input data-candidate-tags maxlength="160" value="${escapeHtml((active.tags || []).join("、"))}"></label>
        <div class="generation-candidate-actions">
          <button type="button" class="train-primary" data-candidate-action="approve">通过</button>
          <button type="button" class="train-ghost" data-candidate-action="edit">保存编辑</button>
          <button type="button" class="train-ghost" data-candidate-action="discard">丢弃</button>
          <button type="button" class="train-ghost" data-candidate-action="pending">恢复待审</button>
          <button type="button" class="train-ghost" data-generation-next>下一题</button>
        </div>
      </article>
    `;
    const nextChipRow = generationCandidates.querySelector(".generation-chip-row");
    if (nextChipRow) {
      nextChipRow.scrollTop = chipScroll.top;
      nextChipRow.scrollLeft = chipScroll.left;
    }
  };
  const updateGenerationBatch = (batch, nextCandidateId = "") => {
    state.generation.batch = batch?.id ? batch : null;
    state.generation.liveOverride = null;
    try {
      if (batch?.id && batch.status !== "published") sessionStorage.setItem(generationBatchKey, String(batch.id));
      if (batch?.status === "published") sessionStorage.removeItem(generationBatchKey);
    } catch {}
    if (nextCandidateId) state.generation.activeCandidateId = String(nextCandidateId);
    else if (!generationCandidateById(state.generation.activeCandidateId)) state.generation.activeCandidateId = "";
    renderGeneration();
  };
  const generationCandidatePayload = (card, action) => ({
    action,
    question: card?.querySelector("[data-candidate-question]")?.value || "",
    category: card?.querySelector("[data-candidate-category]")?.value || "",
    knowledgePoint: card?.querySelector("[data-candidate-knowledge]")?.value || "",
    difficulty: card?.querySelector("[data-candidate-difficulty]")?.value || "",
    tags: card?.querySelector("[data-candidate-tags]")?.value || "",
    goalSlug: state.activeGoalSlug || state.generation.batch?.goalSlug || ""
  });
  const generationRequest = async (path, options = {}) => {
    const token = generationToken();
    if (!token) throw new Error("token_required");
    return apiJson(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
  };
  const fillGenerationToTarget = async (seedBatch, spec, messagePrefix = "正在补齐候选题") => {
    let batch = seedBatch?.id ? seedBatch : state.generation.batch;
    if (!batch?.id) return batch;
    let guard = 0;
    let stalled = 0;
    while (batch?.progress?.canFill && guard < 10) {
      const progress = batch.progress || {};
      const active = Number(progress.activeCount || 0);
      const target = Number(progress.target || batch.targetCount || 50);
      setGenerationBusy(true, `${messagePrefix} ${active}/${target}...`);
      batch = await generationRequest(`/api/interview/generation-batches/${encodeURIComponent(batch.id)}/fill`, {
        method: "POST",
        body: JSON.stringify({ requirements: spec.requirements, difficulty: spec.difficulty, provider: "deepseek", limit: 10 })
      });
      updateGenerationBatch(batch);
      const nextActive = Number(batch?.progress?.activeCount || 0);
      stalled = nextActive > active ? 0 : stalled + 1;
      if (stalled >= 2) break;
      guard += 1;
    }
    const done = Number(batch?.progress?.activeCount || 0);
    const target = Number(batch?.progress?.target || batch?.targetCount || 50);
    if (done < target) {
      throw new Error(`候选题只补到 ${done}/${target}，请继续补齐或把方向写得更具体。`);
    }
    return batch;
  };
  const restoreLatestGenerationBatch = async () => {
    const token = currentToken();
    if (!token || state.generation.batch) return;
    try {
      const savedId = sessionStorage.getItem(generationBatchKey) || "";
      const path = savedId
        ? `/api/interview/generation-batches/${encodeURIComponent(savedId)}`
        : `/api/interview/generation-batches/latest?date=${encodeURIComponent(todayText())}`;
      const batch = await apiJson(path, { headers: { Authorization: `Bearer ${token}` } });
      if (batch?.id) {
        if (["published", "failed"].includes(batch.status || "")) {
          try { sessionStorage.removeItem(generationBatchKey); } catch {}
          return;
        }
        updateGenerationBatch(batch);
        setPanelStatus(addQuestionStatus, "已恢复最近未入库的出题批次。", "success");
      }
    } catch {
      try { sessionStorage.removeItem(generationBatchKey); } catch {}
    }
  };

  const loadCalendar = async (date = state.date || todayText()) => {
    const weekStart = weekStartText(date || shiftWeekText(todayText(), state.weekOffset || 0));
    const weekEnd = shiftDateText(weekStart, 6);
    const months = [...new Set([monthText(weekStart), monthText(weekEnd)])];
    state.month = months[0];
    try {
      const results = await Promise.all(months.map((month) => apiJson(`/api/interview/calendar?month=${encodeURIComponent(month)}`).catch(() => ({ items: [] }))));
      const merged = new Map();
      results.forEach((data) => {
        (Array.isArray(data.items) ? data.items : []).forEach((item) => {
          if (item?.date) merged.set(item.date, item);
        });
      });
      state.calendarItems = [...merged.values()];
    } catch (error) {
      state.calendarItems = [];
    }
    renderCalendar();
  };

  const loadProgress = async (date) => {
    try {
      const data = await apiJson(`/api/interview/progress?date=${encodeURIComponent(date)}`);
      state.progress = data.progress || {};
    } catch (error) {
      state.progress = readFallbackProgress(date);
      interviewDevToast("进度接口暂不可用，已使用本地缓存", "warning");
    }
  };

  const loadInsights = async (date) => {
    const keys = state.questions.map((item) => questionKey(item)).filter(Boolean).slice(0, 80);
    const query = new URLSearchParams({ date });
    if (keys.length) query.set("keys", keys.join(","));
    try {
      const data = await apiJson(`/api/interview/insights?${query.toString()}`);
      state.insights = data.insights || {};
    } catch (error) {
      state.insights = mergeInsights({});
    }
  };

  const loadDay = async (date = todayText()) => {
    state.bank = { ...state.bank, page: 1, total: 0, hasMore: false };
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    if (status) status.innerHTML = "<strong>正在加载题单...</strong><span>题目、进度和我的见解会一起刷新。</span>";
    try {
      const daily = await apiJson(`/api/interview/daily${query}`);
      state.daily = daily;
      state.date = daily.date || date;
      state.requestedDate = daily.requestedDate || date;
      state.questions = Array.isArray(daily.questions) && daily.questions.length ? daily.questions : fallbackQuestions;
    } catch (error) {
      state.daily = { date, requestedDate: date, title: "本地预览题单", total: fallbackQuestions.length, source: { provider: "local", model: "preview" }, generationStatus: "local-preview" };
      state.date = date;
      state.requestedDate = date;
      state.questions = fallbackQuestions;
      interviewDevToast(interviewConsoleMessage(error?.message, "服务器题单暂不可用，已进入本地题模式"), "warning");
    }
    await Promise.all([loadProgress(state.date), loadInsights(state.date), loadCalendar(state.requestedDate || state.date)]);
    renderQuestions();
  };

  const bankQuestionCardItem = (item, index = 0) => {
    const answerPoints = item.answerPoints || item.answer_points || {};
    const tags = Array.isArray(item.tags)
      ? item.tags
      : String(item.tags || "").split(/[、,\s]+/).map((tag) => tag.trim()).filter(Boolean);
    return {
      ...item,
      questionId: item.slug || item.id,
      questionKey: item.slug || String(item.id || ""),
      number: index + 1,
      category: item.topicTitle || item.topicSlug || "题库",
      tag: tags[0] || item.topicTitle || "题库",
      knowledgePoint: tags[0] || item.topicTitle || item.topicSlug || "题库",
      question: item.title || item.question || "",
      answer: item.answer_md || item.answer || "",
      points: item.points || answerPoints.points || [],
      followUps: item.followUps || answerPoints.followUps || [],
      interviewerFocus: item.interviewerFocus || answerPoints.interviewerFocus || [],
      speechTemplate: item.speechTemplate || answerPoints.speechTemplate || [],
      commonMistakes: item.commonMistakes || answerPoints.commonMistakes || [],
      projectPrompts: item.projectPrompts || answerPoints.projectPrompts || [],
      exampleCase: item.exampleCase ?? item.example_case ?? null,
      exampleCaseReady: Boolean(item.exampleCaseReady || item.example_case_ready || item.exampleCase || item.example_case),
      detailReady: Boolean(item.detailReady || item.answer_md || item.answer || item.answerPoints || item.answer_points || item.exampleCase || item.example_case),
      markers: item.markers || {}
    };
  };

  const questionDetailLookupKey = (item = {}) => String(item.id || item.slug || item.questionId || item.questionKey || "").trim();
  const questionFallbackFromCard = (card) => {
    const key = String(card?.dataset?.questionId || "").trim();
    return {
      id: key,
      slug: key,
      questionId: key,
      questionKey: key,
      question: card?.querySelector("h2")?.textContent?.trim() || ""
    };
  };
  const normalizeQuestionDetailForCard = (base = {}, detail = {}) => {
    const position = Math.max(1, Number(base.number || detail.number || 1));
    const normalized = bankQuestionCardItem({ ...base, ...detail, markers: base.markers || detail.markers || {} }, position - 1);
    normalized.number = position;
    normalized.detailReady = true;
    return normalized;
  };
  const cacheQuestionDetail = (item = {}) => {
    [item.id, item.slug, item.questionId, item.questionKey].filter(Boolean).forEach((key) => {
      state.bank.detailCache.set(String(key), item);
    });
  };
  const ensureQuestionDetail = async (item = {}, need = "any") => {
    const hasAnswer = Boolean(item.answer);
    const hasExample = Boolean(normalizeBackendInterviewExampleCase(item));
    if (item.detailReady && (need === "answer" ? hasAnswer : need === "example" ? hasExample : (hasAnswer || hasExample))) return item;
    const lookupKey = questionDetailLookupKey(item);
    if (!lookupKey) throw new Error("question_detail_key_missing");
    const cached = state.bank.detailCache.get(lookupKey);
    if (cached) {
      const cachedHasAnswer = Boolean(cached.answer);
      const cachedHasExample = Boolean(normalizeBackendInterviewExampleCase(cached));
      if (need === "answer" ? cachedHasAnswer : need === "example" ? cachedHasExample : (cachedHasAnswer || cachedHasExample)) return cached;
    }
    const detail = await apiJson(`/api/interview/questions/${encodeURIComponent(lookupKey)}`);
    const normalized = normalizeQuestionDetailForCard(item, detail);
    const index = state.questions.findIndex((entry) => questionKey(entry) === questionKey(item));
    if (index >= 0) state.questions[index] = normalized;
    cacheQuestionDetail(normalized);
    return normalized;
  };
  const replaceQuestionCardNode = (card, item, openType = "") => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = questionCard(item).trim();
    const nextCard = wrapper.firstElementChild;
    if (!nextCard) return card;
    card.replaceWith(nextCard);
    if (openType === "answer") {
      nextCard.querySelector(".train-answer")?.removeAttribute("hidden");
      const button = nextCard.querySelector("[data-toggle-answer]");
      if (button) button.textContent = "收起答案";
    }
    if (openType === "example") {
      nextCard.querySelector(".train-example")?.removeAttribute("hidden");
      const button = nextCard.querySelector("[data-card-example]");
      if (button) button.textContent = "收起实例";
    }
    return nextCard;
  };

  const loadQuestionBankForActiveGoal = async (page = state.bank.page || 1) => {
    if (!state.activeGoalId) return loadDay(todayText());
    const goalIds = activeGoalIds();
    const limit = Number(state.bank.limit || 24);
    const safePage = Math.max(1, Number(page) || 1);
    const selectedTags = bankSelectedTags();
    const query = new URLSearchParams({ limit: String(limit), page: String(safePage), order: "mixed", compact: "1" });
    if (goalIds.length) query.set("goalIds", goalIds.join(","));
    if (selectedTags.length) query.set("tags", selectedTags.join(","));
    const tagText = selectedTags.length ? `，标签：${selectedTags.join(" + ")}` : "";
    if (status) status.innerHTML = `<strong>正在加载题库...</strong><span>${escapeHtml(state.activeGoalTitle || "当前目标")}${escapeHtml(tagText)} 的题库会直接显示在这里。</span>`;
    try {
      const data = await apiJson(`/api/interview/questions?${query.toString()}`);
      const items = Array.isArray(data.items) ? data.items : [];
      const total = Number(data.total || items.length || 0);
      const currentPage = Math.max(1, Number(data.page || safePage));
      state.bank = {
        ...state.bank,
        page: currentPage,
        limit: Number(data.limit || limit),
        total,
        hasMore: Boolean(data.hasMore)
      };
      state.daily = {
        date: todayText(),
        requestedDate: todayText(),
        title: `${state.activeGoalTitle || "目标"}题库`,
        subtitle: "从题库读取，不依赖今日题单。",
        total,
        source: { provider: "question-bank", model: state.activeGoalSlug || "goal" },
        generationStatus: "bank"
      };
      state.date = state.daily.date;
      state.requestedDate = state.daily.requestedDate;
      const offset = Number(data.offset || ((currentPage - 1) * state.bank.limit));
      state.questions = items.map((item, index) => bankQuestionCardItem(item, offset + index));
      await Promise.all([loadProgress(state.date), loadInsights(state.date), loadCalendar(state.requestedDate || state.date)]);
      renderQuestions();
      if (status) status.innerHTML = `<strong>${escapeHtml(state.activeGoalTitle || "当前目标")}题库</strong><span>第 ${state.bank.page} 页，显示 ${items.length} / ${total} 道题${escapeHtml(tagText)}。</span>`;
    } catch (error) {
      interviewDevToast(interviewConsoleMessage(error?.message, "题库加载失败"), "warning");
      renderQuestions();
    }
  };

  const saveProgress = async (key, completed) => {
    state.progress[key] = { completed, updatedAt: new Date().toISOString() };
    writeFallbackProgress();
    renderQuestions();
    try {
      await apiJson("/api/interview/progress", { method: "PUT", body: JSON.stringify({ date: state.date, questionKey: key, completed }) });
      await loadCalendar(state.requestedDate || state.date);
      root.dispatchEvent(new CustomEvent("interview:plan-refresh"));
    } catch (error) {
      interviewDevToast("进度保存失败，已先保存在本地", "warning");
    }
  };

  const saveInsight = async (key, content, card) => {
    const statusNode = card?.querySelector("[data-insight-status]");
    if (statusNode) statusNode.textContent = "保存中";
    state.insights[key] = { content, updatedAt: new Date().toISOString() };
    writeFallbackInsight(key, content);
    try {
      await apiJson("/api/interview/insights", { method: "PUT", body: JSON.stringify({ date: state.date, questionKey: key, content }) });
      state.insights[key] = { content, updatedAt: new Date().toISOString() };
      if (statusNode) statusNode.textContent = "已保存";
    } catch (error) {
      if (statusNode) statusNode.textContent = "保存失败";
    }
  };

  const saveMarkers = async (key, markers, card) => {
    const token = currentToken();
    const statusNode = card?.querySelector("[data-marker-status]");
    if (!token) {
      if (statusNode) statusNode.textContent = "需要生成 Token";
      interviewDevToast("公共标记需要生成 Token", "warning");
      tokenInputs()[0]?.focus();
      return;
    }
    if (statusNode) statusNode.textContent = "保存中";
    state.markerSaving[key] = "保存中";
    try {
      const data = await apiJson("/api/interview/question-markers", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ questionKey: key, ...markers })
      });
      const item = state.questions.find((entry) => questionKey(entry) === key);
      if (item) item.markers = data.markers || markers;
      state.markerSaving[key] = "已保存";
      renderQuestions();
      root.dispatchEvent(new CustomEvent("interview:plan-refresh"));
    } catch (error) {
      state.markerSaving[key] = "保存失败";
      if (statusNode) statusNode.textContent = "保存失败";
      interviewDevToast(interviewConsoleMessage(error?.message, "标记保存失败"), "danger");
    }
  };

  tagFilterList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-interview-tag]");
    if (!button) return;
    const tag = button.dataset.interviewTag || "";
    if (!tag) return;
    const selected = new Set(bankSelectedTags());
    if (selected.has(tag)) selected.delete(tag);
    else selected.add(tag);
    state.bank = { ...state.bank, selectedTags: [...selected], page: 1 };
    renderInterviewTagFilter();
    loadQuestionBankForActiveGoal(1);
  });

  tagFilterClear?.addEventListener("click", () => {
    if (!bankSelectedTags().length) return;
    state.bank = { ...state.bank, selectedTags: [], page: 1 };
    renderInterviewTagFilter();
    loadQuestionBankForActiveGoal(1);
  });

  list.addEventListener("click", async (event) => {
    const pagerButton = event.target.closest("[data-bank-page]");
    if (pagerButton) {
      const pageCount = Math.max(1, Math.ceil(Number(state.bank.total || 0) / Number(state.bank.limit || 24)));
      const nextPage = pagerButton.dataset.bankPage === "next"
        ? Math.min(pageCount, Number(state.bank.page || 1) + 1)
        : Math.max(1, Number(state.bank.page || 1) - 1);
      if (nextPage !== Number(state.bank.page || 1)) loadQuestionBankForActiveGoal(nextPage);
      return;
    }
    const card = event.target.closest("[data-question-id]");
    if (!card) return;
    const key = card.dataset.questionId;
    const item = state.questions.find((entry) => questionKey(entry) === key) || questionFallbackFromCard(card);
    if (event.target.closest("[data-toggle-answer]")) {
      const answer = card.querySelector(".train-answer");
      const button = event.target.closest("[data-toggle-answer]");
      const hidden = answer?.hasAttribute("hidden");
      if (hidden) {
        if (!item.answer) {
          button.disabled = true;
          button.textContent = "加载中";
          try {
            const detail = await ensureQuestionDetail(item, "answer");
            replaceQuestionCardNode(card, detail, "answer");
          } catch {
            button.disabled = false;
            button.textContent = "查看答案";
            interviewDevToast("答案详情加载失败，请稍后再试", "warning");
          }
          return;
        }
        answer.removeAttribute("hidden");
        button.textContent = "收起答案";
      } else {
        answer.setAttribute("hidden", "");
        button.textContent = "查看答案";
      }
      return;
    }
    if (event.target.closest("[data-card-example]")) {
      const example = card.querySelector(".train-example");
      const button = event.target.closest("[data-card-example]");
      const hidden = !example || example.hasAttribute("hidden");
      if (hidden) {
        if (!normalizeBackendInterviewExampleCase(item)) {
          button.disabled = true;
          button.textContent = "加载中";
          try {
            const detail = await ensureQuestionDetail(item, "example");
            if (normalizeBackendInterviewExampleCase(detail)) {
              replaceQuestionCardNode(card, detail, "example");
            } else {
              replaceQuestionCardNode(card, detail, "");
              interviewDevToast("这道题的实例还在生成中", "warning");
            }
          } catch {
            button.disabled = false;
            button.textContent = "实例";
            interviewDevToast("实例详情加载失败，请稍后再试", "warning");
          }
          return;
        }
        example.removeAttribute("hidden");
        button.textContent = "收起实例";
      } else {
        example?.setAttribute("hidden", "");
        button.textContent = "实例";
      }
      return;
    }
    if (event.target.closest("[data-progress-toggle]")) {
      saveProgress(key, event.target.checked);
      return;
    }
    if (event.target.closest("[data-mark-difficult]")) {
      const markers = { ...(item.markers || {}), isDifficult: !item.markers?.isDifficult };
      saveMarkers(key, markers, card);
      return;
    }
    const star = event.target.closest("[data-star]");
    if (star) {
      const current = Number(item.markers?.starRating || 0);
      const next = Number(star.dataset.star || 0);
      const markers = { ...(item.markers || {}), starRating: current === next ? 0 : next };
      saveMarkers(key, markers, card);
      return;
    }
    const toggle = event.target.closest("[data-marker-toggle]");
    if (toggle) {
      const field = toggle.dataset.markerToggle;
      const markers = { ...(item.markers || {}), [field]: !item.markers?.[field] };
      saveMarkers(key, markers, card);
    }
  });

  list.addEventListener("input", (event) => {
    const input = event.target.closest("[data-insight-input]");
    if (!input) return;
    const card = input.closest("[data-question-id]");
    const key = card?.dataset.questionId;
    if (!key) return;
    card.querySelector("[data-insight-status]").textContent = "输入中";
    state.insights[key] = { content: input.value, updatedAt: new Date().toISOString() };
    writeFallbackInsight(key, input.value);
    window.clearTimeout(state.insightTimers.get(key));
    state.insightTimers.set(key, window.setTimeout(() => saveInsight(key, input.value, card), 600));
  });

  root.querySelector(".train-checkin-card")?.addEventListener("click", (event) => {
    const shiftButton = event.target.closest("[data-calendar-shift], [data-week-shift]");
    if (shiftButton && !shiftButton.disabled) {
      const shift = Number(shiftButton.dataset.calendarShift || shiftButton.dataset.weekShift || 0);
      state.weekOffset = Math.min(0, Number(state.weekOffset || 0) + shift);
      loadCalendar(weekStartText(shiftWeekText(todayText(), state.weekOffset)));
      return;
    }
    if (event.target.closest("[data-calendar-current]")) {
      state.weekOffset = 0;
      loadCalendar(todayText());
    }
  });
  calendar?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-date]");
    if (!button || button.disabled) return;
    loadDay(button.dataset.date);
  });
  root.querySelector("[data-checkin-button]")?.addEventListener("click", () => {
    const today = todayText();
    const checkins = readCheckins();
    if (!checkins[today]?.checked) {
      checkins[today] = { checked: true, checkedAt: new Date().toISOString() };
      writeCheckins(checkins);
      renderCalendar();
      interviewDevToast("今日已打卡", "success");
    }
  });

  modeButtons.forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.trainMode === "mock") {
      state.activeMockIds = state.questions.filter((item) => !state.progress[questionKey(item)]?.completed).slice(0, 5).map(questionKey);
      if (!state.activeMockIds.length) state.activeMockIds = state.questions.slice(0, 5).map(questionKey);
      const rounds = Number(root.querySelector("[data-stat-rounds]")?.textContent || 0) + 1;
      setAllText("[data-stat-rounds]", rounds);
    }
    setMode(button.dataset.trainMode);
  }));
  root.querySelector("[data-start-mock]")?.addEventListener("click", () => modeButtons.find((button) => button.dataset.trainMode === "mock")?.click());
  root.querySelector("[data-review-weak]")?.addEventListener("click", () => setMode("review"));
  root.querySelector("[data-show-tip]")?.addEventListener("click", () => interviewDevToast("手机端先看工具区，再刷题；PC 右侧工具栏会固定。", "info"));
  root.querySelector("[data-scroll-add-question]")?.addEventListener("click", () => {
    if (addQuestionPanel?.tagName === "DETAILS") addQuestionPanel.open = true;
    addQuestionPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    generationStart?.focus({ preventScroll: true });
  });
  root.addEventListener("interview:plan-loaded", (event) => {
    const flat = Array.isArray(event.detail?.flat) ? event.detail.flat : [];
    const byId = new Map(flat
      .filter((goal) => goal?.id !== undefined && goal?.id !== null)
      .map((goal) => [String(goal.id), goal]));
    const parentIdOf = (goal) => goal?.parentId ?? goal?.parent_id ?? goal?.parent?.id ?? "";
    const hasParentId = (id) => id !== undefined && id !== null && String(id) !== "";
    const titleOf = (goal) => goal?.title || goal?.slug || "";
    const topGoalNode = (goal) => {
      let node = goal;
      let parentId = parentIdOf(node);
      let guard = 0;
      while (hasParentId(parentId) && byId.has(String(parentId)) && guard < 24) {
        const parent = byId.get(String(parentId));
        const grandParentId = parentIdOf(parent);
        if (!hasParentId(grandParentId) || !byId.has(String(grandParentId))) break;
        node = parent;
        parentId = grandParentId;
        guard += 1;
      }
      return node;
    };
    state.goalLabels = new Map([...byId.values()].map((goal) => [String(goal.id), titleOf(topGoalNode(goal))]));
    state.goalAccents = new Map([...byId.values()].map((goal) => [String(goal.id), safeGoalAccent(topGoalNode(goal)?.accent)]));
    if (generationGoalSelect) {
      const childrenByParent = new Map();
      [...byId.values()].forEach((goal) => {
        const parentId = String(parentIdOf(goal) || "");
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(goal);
      });
      const descendantIdsOf = (id) => [String(id), ...(childrenByParent.get(String(id)) || []).flatMap((child) => descendantIdsOf(child.id))].filter(Boolean);
      const pathOf = (goal) => {
        const parts = [];
        let node = goal;
        let guard = 0;
        while (node && guard < 24) {
          parts.unshift(titleOf(node));
          const parentId = parentIdOf(node);
          node = hasParentId(parentId) ? byId.get(String(parentId)) : null;
          guard += 1;
        }
        if (parts[0] === "机器人") parts.shift();
        return parts.filter(Boolean).join(" / ") || titleOf(goal);
      };
      const allGoals = [...byId.values()].filter((goal) => titleOf(goal) && String(goal.slug || "").toLowerCase() !== "other" && !["其他", "其它"].includes(titleOf(goal)));
      const selectableGoals = allGoals.filter((goal) => {
        const title = titleOf(goal);
        const slug = String(goal.slug || "").toLowerCase();
        const noParent = !hasParentId(parentIdOf(goal));
        return !(noParent && (title === "机器人" || slug === "robot" || slug === "robotics"));
      });
      const options = (selectableGoals.length ? selectableGoals : allGoals).map((goal) => (
        `<option value="${escapeHtml(goal.id)}">${escapeHtml(pathOf(goal))}</option>`
      )).join("");
      generationGoalSelect.innerHTML = `<option value="">选择目标分类</option>${options}`;
      generationGoalSelect.value = state.activeGoalId || "";
      generationGoalSelect.onchange = () => {
        const goal = byId.get(String(generationGoalSelect.value || ""));
        if (!goal) {
          root.dispatchEvent(new CustomEvent("interview:goal-select", { detail: { goalId: "", slug: "", title: "", accent: "", descendantIds: [] } }));
          return;
        }
        const topGoal = topGoalNode(goal);
        root.dispatchEvent(new CustomEvent("interview:goal-select", {
          detail: {
            goalId: String(goal.id),
            slug: goal.slug || "",
            title: titleOf(goal),
            accent: topGoal?.accent || goal.accent || "",
            descendantIds: descendantIdsOf(goal.id)
          }
        }));
      };
    }
    renderQuestions();
    renderGenerationGoal();
  });
  root.addEventListener("interview:goal-select", async (event) => {
    state.activeGoalId = event.detail?.goalId || "";
    state.activeGoalSlug = event.detail?.slug || "";
    state.activeGoalTitle = event.detail?.title || "";
    state.activeGoalAccent = safeGoalAccent(event.detail?.accent || state.goalAccents?.get(String(state.activeGoalId)) || "#e95f98");
    state.activeGoalDescendantIds = Array.isArray(event.detail?.descendantIds) ? event.detail.descendantIds.map(String) : [];
    state.bank = { ...state.bank, page: 1, total: 0, hasMore: false, selectedTags: [], availableTags: [], tagsLoading: false };
    renderInterviewTagFilter();
    renderQuestions();
    renderGenerationGoal();
    if (status) {
      const target = state.activeGoalTitle ? `当前筛选：${state.activeGoalTitle}` : "未选择出题目标";
      const node = document.createElement("span");
      node.textContent = target;
      status.append(node);
    }
    await Promise.all([loadInterviewTagsForActiveGoal(), loadQuestionBankForActiveGoal()]);
  });
  tokenInputs().forEach((input) => {
    input.value = sessionStorage.getItem(tokenKey) || "";
    input.addEventListener("input", () => syncTokenInputs(input.value.trim()));
  });
  try {
    const savedSpec = JSON.parse(sessionStorage.getItem(generationSpecKey) || "{}");
    if (generationRequirements && savedSpec.direction) generationRequirements.value = savedSpec.direction;
    if (generationDifficulty && savedSpec.difficulty) generationDifficulty.value = savedSpec.difficulty;
  } catch {
    // Ignore invalid cached generation parameters.
  }
  generationRequirements?.addEventListener("input", saveGenerationSpec);
  generationDifficulty?.addEventListener("change", saveGenerationSpec);
  renderGeneration();

  if (window.matchMedia("(max-width: 1100px)").matches) {
    if (addQuestionPanel?.tagName === "DETAILS") addQuestionPanel.open = false;
    if (tomorrowPanel?.tagName === "DETAILS") tomorrowPanel.open = false;
  }

  tomorrowForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(tomorrowForm);
    const topic = String(formData.get("topic") || "").trim();
    const force = Boolean(formData.get("force"));
    const message = force
      ? "确认强制覆盖今天题单？旧题单会被新题单替换。"
      : `确认生成今天 50 问？${topic ? `\n要求：${topic}` : ""}`;
    if (!window.confirm(message)) {
      setPanelStatus(tomorrowStatus, "已取消生成。", "idle");
      return;
    }
    setPanelStatus(tomorrowStatus, "正在生成今天题单...", "loading");
    if (tomorrowSubmit) tomorrowSubmit.disabled = true;
    try {
      const data = await apiJson("/api/interview/generate", {
        method: "POST",
        body: JSON.stringify({ date: todayText(), topic, requirements: topic, force, provider: "deepseek", confirm: true })
      });
      setPanelStatus(tomorrowStatus, data.skipped ? "今天已有题单，未覆盖" : "今天题单已生成", "success");
      root.dispatchEvent(new CustomEvent("interview:plan-refresh"));
    } catch (error) {
      setPanelStatus(tomorrowStatus, interviewConsoleMessage(error?.message, "生成失败"), "error");
    } finally {
      if (tomorrowSubmit) tomorrowSubmit.disabled = false;
    }
  });
  generationStart?.addEventListener("click", async () => {
    if (!state.activeGoalId) {
      setPanelStatus(addQuestionStatus, "请先在出题工作台选择一个目标。", "error");
      return;
    }
    const spec = currentGenerationSpec(true);
    if (!spec) return;
    saveGenerationSpec();
    try {
      setGenerationBusy(true, `正在生成候选题 0/50 · ${state.activeGoalTitle || "当前目标"} · ${spec.difficulty}...`);
      let batch = await generationRequest("/api/interview/generation-batches", {
        method: "POST",
        body: JSON.stringify({ date: todayText(), goalId: state.activeGoalId, requirements: spec.requirements, difficulty: spec.difficulty, provider: "deepseek" })
      });
      updateGenerationBatch(batch);
      batch = await fillGenerationToTarget(batch, spec, "正在生成候选题");
      updateGenerationBatch(batch);
      setPanelStatus(addQuestionStatus, "50 个候选题已生成，开始逐题审核。", "success");
    } catch (error) {
      if (error?.message !== "token_required") {
        const message = interviewConsoleMessage(error?.message, "候选题生成失败");
        setPanelStatus(addQuestionStatus, message, "error");
        state.generation.liveOverride = { stateName: "error", title: "候选题生成失败", detail: message };
      }
    } finally {
      state.generation.busy = false;
      renderGeneration();
    }
  });

  generationCandidates?.addEventListener("click", async (event) => {
    const pick = event.target.closest("[data-generation-pick]");
    if (pick) {
      state.generation.activeCandidateId = String(pick.dataset.generationPick || "");
      renderGeneration();
      return;
    }
    const card = event.target.closest("[data-generation-candidate-id]");
    if (!card) return;
    if (event.target.closest("[data-generation-next]")) {
      state.generation.activeCandidateId = generationPickNext(card.dataset.generationCandidateId);
      renderGeneration();
      return;
    }
    const actionButton = event.target.closest("[data-candidate-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.candidateAction || "edit";
    try {
      setGenerationBusy(true, action === "approve" ? "正在通过当前题..." : action === "discard" ? "正在丢弃当前题..." : "正在保存当前题...");
      const batch = await generationRequest(`/api/interview/generation-candidates/${encodeURIComponent(card.dataset.generationCandidateId)}`, {
        method: "PATCH",
        body: JSON.stringify(generationCandidatePayload(card, action))
      });
      const nextId = ["approve", "discard"].includes(action) ? generationPickNext(card.dataset.generationCandidateId) : card.dataset.generationCandidateId;
      updateGenerationBatch(batch, nextId);
      setPanelStatus(addQuestionStatus, action === "approve" ? "已通过，继续下一题。" : action === "discard" ? "已丢弃，可补齐到 50。" : "编辑已保存。", "success");
    } catch (error) {
      if (error?.message !== "token_required") {
        const message = interviewConsoleMessage(error?.message, "候选题更新失败");
        setPanelStatus(addQuestionStatus, message, "error");
        state.generation.liveOverride = { stateName: "error", title: "审核更新失败", detail: message };
      }
    } finally {
      state.generation.busy = false;
      renderGeneration();
    }
  });

  generationFill?.addEventListener("click", async () => {
    const batchId = state.generation.batch?.id;
    if (!batchId) return;
    const spec = currentGenerationSpec(true);
    if (!spec) return;
    saveGenerationSpec();
    try {
      setGenerationBusy(true, "正在补齐候选题...");
      const batch = await fillGenerationToTarget(state.generation.batch, spec, "正在补齐候选题");
      updateGenerationBatch(batch);
      setPanelStatus(addQuestionStatus, "候选题已补齐到 50。", "success");
    } catch (error) {
      if (error?.message !== "token_required") {
        const message = interviewConsoleMessage(error?.message, "补题失败");
        setPanelStatus(addQuestionStatus, message, "error");
        state.generation.liveOverride = { stateName: "error", title: "补题失败", detail: message };
      }
    } finally {
      state.generation.busy = false;
      renderGeneration();
    }
  });

  generationApproveAll?.addEventListener("click", async () => {
    const batchId = state.generation.batch?.id;
    if (!batchId) return;
    if (!window.confirm("确认把当前未丢弃的待审题全部通过？")) return;
    try {
      setGenerationBusy(true, "正在批量通过待审题...");
      const batch = await generationRequest(`/api/interview/generation-batches/${encodeURIComponent(batchId)}/approve-all`, { method: "POST", body: JSON.stringify({}) });
      updateGenerationBatch(batch);
      setPanelStatus(addQuestionStatus, "已批量通过待审题。", "success");
    } catch (error) {
      if (error?.message !== "token_required") {
        const message = interviewConsoleMessage(error?.message, "批量通过失败");
        setPanelStatus(addQuestionStatus, message, "error");
        state.generation.liveOverride = { stateName: "error", title: "批量通过失败", detail: message };
      }
    } finally {
      state.generation.busy = false;
      renderGeneration();
    }
  });

  generationAnswers?.addEventListener("click", async () => {
    const batchId = state.generation.batch?.id;
    if (!batchId) return;
    try {
      let batch = state.generation.batch;
      let guard = 0;
      do {
        const progress = batch?.progress || {};
        const answered = Number(progress.answeredCount || 0);
        const target = Number(progress.target || 50);
        setGenerationBusy(true, `正在分批生成答案 ${answered}/${target}...`);
        batch = await generationRequest(`/api/interview/generation-batches/${encodeURIComponent(batchId)}/answers`, { method: "POST", body: JSON.stringify({ provider: "deepseek", limit: 3 }) });
        updateGenerationBatch(batch);
        guard += 1;
      } while (batch?.progress?.canGenerateAnswers && !batch?.progress?.canPublish && guard < 20);
      setPanelStatus(addQuestionStatus, batch?.progress?.canPublish ? "答案已生成，可以入库题库。" : "答案已分批生成一部分，可继续点击生成。", batch?.progress?.canPublish ? "success" : "loading");
    } catch (error) {
      if (error?.message !== "token_required") {
        const message = interviewConsoleMessage(error?.message, "答案生成失败");
        setPanelStatus(addQuestionStatus, message, "error");
        state.generation.liveOverride = { stateName: "error", title: "答案生成失败", detail: message };
      }
    } finally {
      state.generation.busy = false;
      renderGeneration();
    }
  });

  generationPublish?.addEventListener("click", async () => {
    const batchId = state.generation.batch?.id;
    if (!batchId) return;
    try {
      setGenerationBusy(true, "正在入库题库...");
      const batch = await generationRequest(`/api/interview/generation-batches/${encodeURIComponent(batchId)}/finalize`, {
        method: "POST",
        body: JSON.stringify({})
      });
      updateGenerationBatch(batch);
      try { sessionStorage.removeItem(generationBatchKey); } catch {}
      root.dispatchEvent(new CustomEvent("interview:plan-refresh"));
      await loadQuestionBankForActiveGoal();
      setPanelStatus(addQuestionStatus, "已入库题库，可在题库中使用。", "success");
    } catch (error) {
      if (error?.message !== "token_required") {
        const message = interviewConsoleMessage(error?.message, "入库失败");
        setPanelStatus(addQuestionStatus, message, "error");
        state.generation.liveOverride = { stateName: "error", title: "入库失败", detail: message };
      }
    } finally {
      state.generation.busy = false;
      renderGeneration();
    }
  });

  loadDay(todayText()).then(() => restoreLatestGenerationBatch()).catch(() => restoreLatestGenerationBatch());
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initInterviewSkyConsole);
} else {
  initInterviewSkyConsole();
}
