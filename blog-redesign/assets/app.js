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
  return `<article class="moment-item${image ? " with-image" : ""}" data-kind="${escapeHtml(item.kind || "life")}">${body}</article>`;
};

const projectRowMarkup = (item) => `
  <a class="project-row" href="/project.html?id=${encodeURIComponent(item.id)}">
    <div>
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
  <a class="desk-card project-tile" href="/project.html?id=${encodeURIComponent(item.id)}">
    <div class="tile-head"><span class="pin"></span><strong>${escapeHtml(item.name)}</strong></div>
    <p>${escapeHtml(item.status_text)}</p>
    <div class="progress" aria-label="进度 ${Number(item.progress) || 0}%"><span style="width:${Number(item.progress) || 0}%"></span></div>
    <time>${escapeHtml(item.last_update || "")}</time>
  </a>
`;

const postMarkup = (item) => `
  <a class="article-row" href="/post.html?slug=${encodeURIComponent(item.slug || "")}" data-title="${escapeHtml(item.title || "")}">
    <time datetime="${escapeHtml(item.published_at || "")}">${formatDate(item.published_at)}</time>
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
    preview.innerHTML = overview.latestMoments.slice(0, 2).map(momentMarkup).join("");
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
  if (preview && items?.length) preview.innerHTML = items.slice(0, 4).map(projectRowMarkup).join("");
  if (board && items?.length) board.innerHTML = items.map(projectTileMarkup).join("");
};

const renderPosts = (items) => {
  const list = document.querySelector("[data-post-list]");
  if (list && items?.length) list.innerHTML = items.map(postMarkup).join("");
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
    tasks.push(() => apiGet("/api/posts").then((data) => renderPosts(data.items)));
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
  <article class="comment-item">
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
    title.textContent = project.name;
    document.querySelector("[data-project-summary]").textContent = project.summary || project.status_text || "";
    document.querySelector("[data-project-state]").textContent = project.status_text || "进行中";
    document.querySelector("[data-project-progress]").style.width = `${Number(project.progress) || 0}%`;
    document.querySelector("[data-project-update]").textContent = project.last_update || "";
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
    title.textContent = post.title || "未命名札记";
    document.querySelector("[data-post-summary]").textContent = post.summary || "还没有摘要。";
    document.querySelector("[data-post-category]").textContent = post.category || "札记";
    document.querySelector("[data-post-published]").textContent = formatDate(post.published_at);
    document.querySelector("[data-post-updated]").textContent = post.updated_at ? `更新 ${formatDate(post.updated_at)}` : "";
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

let currentMomentFilter = document.querySelector("[data-filter].active")?.dataset.filter || "all";

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

hydrateEditableTextsFromCache();
loadDynamicContent();
applyEditableTexts();
renderQuote();
renderMoyuWidget();
loadGithub();
loadProjectDetail();
loadPostDetail();
renderLikes();
loadComments();
