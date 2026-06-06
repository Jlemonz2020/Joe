import type {
  CommentItem,
  CommentsResponse,
  GithubContributionDay,
  GithubContributions,
  ListResponse,
  Moment,
  Post,
  Project,
  ReactionsResponse,
  SearchItem,
  SiteOverview,
  SiteTexts
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const numeric = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : fallback;

const tags = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
      : [];

const id = (value: unknown): string => String(value ?? "");

export function normalizeMoment(value: unknown): Moment {
  const item = isRecord(value) ? value : {};
  return {
    id: id(item.id),
    content: text(item.content),
    kind: text(item.kind, "fragment"),
    tags: tags(item.tags),
    imageUrl: text(item.image_url || item.imageUrl) || undefined,
    createdAt: text(item.created_at || item.createdAt) || undefined
  };
}

export function normalizePost(value: unknown): Post {
  const item = isRecord(value) ? value : {};
  const itemId = id(item.id || item.slug);
  return {
    id: itemId,
    title: text(item.title, "未命名笔记"),
    summary: text(item.summary || item.excerpt),
    category: text(item.category) || undefined,
    tags: tags(item.tags),
    createdAt: text(item.created_at || item.createdAt) || undefined,
    href: `/post.html?id=${encodeURIComponent(itemId)}`
  };
}

export function normalizeProject(value: unknown): Project {
  const item = isRecord(value) ? value : {};
  const itemId = id(item.id || item.slug);
  return {
    id: itemId,
    slug: text(item.slug) || undefined,
    title: text(item.title, "未命名项目"),
    summary: text(item.summary || item.description),
    status: text(item.status) || undefined,
    progress: numeric(item.progress, 0),
    tags: tags(item.tags),
    coverUrl: text(item.cover_url || item.coverUrl) || undefined,
    href: `/project.html?id=${encodeURIComponent(itemId)}`
  };
}

export function normalizeComment(value: unknown): CommentItem {
  const item = isRecord(value) ? value : {};
  return {
    id: id(item.id),
    author: text(item.author || item.nickname) || undefined,
    content: text(item.content),
    createdAt: text(item.created_at || item.createdAt) || undefined
  };
}

export function normalizeSearchItem(value: unknown): SearchItem {
  const item = isRecord(value) ? value : {};
  const itemId = id(item.id || item.slug || item.href);
  return {
    id: itemId,
    title: text(item.title, "未命名记录"),
    type: text(item.type) || undefined,
    summary: text(item.summary || item.excerpt) || undefined,
    href: text(item.href, itemId ? `/post.html?id=${encodeURIComponent(itemId)}` : "/archive.html")
  };
}

export function normalizeList<T>(value: unknown, normalizeItem: (item: unknown) => T): ListResponse<T> {
  if (Array.isArray(value)) return { items: value.map(normalizeItem) };
  const record = isRecord(value) ? value : {};
  const candidates = [record.items, record.results, record.rows, record.data];
  const items = candidates.find(Array.isArray) ?? [];
  return { items: items.map(normalizeItem) };
}

export function normalizeSiteTexts(value: unknown): SiteTexts {
  const record = isRecord(value) ? value : {};
  return {
    texts: isRecord(record.texts) ? Object.fromEntries(Object.entries(record.texts).map(([key, val]) => [key, text(val)])) : {},
    rules: Array.isArray(record.rules) ? record.rules : [],
    footerSections: Array.isArray(record.footerSections) ? record.footerSections as SiteTexts["footerSections"] : [],
    layout: isRecord(record.layout) ? record.layout : {},
    ui: isRecord(record.ui) ? record.ui : {}
  };
}

export function normalizeOverview(value: unknown): SiteOverview {
  const record = isRecord(value) ? value : {};
  const stats = isRecord(record.stats) ? record.stats : {};
  const latest = Array.isArray(record.latestMoments) ? record.latestMoments : [];
  return {
    stats: {
      posts: numeric(stats.posts),
      moments: numeric(stats.moments),
      projects: numeric(stats.projects),
      categories: numeric(stats.categories)
    },
    latestMoments: latest.map(normalizeMoment)
  };
}

export function normalizeComments(value: unknown, target = "site-home"): CommentsResponse {
  const record = isRecord(value) ? value : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    target: text(record.target, target),
    items: items.map(normalizeComment)
  };
}

export function normalizeReactions(value: unknown, target = "site-home"): ReactionsResponse {
  const record = isRecord(value) ? value : {};
  return {
    target: text(record.target, target),
    likes: numeric(record.likes)
  };
}

export function normalizeGithubContributions(value: unknown): GithubContributions {
  const record = isRecord(value) ? value : {};
  const days = Array.isArray(record.days) ? record.days : [];
  return {
    username: text(record.username, "Jlemonz2020"),
    total: numeric(record.total),
    days: days.map((day): GithubContributionDay => {
      const item = isRecord(day) ? day : {};
      return {
        date: text(item.date),
        count: numeric(item.count),
        level: numeric(item.level),
        color: text(item.color) || undefined
      };
    })
  };
}
