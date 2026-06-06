export type AdapterStatus = "loading" | "ready" | "empty" | "error";
export type AdapterSource = "api" | "fallback";

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
  kind: "all" | "project" | "life" | "fragment" | string;
  tags: string[];
  imageUrl?: string;
  createdAt?: string;
}

export interface Post {
  id: string;
  title: string;
  summary: string;
  category?: string;
  tags: string[];
  createdAt?: string;
  href: string;
}

export interface Project {
  id: string;
  slug?: string;
  title: string;
  summary: string;
  status?: string;
  progress?: number;
  tags: string[];
  coverUrl?: string;
  href: string;
}

export interface CommentItem {
  id: string;
  author?: string;
  content: string;
  createdAt?: string;
}

export interface CommentsResponse {
  target: string;
  items: CommentItem[];
}

export interface ReactionsResponse {
  target: string;
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
  type?: string;
  summary?: string;
  href: string;
}
