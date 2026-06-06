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
import {
  asDateTime,
  asId,
  asImageUrl,
  asMomentKind,
  asNumber,
  asOptionalText,
  asProgress,
  asProjectStatus,
  asSearchType,
  asTags,
  asText,
  isRecord,
  legacyPostHref,
  legacyProjectHref
} from "./modelUtils";

export function normalizeMoment(value: unknown): Moment {
  const item = isRecord(value) ? value : {};
  return {
    id: asId(item.id),
    content: asText(item.content),
    kind: asMomentKind(item.kind),
    tags: asTags(item.tags),
    imageUrl: asImageUrl(item.image_url || item.imageUrl),
    createdAt: asDateTime(item.created_at || item.createdAt)
  };
}

export function normalizePost(value: unknown): Post {
  const item = isRecord(value) ? value : {};
  const itemId = asId(item.id || item.slug);
  return {
    id: itemId,
    slug: asOptionalText(item.slug),
    title: asText(item.title, "未命名笔记"),
    summary: asText(item.summary || item.excerpt),
    category: asOptionalText(item.category),
    tags: asTags(item.tags),
    coverUrl: asImageUrl(item.cover_url || item.coverUrl),
    createdAt: asDateTime(item.created_at || item.createdAt),
    updatedAt: asDateTime(item.updated_at || item.updatedAt),
    href: legacyPostHref(itemId)
  };
}

export function normalizeProject(value: unknown): Project {
  const item = isRecord(value) ? value : {};
  const itemId = asId(item.id || item.slug);
  return {
    id: itemId,
    slug: asOptionalText(item.slug),
    title: asText(item.title, "未命名项目"),
    summary: asText(item.summary || item.description),
    status: asProjectStatus(item.status),
    progress: asProgress(item.progress),
    tags: asTags(item.tags),
    coverUrl: asImageUrl(item.cover_url || item.coverUrl),
    createdAt: asDateTime(item.created_at || item.createdAt),
    updatedAt: asDateTime(item.updated_at || item.updatedAt),
    href: legacyProjectHref(itemId)
  };
}

export function normalizeComment(value: unknown): CommentItem {
  const item = isRecord(value) ? value : {};
  return {
    id: asId(item.id),
    author: asOptionalText(item.author || item.nickname),
    content: asText(item.content),
    createdAt: asDateTime(item.created_at || item.createdAt)
  };
}

export function normalizeSearchItem(value: unknown): SearchItem {
  const item = isRecord(value) ? value : {};
  const itemId = asId(item.id || item.slug || item.href);
  return {
    id: itemId,
    title: asText(item.title, "未命名记录"),
    type: asSearchType(item.type),
    summary: asOptionalText(item.summary || item.excerpt),
    href: asText(item.href, legacyPostHref(itemId))
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
    texts: isRecord(record.texts) ? Object.fromEntries(Object.entries(record.texts).map(([key, val]) => [key, asText(val)])) : {},
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
      posts: asNumber(stats.posts),
      moments: asNumber(stats.moments),
      projects: asNumber(stats.projects),
      categories: asNumber(stats.categories)
    },
    latestMoments: latest.map(normalizeMoment)
  };
}

export function normalizeComments(value: unknown, target = "site-home"): CommentsResponse {
  const record = isRecord(value) ? value : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    target: asText(record.target, target),
    items: items.map(normalizeComment)
  };
}

export function normalizeReactions(value: unknown, target = "site-home"): ReactionsResponse {
  const record = isRecord(value) ? value : {};
  return {
    target: asText(record.target, target),
    likes: asNumber(record.likes)
  };
}

export function normalizeGithubContributions(value: unknown): GithubContributions {
  const record = isRecord(value) ? value : {};
  const days = Array.isArray(record.days) ? record.days : [];
  return {
    username: asText(record.username, "Jlemonz2020"),
    total: asNumber(record.total),
    days: days.map((day): GithubContributionDay => {
      const item = isRecord(day) ? day : {};
      return {
        date: asText(item.date),
        count: asNumber(item.count),
        level: asNumber(item.level),
        color: asOptionalText(item.color)
      };
    })
  };
}
