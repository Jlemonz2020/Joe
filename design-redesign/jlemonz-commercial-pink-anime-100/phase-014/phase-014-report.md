# Phase 014 Report

## Goal

Guarantee legacy `.html` URL compatibility for the Astro rebuild, including query-string detail pages.

## Inputs

- Canonical manual: `/home/jlemonz/Documents/Jlemonz/Jlemonz.md`
- Previous phase report: `phase-013/phase-013-report.md`
- Local Astro project: `/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary`

## Skills Used

- Required: `verification-before-completion`
- Supporting: `webapp-testing` guidance, using Microsoft Edge headless instead of installing Playwright browsers

## Phase Brief

- Target: keep old static routes and detail query URLs working after Astro static output.
- Scope boundary: local Astro project and GitHub archive only.
- Out of scope: no Nginx rewrite, no live deployment, no backend changes, no database changes.
- Risk: query-string details could return a static shell but lose the ID/slug needed for API rendering.

## Changes

- Completed: added `src/data/legacyRoutes.ts`.
- Completed: added `src/components/LegacyDetailMount.astro`.
- Completed: updated `project.astro` and `post.astro` to use the legacy detail mount.
- Completed: kept `.html` routes as flat Astro static output.
- Completed: added a small detail target style in `global.css`.
- Completed: documented static route compatibility and detail query contract.

## Legacy Route Matrix

Validated routes:

- `/`
- `/index.html`
- `/moments.html`
- `/archive.html`
- `/projects.html`
- `/project.html`
- `/project.html?id=11`
- `/project.html?slug=demo-project`
- `/post.html`
- `/post.html?id=11`
- `/post.html?slug=linux-note`
- `/about.html`

All returned `200`.

## Detail Query Handling

- `/project.html?id=phase14-project` writes `data-detail-id="phase14-project"` and `data-api-path="/api/projects/phase14-project"`.
- `/post.html?slug=phase14-post` writes `data-detail-id="phase14-post"` and `data-api-path="/api/posts/phase14-post"`.
- Missing `id` and `slug` keeps the static empty detail state.

## Verification

- Commands:
  - `npm run typecheck`
  - `npm run build`
  - `npm audit`
  - static scan for placeholder/debug/sensitive patterns
  - `python3 -m http.server 4387 --directory dist`
  - route matrix with `curl`
  - `microsoft-edge --headless --disable-gpu --no-sandbox --dump-dom`
- Output summary:
  - `npm run typecheck`: success
  - `npm run build`: built 7 pages
  - `npm audit`: found 0 vulnerabilities
  - Static route matrix returned `200` for all static and query-string routes
  - Edge headless DOM check confirmed query parameters were applied to the DOM
  - Temporary server on port `4387` was stopped
- Evidence paths:
  - `artifacts/typecheck-output.txt`
  - `artifacts/build-output.txt`
  - `artifacts/npm-audit.txt`
  - `artifacts/static-scan.txt`
  - `artifacts/static-route-matrix.txt`
  - `artifacts/edge-project-id-check.txt`
  - `artifacts/edge-post-slug-check.txt`
  - `artifacts/server-stop-check.txt`
  - `artifacts/legacy-url-compatibility.md`
  - `artifacts/detail-query-contract.md`

## Screenshots

No screenshots were required in Phase 014. This phase validates route compatibility and DOM-level query handling.

## Audit

- AI self-audit: Phase 014 preserves old links without requiring Nginx changes.
- User review: continuous execution policy applies.
- Result: `approved`.

## Fixes

- Fixed in this phase: detail pages now expose old `id` and future `slug` parameters to later API rendering.
- Carry into next phase: Phase 015 should inventory assets and define what can be reused or generated.

## Cleanup

- Removed from archive: `node_modules`, `.astro`, and local working `dist` internals outside `dist-snapshot`.
- Kept: source snapshot, dist snapshot, verification outputs, route matrix, Edge DOM dumps, compatibility docs, checksums, audit, and cleanup notes.

## GitHub

- Archive path: `design-redesign/jlemonz-commercial-pink-anime-100/phase-014/`
- Commit: `456a974 phase-014: preserve legacy routes`.
- Push: `origin/main` accepted `b60342f..456a974`.
- Remote verification: `refs/heads/main` resolved to `456a974853a0f2bcfe498d466fe744a810ca15f1`.

## Next Gate

Phase 015 may start after:

- Phase 014 archive files are committed and pushed
- Old URL matrix is present and passing
- Detail query contract exists and matches the code snapshot
