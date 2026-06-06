import {
  apiPaths,
  commentsPath,
  projectDetailPath,
  reactionsPath,
  searchPath
} from "./apiPaths";
import {
  fallbackComments,
  fallbackGithubContributions,
  fallbackMoments,
  fallbackOverview,
  fallbackPosts,
  fallbackProjects,
  fallbackReactions,
  fallbackSearch,
  fallbackSiteTexts
} from "./fallbacks";
import {
  normalizeComments,
  normalizeGithubContributions,
  normalizeList,
  normalizeMoment,
  normalizeOverview,
  normalizePost,
  normalizeProject,
  normalizeReactions,
  normalizeSearchItem,
  normalizeSiteTexts
} from "./normalizers";
import type {
  AdapterResult,
  CommentsResponse,
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

function isEmptyData(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (value && typeof value === "object" && "items" in value) {
    const items = (value as { items?: unknown }).items;
    return Array.isArray(items) && items.length === 0;
  }
  if (value && typeof value === "object" && "days" in value) {
    const days = (value as { days?: unknown }).days;
    return Array.isArray(days) && days.length === 0;
  }
  return false;
}

async function fetchJson<T>(
  path: string,
  fallback: T,
  normalize: (value: unknown) => T
): Promise<AdapterResult<T>> {
  try {
    const response = await fetch(path, {
      headers: { accept: "application/json" }
    });

    if (!response.ok) {
      return {
        status: "error",
        data: fallback,
        empty: isEmptyData(fallback),
        source: "fallback",
        error: `Request failed with ${response.status}`
      };
    }

    const json = await response.json() as unknown;
    const data = normalize(json);
    const empty = isEmptyData(data);
    return {
      status: empty ? "empty" : "ready",
      data,
      empty,
      source: "api"
    };
  } catch (error) {
    return {
      status: "error",
      data: fallback,
      empty: isEmptyData(fallback),
      source: "fallback",
      error: error instanceof Error ? error.message : "Unknown request error"
    };
  }
}

export const siteTextsAdapter = (): Promise<AdapterResult<SiteTexts>> =>
  fetchJson(apiPaths.siteTexts, fallbackSiteTexts, normalizeSiteTexts);

export const overviewAdapter = (): Promise<AdapterResult<SiteOverview>> =>
  fetchJson(apiPaths.overview, fallbackOverview, normalizeOverview);

export const momentsAdapter = (): Promise<AdapterResult<ListResponse<Moment>>> =>
  fetchJson(apiPaths.moments, fallbackMoments, (value) => normalizeList(value, normalizeMoment));

export const postsAdapter = (): Promise<AdapterResult<ListResponse<Post>>> =>
  fetchJson(apiPaths.posts, fallbackPosts, (value) => normalizeList(value, normalizePost));

export const projectsAdapter = (): Promise<AdapterResult<ListResponse<Project>>> =>
  fetchJson(apiPaths.projects, fallbackProjects, (value) => normalizeList(value, normalizeProject));

export const projectDetailAdapter = (idOrSlug: string | number): Promise<AdapterResult<Project | null>> =>
  fetchJson(projectDetailPath(idOrSlug), null, (value) => normalizeProject(value));

export const searchAdapter = (query: string): Promise<AdapterResult<ListResponse<SearchItem>>> =>
  fetchJson(searchPath(query), fallbackSearch, (value) => normalizeList(value, normalizeSearchItem));

export const commentsAdapter = (target: string): Promise<AdapterResult<CommentsResponse>> =>
  fetchJson(commentsPath(target), fallbackComments(target), (value) => normalizeComments(value, target));

export const reactionsAdapter = (target: string): Promise<AdapterResult<ReactionsResponse>> =>
  fetchJson(reactionsPath(target), fallbackReactions(target), (value) => normalizeReactions(value, target));

export const githubContributionsAdapter = (): Promise<AdapterResult<GithubContributions>> =>
  fetchJson(apiPaths.githubContributions, fallbackGithubContributions, normalizeGithubContributions);
