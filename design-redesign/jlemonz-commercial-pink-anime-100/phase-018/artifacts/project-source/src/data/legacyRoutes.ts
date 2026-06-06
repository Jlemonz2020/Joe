export type LegacyDetailKind = "post" | "project";

export const legacyStaticRoutes = [
  "/",
  "/index.html",
  "/moments.html",
  "/archive.html",
  "/projects.html",
  "/project.html",
  "/post.html",
  "/about.html"
] as const;

export const legacyDetailQueryKeys = ["id", "slug"] as const;

export function legacyDetailApiPath(kind: LegacyDetailKind, idOrSlug: string): string {
  if (kind === "project") {
    return `/api/projects/${encodeURIComponent(idOrSlug)}`;
  }

  return `/api/posts/${encodeURIComponent(idOrSlug)}`;
}
