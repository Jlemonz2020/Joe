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
const headerSearches = document.querySelectorAll("[data-header-search]");
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
  { id: "white", label: "白色纸页", color: "#8f8a84", themeColor: "#fbfaf7" },
  { id: "wine", label: "淡酒红", color: "#a86676", themeColor: "#f8eff2" }
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
headerSearches.forEach((input) => {
  input.addEventListener("focus", showSearch);

  input.closest(".nav-search")?.addEventListener("click", () => {
    showSearch();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    showSearch();
    if (searchInput) {
      searchInput.value = input.value.trim();
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
});
searchModal?.addEventListener("click", (event) => {
  if (event.target === searchModal) hideSearch();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && searchModal && !searchModal.hidden) hideSearch();
  if (event.key === "Escape" && themeMenu && !themeMenu.hidden) themeMenu.hidden = true;
});

document.addEventListener("click", (event) => {
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

const imageMarkup = (url, className, alt = "") => {
  const src = String(url || "").trim();
  if (!src || !/^(https?:\/\/|\/(?!\/))/i.test(src)) return "";
  return `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">`;
};

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

const apiGet = async (path) => {
  const response = await fetch(path, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`API ${path} failed`);
  return response.json();
};

const apiPost = async (path, data) => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(`API ${path} failed`);
  return response.json();
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

const SITE_TEXT_CACHE_KEY = "jlemonz:site-texts:v1";
const QUOTE_CACHE_KEY = "jlemonz:quote:v1";
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
  archiveCategories: [
    { id: "all", label: "全部", slug: "", description: "所有公开札记", countText: "", href: "/archive.html", visibleInHome: false, visibleInArchive: true, sortOrder: 0 },
    { id: "linux", label: "Linux", slug: "linux", description: "命令、驱动、系统记录", countText: "18", href: "/archive.html?cat=linux", visibleInHome: true, visibleInArchive: true, sortOrder: 10 },
    { id: "raspberry-pi", label: "树莓", slug: "raspberry-pi", description: "家庭服务器和小实验", countText: "12", href: "/archive.html?cat=raspberry-pi", visibleInHome: true, visibleInArchive: true, sortOrder: 20 },
    { id: "server", label: "服务", slug: "server", description: "Nginx、Docker、备份", countText: "15", href: "/archive.html?cat=server", visibleInHome: true, visibleInArchive: true, sortOrder: 30 },
    { id: "life", label: "生活", slug: "life", description: "不太正式的碎片", countText: "9", href: "/moments.html?kind=life", visibleInHome: true, visibleInArchive: true, sortOrder: 40 }
  ],
  momentKinds: [
    { id: "all", label: "碎片", kind: "all", subLabel: "随手记", visible: true, sortOrder: 0 },
    { id: "project", label: "项目", kind: "project", subLabel: "进度留痕", visible: true, sortOrder: 10 },
    { id: "life", label: "生活", kind: "life", subLabel: "轻一点", visible: true, sortOrder: 20 }
  ],
  pageChips: {
    archive: [
      { id: "article", label: "文章", subLabel: "长记录", visible: true, sortOrder: 10 },
      { id: "debug", label: "调试", subLabel: "可回溯", visible: true, sortOrder: 20 },
      { id: "note", label: "笔记", subLabel: "慢慢补", visible: true, sortOrder: 30 }
    ],
    projects: [
      { id: "public", label: "公开", subLabel: "只留可复盘内容", visible: true, sortOrder: 10 },
      { id: "progress", label: "进度", subLabel: "看得见", visible: true, sortOrder: 20 },
      { id: "next", label: "下一步", subLabel: "不丢线索", visible: true, sortOrder: 30 }
    ],
    about: [
      { id: "pi5", label: "Pi5", subLabel: "常驻服务", visible: true, sortOrder: 10 },
      { id: "linux", label: "Linux", subLabel: "边学边记", visible: true, sortOrder: 20 },
      { id: "blog", label: "Blog", subLabel: "长期整理", visible: true, sortOrder: 30 }
    ]
  },
  footer: {
    brandBody: "Linux、Pi5、项目和图文，慢慢归档。",
    tags: [
      { id: "pi5", label: "Pi5", visible: true, sortOrder: 10 },
      { id: "linux", label: "Linux", visible: true, sortOrder: 20 },
      { id: "gallery", label: "图库", visible: true, sortOrder: 30 }
    ]
  },
  searchSuggestions: [
    { id: "project-server", label: "树莓派家庭服务器", href: "/projects.html", visible: true, sortOrder: 10 },
    { id: "device-tree", label: "设备树绑定", href: "/moments.html", visible: true, sortOrder: 20 },
    { id: "archive", label: "札记", href: "/archive.html", visible: true, sortOrder: 30 }
  ],
  sectionTitles: {
    homeProjects: "Project",
    homeMoments: "Moments",
    homeCategory: "分类入口"
  }
};
let frontendUi = JSON.parse(JSON.stringify(defaultFrontendUi));

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

const normalizeFrontendUi = (ui = {}) => {
  const source = ui && typeof ui === "object" ? ui : {};
  const pageChips = source.pageChips || {};
  const footer = source.footer || {};
  const sectionTitles = source.sectionTitles || {};
  return {
    archiveCategories: normalizeUiList(source.archiveCategories, defaultFrontendUi.archiveCategories, (item, fallback, index) => {
      const slug = safeKey(item.slug ?? fallback.slug ?? "", "");
      return {
        id: safeKey(item.id || slug || fallback.id, `cat-${index + 1}`),
        label: getSafeEditableText(item.label ?? fallback.label) || "分类",
        slug,
        description: getSafeEditableText(item.description ?? fallback.description, { optional: true }),
        countText: getSafeEditableText(item.countText ?? fallback.countText, { optional: true }),
        href: safeHref(item.href || fallback.href || (slug ? `/archive.html?cat=${slug}` : "/archive.html"), slug ? `/archive.html?cat=${slug}` : "/archive.html"),
        visibleInHome: pickLayoutBoolean(item.visibleInHome, fallback.visibleInHome ?? true),
        visibleInArchive: pickLayoutBoolean(item.visibleInArchive, fallback.visibleInArchive ?? true),
        sortOrder: pickLayoutInteger(item.sortOrder, 0, 9999, fallback.sortOrder ?? index * 10)
      };
    }),
    momentKinds: normalizeUiList(source.momentKinds, defaultFrontendUi.momentKinds, (item, fallback, index) => {
      const kind = safeKey(item.kind ?? fallback.kind, index === 0 ? "all" : `kind-${index + 1}`);
      return {
        id: safeKey(item.id || kind || fallback.id, `kind-${index + 1}`),
        label: getSafeEditableText(item.label ?? fallback.label) || "类型",
        kind,
        subLabel: getSafeEditableText(item.subLabel ?? fallback.subLabel, { optional: true }),
        visible: pickLayoutBoolean(item.visible, fallback.visible ?? true),
        sortOrder: pickLayoutInteger(item.sortOrder, 0, 9999, fallback.sortOrder ?? index * 10)
      };
    }),
    pageChips: {
      archive: normalizeUiList(pageChips.archive, defaultFrontendUi.pageChips.archive, normalizeChipItem),
      projects: normalizeUiList(pageChips.projects, defaultFrontendUi.pageChips.projects, normalizeChipItem),
      about: normalizeUiList(pageChips.about, defaultFrontendUi.pageChips.about, normalizeChipItem)
    },
    footer: {
      brandBody: getSafeEditableText(footer.brandBody ?? defaultFrontendUi.footer.brandBody, { optional: true }),
      tags: normalizeUiList(footer.tags, defaultFrontendUi.footer.tags, (item, fallback, index) => ({
        id: safeKey(item.id || fallback.id, `footer-tag-${index + 1}`),
        label: getSafeEditableText(item.label ?? fallback.label) || "标签",
        visible: pickLayoutBoolean(item.visible, fallback.visible ?? true),
        sortOrder: pickLayoutInteger(item.sortOrder, 0, 9999, fallback.sortOrder ?? index * 10)
      }))
    },
    searchSuggestions: normalizeUiList(source.searchSuggestions, defaultFrontendUi.searchSuggestions, (item, fallback, index) => ({
      id: safeKey(item.id || fallback.id, `suggestion-${index + 1}`),
      label: getSafeEditableText(item.label ?? fallback.label) || "入口",
      href: safeHref(item.href || fallback.href, "/index.html"),
      visible: pickLayoutBoolean(item.visible, fallback.visible ?? true),
      sortOrder: pickLayoutInteger(item.sortOrder, 0, 9999, fallback.sortOrder ?? index * 10)
    })),
    sectionTitles: {
      homeProjects: getSafeEditableText(sectionTitles.homeProjects ?? defaultFrontendUi.sectionTitles.homeProjects) || "Project",
      homeMoments: getSafeEditableText(sectionTitles.homeMoments ?? defaultFrontendUi.sectionTitles.homeMoments) || "Moments",
      homeCategory: getSafeEditableText(sectionTitles.homeCategory ?? defaultFrontendUi.sectionTitles.homeCategory) || "分类入口"
    }
  };
};

function normalizeChipItem(item = {}, fallback = {}, index = 0) {
  return {
    id: safeKey(item.id || fallback.id, `chip-${index + 1}`),
    label: getSafeEditableText(item.label ?? fallback.label) || "标签",
    subLabel: getSafeEditableText(item.subLabel ?? fallback.subLabel, { optional: true }),
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

const renderArchiveCategories = (categories) => {
  const normalized = sortByOrder(categories || []);
  const home = document.querySelector("[data-home-categories]");
  if (home) {
    const items = normalized.filter((item) => item.visibleInHome);
    if (items.length) {
      home.innerHTML = items.map((item) => `
        <a href="${escapeHtml(item.href)}" data-edit-target="ui:archive-category:${escapeHtml(item.id)}">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml([item.description, item.countText].filter(Boolean).join(" · "))}</span>
        </a>
      `).join("");
    }
  }
  const archive = document.querySelector("[data-archive-categories]");
  if (archive) {
    const items = normalized.filter((item) => item.visibleInArchive);
    if (items.length) {
      archive.innerHTML = items.map((item) => `<a href="${escapeHtml(item.href)}" data-edit-target="ui:archive-category:${escapeHtml(item.id)}">${escapeHtml(item.label)}</a>`).join("");
    }
  }
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
};

const renderSearchSuggestionsUi = (items) => {
  const suggestions = sortByOrder(items || []).filter((item) => item.visible);
  if (!suggestions.length) return;
  document.querySelectorAll("[data-search-results]").forEach((node) => {
    node.innerHTML = suggestions.map((item) => `<a href="${escapeHtml(item.href)}" data-edit-target="ui:search-suggestion:${escapeHtml(item.id)}">${escapeHtml(item.label)}</a>`).join("");
  });
};

const applyFrontendUi = (ui) => {
  frontendUi = normalizeFrontendUi(ui || defaultFrontendUi);
  renderArchiveCategories(frontendUi.archiveCategories);
  renderMomentKinds(frontendUi.momentKinds);
  renderPageChips("archive", frontendUi.pageChips.archive);
  renderPageChips("projects", frontendUi.pageChips.projects);
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
  const prompt = getSafeEditableText(value, { optional: true }) || "试试 Linux、服务器、博客、驱动学习...";
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

const applyEditableTextData = (data) => {
  const texts = data?.texts || {};
  Object.entries(texts).forEach(([key, value]) => {
    const normalizedValue = getSafeEditableText(value);
    if (!normalizedValue) return;
    document.querySelectorAll(`[data-text-key="${CSS.escape(key)}"]`).forEach((node) => {
      const attrs = (node.dataset.textAttr || "").split(",").map((item) => item.trim()).filter(Boolean);
      if (attrs.length) {
        attrs.forEach((attr) => node.setAttribute(attr, normalizedValue));
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
  const cached = readCachedJson(SITE_TEXT_CACHE_KEY);
  if (cached) applyEditableTextData(cached);
};

const applyEditableTexts = async () => {
  try {
    const data = await apiGet("/api/site/texts");
    applyEditableTextData(data);
    writeCachedJson(SITE_TEXT_CACHE_KEY, data);
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

const projectRowMarkup = (item) => `
  <a class="project-row${item.cover_url ? " has-cover" : ""}" href="/project.html?id=${encodeURIComponent(item.id)}" data-edit-target="content:project:${escapeHtml(item.id || "")}">
    ${imageMarkup(item.cover_url, "project-row-cover", item.name)}
    <div class="project-row-copy">
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.status_text)}</p>
      <time>${escapeHtml(item.last_update || "")}</time>
    </div>
    <div class="rangeWrapper" aria-label="进度 ${Number(item.progress) || 0}%">
      <input class="kawaii" type="range" min="0" max="100" value="${Number(item.progress) || 0}" tabindex="-1" aria-hidden="true">
    </div>
  </a>
`;

const projectTileMarkup = (item) => `
  <a class="desk-card project-tile" href="/project.html?id=${encodeURIComponent(item.id)}" data-edit-target="content:project:${escapeHtml(item.id || "")}">
    ${imageMarkup(item.cover_url, "project-tile-cover", item.name)}
    <div class="tile-head"><span class="pin"></span><strong>${escapeHtml(item.name)}</strong></div>
    <p>${escapeHtml(item.status_text)}</p>
    <div class="progress" aria-label="进度 ${Number(item.progress) || 0}%"><span style="width:${Number(item.progress) || 0}%"></span></div>
    <time>${escapeHtml(item.last_update || "")}</time>
  </a>
`;

const postMarkup = (item) => `
  <a class="article-row${item.cover_url ? " has-cover" : ""}" href="/post.html?slug=${encodeURIComponent(item.slug || "")}" data-title="${escapeHtml(item.title || "")}" data-edit-target="content:post:${escapeHtml(item.id || "")}">
    <div class="article-row-media">
      <time datetime="${escapeHtml(item.published_at || "")}">${formatDate(item.published_at)}</time>
      ${imageMarkup(item.cover_url, "article-row-cover", item.title)}
    </div>
    <div>
      <h2>${escapeHtml(item.title || "未命名记录")}</h2>
      <p>${escapeHtml(item.summary || "还没有摘要。")}</p>
      <div class="tags">${item.category ? `<span>#${escapeHtml(item.category)}</span>` : ""}</div>
    </div>
  </a>
`;

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

const renderMoments = (items) => {
  const fullList = document.querySelector("[data-moment-list]");
  if (fullList && items?.length) {
    fullList.innerHTML = items.map(momentMarkup).join("");
    applyMomentFilter(currentMomentFilter);
  }
};

const renderProjects = (items) => {
  const preview = document.querySelector("[data-project-preview]");
  const board = document.querySelector("[data-project-board]");
  if (preview) preview.innerHTML = items?.length ? items.slice(0, frontendLayout.home.projectPreviewLimit).map(projectRowMarkup).join("") : '<p class="muted">还没有公开项目。</p>';
  if (board) board.innerHTML = items?.length ? items.map(projectTileMarkup).join("") : '<p class="muted">还没有公开项目。</p>';
};

const renderPosts = (items) => {
  const list = document.querySelector("[data-post-list]");
  if (list) list.innerHTML = items?.length ? items.map(postMarkup).join("") : '<p class="muted">这个筛选下还没有公开札记。</p>';
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
    tasks.push(() => apiGet("/api/moments").then((data) => renderMoments(data.items)));
  }
  if (document.querySelector("[data-project-preview]") || document.querySelector("[data-project-board]")) {
    tasks.push(() => apiGet("/api/projects").then((data) => renderProjects(data.items)));
  }
  if (document.querySelector("[data-post-list]")) {
    const cat = archiveCategory();
    const query = cat ? `?cat=${encodeURIComponent(cat)}` : "";
    tasks.push(() => apiGet(`/api/posts${query}`).then((data) => renderPosts(data.items)));
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
    title: "摸鱼接口暂时不可用",
    body: "摸鱼接口暂时没连上。",
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
  document.querySelectorAll("[data-github-heatmap]").forEach((heatmap) => {
    const isCompact = heatmap.classList.contains("small") && !heatmap.closest("[data-github-calendar]");
    const visibleDays = days;
    const weekCount = Math.ceil(visibleDays.length / 7);
    heatmap.style.gridTemplateColumns = `repeat(${weekCount}, minmax(0, 1fr))`;
    heatmap.innerHTML = visibleDays.map((day) => (
      `<span data-level="${day.inRange ? Number(day.level) || 0 : 0}" title="${day.date}: ${day.count} contributions"></span>`
    )).join("");
    const calendar = heatmap.closest("[data-github-calendar]");
    if (calendar) {
      renderGithubMonths(calendar, days);
    }
  });
  document.querySelectorAll("[data-github-total]").forEach((node) => {
    node.textContent = `${data.total || 0} 次贡献`;
  });
  document.querySelectorAll("[data-github-summary]").forEach((node) => {
    const name = data.username || "Jlemonz";
    node.textContent = days.length
      ? `${name} 最近一年的提交频率，后端每小时自动刷新快照。`
      : `${name} 已在后端绑定；当前数据源暂时没有返回贡献日历。`;
  });
  document.querySelectorAll("[data-github-username]").forEach((node) => {
    node.textContent = data.username || "Jlemonz";
  });
  document.querySelectorAll(".github-calendar-footer a").forEach((node) => {
    node.href = `https://github.com/${encodeURIComponent(data.username || "Jlemonz")}`;
  });
};

const loadGithub = async () => {
  try {
    const data = await apiGet("/api/github/contributions");
    renderGithub(data);
  } catch {
    renderGithub({ username: "Jlemonz2020", total: 0, days: [] });
    document.querySelectorAll("[data-github-summary]").forEach((node) => {
      node.textContent = "后端快照暂时不可用，稍后会自动重试。";
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
        <strong>${escapeHtml(item.author_name || "路过的人")}</strong>
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
      if (list) list.innerHTML = data.items.map(commentMarkup).join("");
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
    document.querySelector("[data-project-progress]").style.width = `${Number(project.progress) || 0}%`;
    document.querySelector("[data-project-update]").textContent = project.last_update || "";
    setOptionalImage("[data-project-cover]", project.cover_url, project.name || "项目展示图");
    document.querySelector("[data-project-content]").innerHTML = project.content_html || "<p>还没有详细记录。</p>";
    document.querySelectorAll("[data-comment-target]").forEach((node) => {
      node.dataset.commentTarget = target;
    });
    document.querySelectorAll("[data-like-target]").forEach((node) => {
      if (!node.dataset.likeTarget) node.dataset.likeTarget = target;
    });
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
    setOptionalImage("[data-post-cover]", post.cover_url, post.title || "札记展示图");
    document.querySelector("[data-post-content]").innerHTML = post.content_html || "<p>还没有详细记录。</p>";
    document.querySelectorAll("[data-comment-target]").forEach((node) => {
      node.dataset.commentTarget = target;
    });
    document.querySelectorAll("[data-like-target]").forEach((node) => {
      if (!node.dataset.likeTarget) node.dataset.likeTarget = target;
    });
    await Promise.all([loadComments(), renderLikes()]);
  } catch {
    title.textContent = "札记不存在";
    document.querySelector("[data-post-summary]").textContent = "没有找到这篇公开札记。";
    document.querySelector("[data-post-content]").innerHTML = '<p class="muted">这篇记录可能还没有发布，或链接已经失效。</p>';
  }
};

let currentMomentFilter = document.querySelector("[data-filter].active")?.dataset.filter
  || new URLSearchParams(window.location.search).get("kind")
  || frontendLayout.moments.defaultKind
  || "all";

const applyMomentFilter = (filter = currentMomentFilter) => {
  currentMomentFilter = filter || "all";
  document.querySelectorAll("[data-kind]").forEach((item) => {
    item.classList.toggle("is-hidden", currentMomentFilter !== "all" && item.dataset.kind !== currentMomentFilter);
  });
};

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
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
  document.querySelectorAll("[data-filter]").forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  applyMomentFilter(filter);
});

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
    const href = item.url || "/archive.html";
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
hydrateEditableTextsFromCache();
applyArchiveCategoryState();
loadDynamicContent();
applyEditableTexts().then(loadDynamicContent);
renderQuote();
renderMoyuWidget();
loadGithub();
loadProjectDetail();
loadPostDetail();
renderLikes();
loadComments();
