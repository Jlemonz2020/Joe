export type AdapterStatus = "loading" | "ready" | "empty" | "error";
export type AdapterSource = "api" | "fallback";
export type ISODateString = string;
export type LegacyHref = string;
export type ContentKind = "life" | "project" | "fragment" | "all" | string;
export type ProjectStatus = "planning" | "active" | "paused" | "done" | "archived" | string;
export type SearchItemType = "post" | "project" | "moment" | "page" | string;
export type InteractionTarget = string;

export interface AdapterResult<T> {
  status: AdapterStatus;
  data: T;
  empty: boolean;
  source: AdapterSource;
  error?: string;
}

export interface ListResponse<T> {
  items: T[];
}

export interface SiteTexts {
  texts: Record<string, string>;
  rules: unknown[];
  footerSections: FooterSection[];
  layout: Record<string, unknown>;
  ui: Record<string, unknown>;
}

export interface FooterSection {
  title: string;
  links: FooterLink[];
}

export interface FooterLink {
  label: string;
  href: string;
  desc?: string;
}

export interface SiteOverview {
  stats: {
    posts: number;
    moments: number;
    projects: number;
    categories: number;
  };
  latestMoments: Moment[];
}

export interface Moment {
  id: string;
  content: string;
  kind: ContentKind;
  tags: string[];
  imageUrl?: string;
  createdAt?: ISODateString;
}

export interface Post {
  id: string;
  slug?: string;
  title: string;
  summary: string;
  category?: string;
  tags: string[];
  coverUrl?: string;
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
  href: LegacyHref;
}

export interface Project {
  id: string;
  slug?: string;
  title: string;
  summary: string;
  status?: ProjectStatus;
  progress?: number;
  tags: string[];
  coverUrl?: string;
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
  href: LegacyHref;
}

export interface CommentItem {
  id: string;
  author?: string;
  content: string;
  createdAt?: ISODateString;
}

export interface CommentsResponse {
  target: InteractionTarget;
  items: CommentItem[];
}

export interface ReactionsResponse {
  target: InteractionTarget;
  likes: number;
}

export interface GithubContributionDay {
  date: string;
  count: number;
  level: number;
  color?: string;
}

export interface GithubContributions {
  username: string;
  total: number;
  days: GithubContributionDay[];
}

export interface SearchItem {
  id: string;
  title: string;
  type?: SearchItemType;
  summary?: string;
  href: LegacyHref;
}
