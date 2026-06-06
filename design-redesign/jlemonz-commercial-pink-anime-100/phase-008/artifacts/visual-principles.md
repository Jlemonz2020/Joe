# Phase 008 visual principles

## Frozen direction

The redesign direction is `sailei-pink-diary-desk`.

The site must feel like a pink Sailei technical diary, not a generic blog, SaaS dashboard, black terminal, or marketing landing page.

## Primary thesis

Anime feeling must come from the component system:

- Galgame dialogue panels
- Sticker task cards
- Polaroid moment cards
- Notebook archive slips
- Pink HUD file tabs
- Sailei hint cards
- Tape corners
- Paper grain
- Soft status lights
- Diary-like empty states

The background can support the mood, but it cannot carry the whole design.

## Palette principles

Use:

- Sakura pink as the emotional base
- Milk white and paper cream for readability
- Pale lavender for secondary surfaces
- Small cyan for status and focus
- Warm gold for tape, stars, and small highlights
- Rose ink for headings and important text

Avoid:

- Dominant black
- Dark navy UI
- Purple-blue gradient dominance
- One-flat-pink pages
- Random gradient orbs
- Heavy bokeh backgrounds

## Surface principles

Every visible surface needs a role:

- Dialogue: hero, tips, empty states
- Sticker: nav, tags, categories, task cards
- Paper: notes, article reading, archive
- Polaroid: moment images
- HUD: search, status, progress, GitHub density
- Dossier: projects and project detail

If a component is just a plain card with pink border, it does not pass.

## Density principles

Desktop can be rich. Mobile must be calm.

Rules:

- Desktop may show companion, widgets, cards, and side panels
- Tablet should reduce side panels
- Mobile should show one primary path at a time
- Ultra-wide screens should add ambient space, not stretch content
- Dense generated concept images are references, not a demand to cram every module above the fold

## Page identity principles

首页:

- Sailei desk entrance
- Big dialogue
- Three file task cards
- Preview modules

瞬间:

- Sticky-note feed
- Polaroids
- Channel rail
- Short updates

笔记:

- Notebook archive
- Search terminal
- File slips
- Study density

项目:

- Mission board
- Project files
- Energy bars
- Roadmap

关于:

- Character profile
- Learning tags
- Current status
- Contact memo

## Typography principles

- Chinese body text gets readable fonts first
- Decorative fonts only for logo-like labels or large accents
- Body line-height starts around `1.7`
- Card body line-height starts around `1.65`
- Article content uses a comfortable max width
- No viewport-width font scaling
- No negative letter spacing
- Long labels wrap or clamp without overlap

## Motion principles

Motion should feel like paper and stickers, not a game engine.

Allowed:

- Soft page entry
- Hover lift
- Status-dot pulse
- Search overlay fade
- GitHub grid wave
- Sticker tilt under 1 degree

Forbidden:

- Background parallax
- Transitioning every property
- Heavy animation libraries
- Motion that blocks reading
- Motion that creates layout shift

## Empty-state principles

Empty states are part of the design.

Required empty states:

- Empty posts
- Empty projects
- Empty moments
- Empty search results
- Empty comments
- Failed project detail
- Failed post detail

Each empty state should use Sailei dialogue or a diary surface. Do not show raw “no data” copy.
