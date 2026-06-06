# Phase 005 no-copy boundaries

## Rule

Use public references as design research only. Do not import external source code, images, icons, fonts, emoji packs, remote badges, music, videos, or theme assets into Jlemonz without a later explicit asset review phase.

## Boundaries by source type

### GitHub repositories

Allowed:

- Read documentation
- Note component patterns
- Note license and risk
- Use public URLs as citations in reports

Not allowed:

- Copy CSS or JavaScript into the site
- Copy screenshots into the site
- Copy README badges, emoji packs, or social links
- Import GPL code into the Astro project

### Theme demos

Allowed:

- Observe layout, navigation, feature categories, and content rhythm
- Note features such as albums, comments, search, cover images, and theme options

Not allowed:

- Download demo images
- Use CDN images from the theme
- Copy theme-specific names or settings
- Recreate the whole theme

### Skill directories

Allowed:

- Discover procedural skills
- Record risk labels and use cases
- Compare with installed local skills

Not allowed:

- Install high-risk unknown skills during a phase without need
- Replace local verification with a marketplace claim
- Add new tool dependencies unless a later phase needs them

## License notes

- MIT examples can inspire implementation, but direct copying still requires file-level license handling.
- GPL examples should not be copied into this project.
- WordPress and Hexo themes are architectural references, not implementation targets.
- Generated concept pages are prompts or inspiration, not authoritative code.

## Jlemonz asset rule

Allowed assets for later implementation:

- Existing local Sailei assets
- Existing brand assets
- Locally generated imagegen outputs with saved prompts
- New CSS-native decorations
- New SVG or HTML/CSS decorations created in the project

Disallowed assets:

- Hotlinked anime images
- External emoji packs
- Random CDN cover art
- Screenshots from other projects
- Theme demo assets without review
