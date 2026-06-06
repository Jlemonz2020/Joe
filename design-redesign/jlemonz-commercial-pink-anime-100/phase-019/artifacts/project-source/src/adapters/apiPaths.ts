export const apiPaths = {
  health: "/api/health",
  siteTexts: "/api/site/texts",
  overview: "/api/site/overview",
  moments: "/api/moments",
  posts: "/api/posts",
  projects: "/api/projects",
  projectDetail: "/api/projects/:idOrSlug",
  search: "/api/search?q=",
  comments: "/api/comments",
  reactions: "/api/reactions",
  githubContributions: "/api/github/contributions"
} as const;

export function projectDetailPath(idOrSlug: string | number): string {
  return `/api/projects/${encodeURIComponent(String(idOrSlug))}`;
}

export function searchPath(query: string): string {
  return `/api/search?q=${encodeURIComponent(query)}`;
}

export function commentsPath(target: string): string {
  return `${apiPaths.comments}?target=${encodeURIComponent(target)}`;
}

export function reactionsPath(target: string): string {
  return `${apiPaths.reactions}?target=${encodeURIComponent(target)}`;
}
