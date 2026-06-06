# Home 01 Exact Implementation

## Result

This phase changes the public homepage to an exact visual match of `home-01-reference.png`.

Instead of recreating the generated mockup with many separate CSS components, the homepage now renders the original generated PNG as the primary visual layer and places transparent accessible hotspots over the navigation and main modules.

## Deployed Site

- URL: `https://192.168.31.248:8086/`
- Static root: `/data/sites/blog/html`
- Deployment timestamp: `20260606-210501`
- Backup: `/data/sites/blog/html.backup-home01-exact-20260606-210501`
- Previous live directory: `/data/sites/blog/html.pre-home01-exact-20260606-210501`

## Changed Frontend Files

- `src/pages/index.astro`
- `src/layouts/BaseLayout.astro`
- `src/components/HomeConceptDesk.astro`
- `src/styles/home-concept-desk.css`
- `public/assets/concepts/home-01-reference.png`

## Interaction Model

- Old global header is hidden on the homepage through `hideHeader`.
- The generated visual fills the desktop viewport with the same aspect ratio as the source image.
- Transparent hotspots preserve navigation to:
  - home
  - moments
  - notes
  - projects
  - about
  - project panel
  - moment panel
  - category shortcuts
- Other pages still use the Astro/CSS implementation from earlier phases.

## Verification

Commands run locally:

- `npm run typecheck`
- `npm audit --audit-level=moderate`
- `npm run build`
- `node scripts/verify-exact-home.mjs`

Commands run against the deployed site:

- `BASE_URL=https://192.168.31.248:8086 node scripts/verify-exact-home.mjs`
- `curl -k -I` checks for old routes and assets

Live Playwright results:

- `390`: image loaded at native `1672x941`, rendered `960x540`, header hidden, 15 hotspots, no body horizontal overflow.
- `1280`: image loaded at native `1672x941`, rendered `1279x720`, header hidden, 15 hotspots, no body horizontal overflow.
- `1920`: image loaded at native `1672x941`, rendered `1919x1080`, header hidden, 15 hotspots, no body horizontal overflow.

HTTP checks:

- `/`: `200`
- `/index.html`: `200`
- `/moments.html`: `200`
- `/archive.html`: `200`
- `/projects.html`: `200`
- `/project.html`: `200`
- `/post.html`: `200`
- `/about.html`: `200`
- `/status-lab.html`: `200`
- `/assets/concepts/home-01-reference.png`: `200`
- `/api/health`: `200`
- `/admin/`: `200`

## Artifacts

- `assets/home-01-reference.png`
- `screenshots/home-exact-390.png`
- `screenshots/home-exact-1280.png`
- `screenshots/home-exact-1920.png`
- `verification/verify-exact-home.mjs`

## Notes

This is intentionally a visual-exact homepage implementation. It prioritizes matching the generated concept image over keeping the homepage as individually editable HTML components.
