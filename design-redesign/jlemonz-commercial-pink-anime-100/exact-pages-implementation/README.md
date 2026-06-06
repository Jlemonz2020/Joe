# Exact Pages Implementation

## Result

This phase extends the image-exact concept implementation beyond the homepage.

The public pages now render selected generated pink anime diary concept images directly as their primary visual layer:

- `/index.html`: `home-01-reference.png`
- `/moments.html`: `moments-01.png`
- `/archive.html`: `notes-01.png`
- `/projects.html`: `projects-01.png`
- `/project.html`: `project-detail-01.png`
- `/post.html`: `post-detail-01.png`
- `/about.html`: `about-01.png`
- `/search.html`: `search-modal-01.png`

Each exact page hides the old Astro header and uses transparent navigation hotspots over the generated image.

## Deployment

- Site: `https://192.168.31.248:8086/`
- Static root: `/data/sites/blog/html`
- Deployment timestamp: `20260606-212646`
- Backup: `/data/sites/blog/html.backup-exact-pages-20260606-212646`
- Previous live directory: `/data/sites/blog/html.pre-exact-pages-20260606-212646`

## Changed Source

- Added `src/components/ExactConceptPage.astro`
- Added `src/pages/search.astro`
- Updated:
  - `src/layouts/BaseLayout.astro`
  - `src/pages/index.astro`
  - `src/pages/moments.astro`
  - `src/pages/archive.astro`
  - `src/pages/projects.astro`
  - `src/pages/project.astro`
  - `src/pages/post.astro`
  - `src/pages/about.astro`
  - `src/components/HomeConceptDesk.astro`
  - `src/styles/home-concept-desk.css`

## Verification

Local commands:

- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `node scripts/verify-exact-pages.mjs`

Live command:

- `BASE_URL=https://192.168.31.248:8086 node scripts/verify-exact-pages.mjs`

Live Playwright verification covered:

- 8 pages
- 3 viewport widths: `390`, `1280`, `1920`
- 24 screenshots

For every exact page:

- Correct image source loaded.
- Correct native image dimensions loaded.
- Old header was not rendered.
- `data-shell="concept-exact"` was present.
- Navigation hotspots were present.
- Body horizontal overflow was not introduced.

HTTP checks after deployment:

- `/`: `200`
- `/index.html`: `200`
- `/moments.html`: `200`
- `/archive.html`: `200`
- `/projects.html`: `200`
- `/project.html`: `200`
- `/post.html`: `200`
- `/about.html`: `200`
- `/search.html`: `200`
- `/api/health`: `200`
- `/admin/`: `200`

## Notes

This implementation intentionally prioritizes visual sameness with generated concept images over editable HTML component fidelity. It is useful as a visual target and public-facing prototype. A later phase can translate the selected images into fully editable Astro components if needed.
