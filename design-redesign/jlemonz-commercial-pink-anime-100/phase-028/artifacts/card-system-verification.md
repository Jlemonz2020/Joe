# Phase 028 Verification Notes

## Commands

- `npm run typecheck`
- `npm run build`
- `npm audit`
- `with_server.py` static server plus `card-system-check.mjs`
- static route matrix with `curl`
- source and built scans for card wiring

## Browser Checks

The browser script checked:

- `/index.html`
- `/moments.html`
- `/archive.html`
- `/projects.html`
- `/index.html` at 390 px

For each layout it checked:

- `.diary-card` count;
- applied card variants;
- no horizontal overflow;
- desktop card widths;
- every card has a variant class.

## Screenshot Evidence

- `screens/cards-index-1440.png`
- `screens/cards-moments-1440.png`
- `screens/cards-archive-1440.png`
- `screens/cards-projects-1440.png`
- `screens/cards-index-390.png`

## Result

Approved. The card family is reusable, visible, and does not regress readability.

