# Phase 008 design token principles

## Token categories

Later implementation phases must define tokens before page components.

Required groups:

- Color
- Typography
- Spacing
- Radius
- Borders
- Shadows
- Motion
- Z-index
- Breakpoints
- Component states

## Color token intent

| Token role | Intent |
|---|---|
| `pink-*` | Emotional theme and active states |
| `rose-*` | Heading ink and important controls |
| `milk` | Main readable surface |
| `paper` | Notebook and article body |
| `lavender` | Secondary cards and calm contrast |
| `cyan` | Focus rings and live status |
| `gold` | Tape, stars, and warm accents |
| `ink` | Main readable text |
| `muted` | Secondary copy |
| `line` | Pink hairline borders |

## Surface tokens

Define at least:

- `--surface-glass`
- `--surface-glass-pink`
- `--surface-paper`
- `--surface-dialog`
- `--surface-sticker`
- `--surface-polaroid`
- `--surface-hud`

## Border and shadow tokens

Do not hand-tune every card. Define shared tokens:

- Soft glass border
- Paper edge border
- Sticker border
- HUD hairline
- Soft panel shadow
- Sticker shadow
- Floating overlay shadow

## Motion tokens

Define:

- `--motion-fast`
- `--motion-base`
- `--motion-slow`
- `--ease-soft`
- `--ease-pop`

Rules:

- Never use `transition: all`
- Animate `transform` and `opacity` first
- Add reduced-motion overrides

## Responsive tokens

Required breakpoint names:

- `xs`: 390
- `sm`: 768
- `md`: 1280
- `lg`: 1920
- `xl`: 2560
- `xxl`: 3840

Use CSS custom properties and media queries. Do not rely on JavaScript measurement for layout.

## Token freeze rules

Phase 008 freezes intent, not final numeric values. Final numeric tokens can be refined in Phase 016, but they must stay within the pink Sailei diary direction.
