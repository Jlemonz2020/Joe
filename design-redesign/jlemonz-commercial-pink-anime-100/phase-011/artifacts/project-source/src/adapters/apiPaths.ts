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
