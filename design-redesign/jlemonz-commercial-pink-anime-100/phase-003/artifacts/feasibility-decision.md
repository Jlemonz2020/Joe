# Phase 003 Feasibility Decision

Astro is feasible for the Jlemonz pink anime rebuild.

## Proven

- `output: "static"` builds successfully.
- `build.format: "file"` emits legacy-compatible `.html` files.
- `/` and legacy `.html` routes can be served by a simple static server.
- Root-relative `/assets/...` paths work.
- Root-relative `/api/...` references survive build.
- Astro 6.4.4 passes `npm audit` with 0 vulnerabilities in the POC.

## Required Future Defaults

- Future real project should use Astro 6.4.4 or newer.
- Keep static output.
- Keep file-format build.
- Keep frontend API calls root-relative.
- Build and verify in a new directory before replacing `/data/sites/blog/html`.

## Not Done In Phase 003

- No real visual redesign.
- No server project created under `/data/sites`.
- No Nginx edits.
- No deployment.
- No backend/database/admin edits.
