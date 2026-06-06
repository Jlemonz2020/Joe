# Phase 005 reference patterns

## Pattern 1: anime identity is a system, not one illustration

Shineii86/Portfolio shows that an anime portfolio can use anime gallery sections, skill badges, quotes, animated cards, and social cards as a complete identity system. Jlemonz should not use a single background as the only anime signal.

### Transfer to Jlemonz

- Convert skills badges into learning-direction stickers
- Convert quote sections into Sailei dialogue lines
- Convert animated cards into soft pink task stickers
- Convert anime showcase into Sailei image panels and diary moments

### Avoid

- Dark neon as the default theme
- External emoji packs or remote image badges
- Generic “favorite anime” sections that do not fit a technical diary

## Pattern 2: Sakura-style blogs create atmosphere through rituals

Hexo Sakura and Sakurairo both show the value of cover media, albums, comments, navigation richness, friendly color systems, and blog rituals. They make the site feel lived-in.

### Transfer to Jlemonz

- Use a soft fixed Sailei background plus paper texture
- Add cover-like hero panels without heavy video
- Treat images as album or polaroid moments
- Keep comments and reactions as small social rituals
- Add friendly theme settings later, not in the first visual phase

### Avoid

- Heavy PJAX or music as a default requirement
- Random external covers
- WordPress-specific settings complexity

## Pattern 3: manga and galgame UI make pages feel authored

The manga portfolio concept highlights comic panels, speech bubbles, panel transitions, and project chapters. This maps well to the user’s need for “二次元啊，你懂吗” because it changes component grammar.

### Transfer to Jlemonz

- Use galgame dialogue for homepage hero and empty states
- Use chapter tabs for projects and notes
- Use soft panel borders and label ribbons instead of plain cards
- Use “task file” detail pages for projects

### Avoid

- Aggressive comic motion that makes reading hard
- Black ink-heavy manga styling as the dominant look
- Framer Motion dependence unless later phases choose React-heavy motion

## Pattern 4: short-feed products teach rhythm, not branding

TikTok-like UIs show why short updates need a distinct rhythm: strong single items, quick actions, channel switching, and a scrollable feed that does not ask the user to read long summaries.

### Transfer to Jlemonz

- Make `瞬间` a vertical diary feed
- Keep channel switching: `碎片 / 项目 / 生活`
- Put tags and reactions near each short entry
- Use lazy-visible animation for feed cards
- Keep posts out of this page

### Avoid

- Full-screen video feed
- TikTok brand language
- Infinite-scroll addiction mechanics
- GPL code import from UI clones

## Pattern 5: theme directories show the baseline is not enough

The Hexo theme directory shows common expectations: responsive layout, card UI, search, tags, galleries, and one-column or multi-column layouts. These are required but not distinctive.

### Transfer to Jlemonz

- Treat responsive behavior and search as baseline
- Use cards only when they have anime semantics
- Create separate card families for moments, notes, and projects

### Avoid

- Calling a card grid “redesign”
- Using a generic blog layout with anime colors
- Relying on framework defaults

## Pattern 6: skills must be procedural, not decorative

Skill directories reinforce that this project should keep design, testing, review, performance, and verification as separate procedural tools.

### Transfer to Jlemonz

- Use `frontend-design` in visual phases
- Use `frontend-responsive-ui` in layout phases
- Use `webapp-testing` for screenshots and regressions
- Use `verification-before-completion` before each phase is closed
- Use `writing-guidelines` for public copy

### Avoid

- Installing high-risk unknown skills during active design work
- Replacing judgment with a marketplace list
- Adding tools that do not change the output quality
