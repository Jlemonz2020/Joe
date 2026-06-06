# Phase 010 regression rules

## Regression definition

A change is a regression if it breaks any current public URL, API fallback, visual principle, or budget that already passed a previous phase.

## Hard blockers

Stop and fix before continuing if:

- A required route returns non-200 unexpectedly
- A page is blank
- Main content is unreadable
- There is horizontal scroll at 390 px
- Header overlaps content
- Search cannot close
- Comments or reactions break on detail pages
- The design returns to black terminal dominance
- Posts/projects empty states disappear
- CSS or JS exceeds Phase 009 hard limit without a tradeoff note

## Soft blockers

Fix in phase when practical:

- Uneven spacing
- Weak sticker/diary component language
- Minor color mismatch
- Hover/focus polish
- Non-critical screenshot mismatch

## Deferral rule

A P2 or P3 issue can be deferred only if the report records:

- What failed
- Why it is safe to defer
- Which future phase owns the fix

P0 and P1 issues cannot be deferred.

## Cleanup rule

After each phase:

- Remove temporary screenshots
- Remove failed builds
- Remove unused generated assets
- Keep only evidence needed for audit
- Commit and push the cleaned archive
