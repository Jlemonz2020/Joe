# Theme Token Spec

## Default Theme

Default theme: `sailei-pink-diary`

Direction:

- Pink first.
- Anime diary first.
- Personal site second.
- No black terminal mood.

## Optional Themes

- `sakura-light`: lighter sakura paper mood.
- `pink-neon-lite`: restrained neon accent for mission and sync modules.
- `paper-milk`: milk-white reading and notebook mood.

## Token Layers

### Semantic Colors

- `--color-page`
- `--color-page-soft`
- `--color-surface`
- `--color-paper`
- `--color-card`
- `--color-card-strong`
- `--color-ink`
- `--color-muted`
- `--color-primary`
- `--color-primary-soft`
- `--color-primary-deep`
- `--color-accent-cyan`
- `--color-accent-gold`
- `--color-accent-lavender`

### Status Colors

- `--color-status-sync`
- `--color-status-trace`
- `--color-status-daily`

### Lines, Shadows, Radius

- `--line-soft`
- `--line-strong`
- `--shadow-soft`
- `--shadow-sticker`
- `--shadow-neon`
- `--radius-panel`
- `--radius-sticker`
- `--radius-pill`

### Texture

- `--texture-paper`
- `--texture-paper-size`
- `--background-page`

## Compatibility Aliases

The previous CSS variable names remain as aliases:

- `--pink-50`
- `--pink-100`
- `--pink-200`
- `--pink-500`
- `--rose-700`
- `--milk`
- `--paper`
- `--lavender`
- `--cyan`
- `--gold`
- `--ink`
- `--muted`
- `--line`
- `--glass`

This lets future phases migrate component styles gradually instead of rewriting every selector at once.

## Theme Metadata

`src/data/themeTokens.ts` defines:

- `ThemeId`
- `ThemeTokenProfile`
- `themeProfiles`
- `defaultTheme`

Each theme has a label, mood, primary asset key, accent color list, and review notes.
