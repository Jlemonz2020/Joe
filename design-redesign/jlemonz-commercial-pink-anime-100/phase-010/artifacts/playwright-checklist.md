# Phase 010 Playwright checklist

## Tooling rule

Use the `webapp-testing` skill. Run helper scripts with `--help` before use. Prefer native Python Playwright scripts for screenshots and browser inspection.

## Browser script requirements

Every later screenshot script should collect:

- URL
- Viewport width and height
- Screenshot path
- Console errors
- Failed requests
- `document.documentElement.scrollWidth`
- `document.documentElement.clientWidth`
- Page title
- Main landmark or fallback selector presence

## Horizontal scroll check

Pass if:

```text
scrollWidth <= clientWidth + 1
```

Fail if horizontal overflow appears at any required width.

## Console check

Fail on:

- uncaught exceptions
- failed module loads
- missing assets
- API errors that are not handled by UI fallback

Warn on:

- expected 404 tests for missing detail pages
- blocked third-party requests only if no production dependency exists

## Route wait strategy

Use:

- `networkidle` for normal pages
- `domcontentloaded` plus a fixed wait fallback for pages with long-polling or APIs that keep network open

Record the wait strategy in the report.

## Interaction checks

Search overlay:

- Open from header
- Input receives focus
- Type a query
- Results or empty state render
- Escape closes overlay

Theme switch:

- Button exists
- State changes without layout jump

Navigation:

- Links are real anchors
- Active state appears

Comments and reactions:

- Empty state renders
- Controls are reachable
- Failed POST shows friendly feedback

## Screenshot artifact rules

- Save screenshots under the phase directory
- Do not keep failed duplicate screenshots unless they document a bug
- If a screenshot is used as evidence, mention it in the phase report

## Example future command pattern

```bash
python scripts/capture_phase.py \
  --base-url http://127.0.0.1:4321 \
  --phase phase-040 \
  --pages home=/ index=/index.html moments=/moments.html \
  --widths 390,768,1280,1920,2560,3840
```

The exact script can be created in a later implementation phase.
