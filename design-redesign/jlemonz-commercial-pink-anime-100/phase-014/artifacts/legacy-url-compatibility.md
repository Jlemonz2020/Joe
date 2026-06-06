# Legacy URL Compatibility

## Purpose

The Astro rebuild must keep existing public URLs available because the current site is already served as static `.html` pages behind Nginx.

## Static Routes

These routes must return `200` from the static build:

- `/`
- `/index.html`
- `/moments.html`
- `/archive.html`
- `/projects.html`
- `/project.html`
- `/post.html`
- `/about.html`

## Detail Query Routes

These routes must also return `200` and preserve query-string access:

- `/project.html?id=...`
- `/project.html?slug=...`
- `/post.html?id=...`
- `/post.html?slug=...`

## Detail Mount Contract

`LegacyDetailMount.astro` reads `id` or `slug` from `window.location.search` and writes:

- `data-detail-id`
- `data-api-path`
- visible recognized-parameter copy

Project detail API target:

- `/api/projects/:idOrSlug`

Post detail API target:

- `/api/posts/:idOrSlug`

## Nginx Boundary

Phase 014 does not require Nginx rewrites. Static `.html` files continue to work with normal query strings, and the client-side mount point keeps the detail parameter available for later API-driven rendering.

## Verification Evidence

- `static-route-matrix.txt`: confirms static and query-string routes return `200`.
- `edge-project-id-dom.html`: confirms `/project.html?id=phase14-project` becomes `data-detail-id="phase14-project"` and `data-api-path="/api/projects/phase14-project"`.
- `edge-post-slug-dom.html`: confirms `/post.html?slug=phase14-post` becomes `data-detail-id="phase14-post"` and `data-api-path="/api/posts/phase14-post"`.
