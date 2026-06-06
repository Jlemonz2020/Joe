# Phase 014 Cleanup

## Removed

- `node_modules` was not copied into the archive.
- `.astro` was not copied into the archive.
- The temporary static server on port `4387` was stopped.

## Preserved

- `artifacts/project-source/`
- `artifacts/dist-snapshot/`
- `artifacts/legacy-url-compatibility.md`
- `artifacts/detail-query-contract.md`
- `artifacts/typecheck-output.txt`
- `artifacts/build-output.txt`
- `artifacts/npm-audit.txt`
- `artifacts/static-scan.txt`
- `artifacts/static-route-matrix.txt`
- `artifacts/edge-project-id-dom.html`
- `artifacts/edge-project-id-check.txt`
- `artifacts/edge-post-slug-dom.html`
- `artifacts/edge-post-slug-check.txt`
- `artifacts/server-stop-check.txt`
- `artifacts/source-checksums.sha256`
- `phase-014-report.md`
- `audit.md`
- `cleanup.md`

## Temporary Files Checked

- `.tmp`
- `.bak`
- failed build output
- lingering static server
- unarchived `node_modules`
- unarchived `.astro`

## Cleanup Result

Phase 014 keeps the compatibility contract, source snapshot, generated static snapshot, and route/DOM verification evidence only.
