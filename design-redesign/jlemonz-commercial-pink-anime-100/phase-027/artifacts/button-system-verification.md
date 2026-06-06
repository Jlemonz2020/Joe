# Phase 027 Verification Notes

## Commands

- `npm run typecheck`
- `npm run build`
- `npm audit`
- `with_server.py` static server plus `button-system-check.mjs`
- static route matrix with `curl`
- source and built scans for button wiring

## Browser Checks

The browser script checked:

- every `.ui-button` has accessible text or an accessible label;
- icon buttons have `data-tooltip`;
- target sizes are at least 44 px;
- exactly one theme swatch has `aria-pressed="true"`;
- desktop default, hover, and focus screenshots;
- mobile 390 screenshot without tooltip overlay.

## Screenshot Evidence

- `screens/buttons-default-1440.png`
- `screens/buttons-hover-1440.png`
- `screens/buttons-focus-1440.png`
- `screens/buttons-mobile-390.png`

## Result

Approved. The system is reusable and does not regress Header, search entry, theme switching, or mobile layout.

