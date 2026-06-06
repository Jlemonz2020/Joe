# Phase 007 implementation prompt

## Prompt purpose

Use this prompt to build the Jlemonz pink anime diary frontend in later implementation phases. The primary visual reference is `phase-006/screens/concept-01-diary-desk.png`. Use `concept-02-galgame-main.png`, `concept-03-sticky-feed.png`, and `concept-04-pink-hud-board.png` only as module references.

## Build target

Build a static Astro frontend for Jlemonz that preserves these URLs:

- `/`
- `/index.html`
- `/moments.html`
- `/archive.html`
- `/projects.html`
- `/project.html`
- `/post.html`
- `/about.html`

Keep all existing `/api/...` calls root-relative. Do not change backend, database, admin, or Nginx rules.

## Visual thesis

The site should feel like a pink Sailei diary desk where technical records are pinned as stickers, notes, task files, and polaroids. It must read as anime through component language, not only through a background image.

Priorities:

1. Pink anime Sailei diary feeling
2. Clear personal-site information
3. Durable technical reading
4. Pi5-friendly performance

Avoid black terminal mood. Use dark colors only for readable text or small line details.

## Canvas assumptions

Desktop reference:

- Target viewport: `1920 x 1080`
- Main content max width: `1680px` to `1760px`
- Outer desktop gutter: `clamp(24px, 4vw, 72px)`
- Panel radius: `18px` to `30px` for large diary cards
- Small chip radius: `999px`
- Header height desktop: `72px` to `88px`
- First screen: hero and key modules should fit without feeling like a marketing landing page

Responsive targets:

- 390 px mobile
- 768 px tablet
- 1280 px laptop
- 1920 px desktop
- 2560 px wide desktop
- 3840 px ultra-wide desktop

Large screens must not stretch cards across the full width. Use a centered stage with ambient side background.

## Core color tokens

Define tokens before components:

```css
:root {
  --pink-50: #fff6fa;
  --pink-100: #ffe8f1;
  --pink-200: #ffc9dd;
  --pink-300: #ff9fc3;
  --pink-500: #f35f98;
  --rose-700: #8f315a;
  --milk: #fffdf8;
  --paper: #fff7ef;
  --lavender: #d9cdfd;
  --cyan: #8bdde7;
  --gold: #f6c96f;
  --ink: #47263a;
  --muted: #8e6578;
  --line: rgba(239, 106, 154, 0.34);
  --glass: rgba(255, 255, 255, 0.72);
  --glass-pink: rgba(255, 235, 244, 0.76);
  --shadow-soft: 0 18px 60px rgba(205, 79, 130, 0.18);
  --shadow-sticker: 0 10px 24px rgba(168, 74, 113, 0.16);
}
```

Adjust exact values later for contrast, but keep the palette balanced: pink, milk white, lavender, cyan, and warm gold.

## Background system

Use a fixed visual background with existing local Sailei assets. The background must not move with scroll.

Layers:

1. Base: milk-white to pale pink paper color
2. Fixed Sailei image layer, softly positioned on desktop
3. Sakura veil: transparent pink-white overlay
4. Paper grain: subtle CSS noise or local texture
5. Content stage: glass and paper panels

Rules:

- No parallax movement
- No dark terminal overlay
- Keep text contrast above the image
- Mobile background can crop or soften, but must not hide text

## Header

Build the header as a pink HUD sticker strip.

Structure:

- Left: brand label using `/assets/brand/jlemonz-logo.png` when practical, plus `Jlemonz Diary`
- Center: nav sticker pills
- Right: search, theme, contact, and small status icon buttons

Nav labels:

- 首页
- 瞬间
- 笔记
- 项目
- 关于

States:

- Active nav: filled pale pink pill with rose text and tiny flower or status dot
- Hover: 2 px lift, soft pink glow
- Focus: visible outline using cyan or rose ring
- Mobile: compact top bar plus menu sheet. Do not squeeze labels until they overlap.

## Homepage layout

Homepage should follow `concept-01-diary-desk.png`.

Desktop structure:

- Header fixed or sticky at top with translucent milk glass
- Main hero stage uses two columns:
  - Left: large `GalgameDialog` panel
  - Right: companion profile card and today status
- Under hero: three `StickerTaskCard` cards
- Under cards: three-column lower grid:
  - `ProjectPreviewBoard`
  - `MomentPreviewRail`
  - `CategoryStickerShelf`
- Small footer/music-like diary chip can appear only as a decorative footer scene later

Hero copy:

- Kicker: `Pi5 / Linux / Notes`
- Title: `Jlemonz`
- Lead: `在 Pi5、Linux、硬件和 AI 之间，整理那些值得回看的折腾。`
- Sailei whisper: `今天也把线索贴好，明天回来还能接上。`

Do not use marketing hero copy. Do not create a generic split text/media landing page.

## GalgameDialog component

Visual:

- Large paper-glass speech panel
- Soft pink outline
- Thin inner highlight
- Tape corner at one or two corners
- Optional tail pointing toward Sailei background
- Nameplate: `Sailei's Whisper`

Layout:

- Width desktop: `min(760px, 100%)`
- Padding: `32px` desktop, `20px` mobile
- Title uses a characterful display style, but body remains readable
- Body max width: `48ch`

States:

- Loading: small blinking status dot, no skeleton bars that look like admin UI
- Empty: turn into `EmptySaileiState`

## StickerTaskCard component

Cards map to RECAP, TRACE, DAILY.

Visual:

- File tab on the left or top: `FILE 01`, `FILE 02`, `FILE 03`
- Main card resembles a diary slip with tape, punched-hole edge, or sticker corner
- Icon or tiny status symbol
- Tags as small stickers
- Arrow action at bottom right

Content:

- FILE 01 / SYNC or 回看: command and fix recaps
- FILE 02 / TRACE or 线索: unfinished debugging traces
- FILE 03 / DAILY or 日常: light daily fragments

Motion:

- Hover lift: 2 to 4 px
- Shadow strengthens slightly
- Tape can rotate at most 1 degree

## Moments page

Use Concept 03 as reference.

Page job:

- Short diary feed
- Not an article archive

Desktop structure:

- Header
- Left rail: page label, channel tabs, today summary
- Center: vertical diary rail with sticky note and polaroid items
- Right: Sailei hint card, tag cloud, optional lightweight stats

Channels:

- 碎片
- 项目
- 生活

Moment card rules:

- Short text
- Time stamp near the rail
- Tags as stickers
- Images as polaroids
- Reactions near the item but not social-media loud

Empty state:

- Galgame hint card: `今天的便签还空着。等下一次折腾有了火花，再把它贴到这里。`

## Notes page

Use a different grammar from Moments.

Page job:

- Durable records
- Debugging notes
- Study archive
- Searchable knowledge base

Desktop structure:

- Hero as notebook catalog intro
- Search panel as pink record lookup
- Topic tabs: 长文, 调试, 学习
- Archive cards as file slips or notebook pages
- GitHub density as study rhythm

Do not use moment feed rail. Do not use polaroid as the default card.

Empty state:

- Archive shelf card: `资料夹还没放入公开笔记。等第一篇长记录整理好，赛蕾会把它钉在这里。`

## Projects page

Use Concept 04 as reference.

Page job:

- Public task files
- Progress and next steps
- Not a sales portfolio

Desktop structure:

- Mission board header
- Filter strip: public, recent, status
- Project file cards
- Energy progress bars
- Roadmap ribbon
- Sailei assistant card
- Public rules note

Project card:

- File tab: `FILE 01`
- Title
- Summary
- Status badge
- Tags
- Energy progress bar
- Next step

Empty state:

- `任务板暂时没有公开项目。等下一个服务或硬件实验整理完成，它会出现在这里。`

## About page

Page job:

- Character profile plus personal note

Structure:

- Profile card with avatar
- Current status panel
- Learning sticker grid: Linux, hardware, AI
- Contact memo
- Comment panel

Tone:

- Calm, personal, readable
- Do not become a resume page

## Detail pages

Post detail:

- Paper reading page
- Good line length
- Code blocks readable
- Comments and reactions preserved

Project detail:

- Mission file page
- Project status, summary, body, comments, reactions
- Public rule card

Both:

- Preserve `/api/comments` and `/api/reactions`
- Provide 404 and empty states
- Do not hide body under decorative panels

## Search overlay

Visual:

- Pink record lookup panel
- Frosted glass
- Soft inner paper card
- Search icon and result slips

Behavior:

- Focus input on open
- Escape closes
- Click backdrop closes
- Keyboard focus does not escape modal
- `/api/search?q=` unchanged

Empty:

- `没有找到这条记录。换个关键词试试看。`

## Footer

Footer should feel like a small closing scene, not a tall dashboard.

Include:

- Small Sailei note
- GitHub link
- Navigation links
- Tags: Pi5, Linux, 硬件, AI
- Optional candle motif only if it stays low and subtle

## Responsive rules

390 px:

- Header becomes compact
- Hero stacks: dialogue first, companion/status below
- Task cards become one column
- Moments feed removes side panels
- Project board becomes a vertical file list
- No horizontal scrolling

768 px:

- Two-column where space allows
- Keep sticky note sizes stable
- Avoid tiny text

1280 px:

- Main desktop layout begins
- Keep hero readable

1920 px:

- Match concept density without overcrowding

2560 and 3840 px:

- Center content stage
- Increase ambient background, not card width
- Use max-width and side negative space

## Typography

Use a readable Chinese-first body stack. Decorative font can be used only for logo-like labels and large hero accents.

Rules:

- Body line height: `1.7`
- Card body line height: `1.65`
- Hero lead max width: `46ch`
- Article body max width: `72ch`
- Do not use viewport-width-based font scaling
- Letter spacing stays `0` for normal Chinese text

## Motion

Allowed:

- Page load stagger
- Gentle hover lift
- Small status light pulse
- Search overlay fade and scale
- GitHub grid soft wave
- Sticker hover rotation under 1 degree

Required:

- Support `prefers-reduced-motion`
- No background parallax
- No heavy animation library

## Implementation constraints

- Use Astro static build
- Preserve `.html` URL output
- Prefer CSS and small JavaScript
- Do not use remote images
- Do not copy generated concept art as production Sailei art
- Use existing local assets first
- Do not touch backend or database
- Do not change API paths

## Do not

- Do not make the site black
- Do not make a generic SaaS dashboard
- Do not make cards inside cards
- Do not use random gradient orbs
- Do not make `瞬间` and `笔记` share the same card grammar
- Do not rely on one illustration to carry anime feeling
- Do not let text overlap at 390, 768, 1280, 1920, 2560, or 3840 widths

## Acceptance criteria

- First impression: pink anime technical diary
- Homepage resembles Concept 01 in structure and feeling
- Hero dialogue borrows Concept 02 without turning the whole site into a game screen
- Moments page borrows Concept 03 and is distinct from notes
- Projects page borrows Concept 04 without becoming enterprise admin
- Existing URLs work
- APIs still work
- Empty states are designed
- Large screens feel intentional
- Mobile has no horizontal scroll
- GitHub archive records every phase
