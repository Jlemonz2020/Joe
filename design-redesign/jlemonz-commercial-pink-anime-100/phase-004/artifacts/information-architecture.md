# Phase 004 information architecture

## Decision summary

The site will use a five-part structure: 首页, 瞬间, 笔记, 项目, 关于. The labels stay familiar, but each page gets a different content job, visual metaphor, empty state, and review gate.

The main correction is this: `瞬间` is not a smaller version of `笔记`. `瞬间` is the short feed. `笔记` is the long-form archive and knowledge base.

## Primary site promise

Jlemonz is a pink anime technical diary centered on Sailei. The site records Pi5, Linux, hardware, AI, and ordinary progress through a soft diary interface. It should feel personal before it feels technical, but it must still stay readable and stable.

## Page ownership map

| Page | User intent | Content type | Visual metaphor | Main modules | Must not become |
|---|---|---|---|---|---|
| 首页 | Understand the site in one glance | Landing and hub | Sailei desk entrance | Galgame hero, today status, task stickers, latest moment, category stickers | A generic portfolio dashboard |
| 瞬间 | Browse short updates | Timeline feed | Sticky notes and polaroids | Channel chips, feed rail, moment cards, image polaroids, short empty state | A long article archive |
| 笔记 | Find and read durable records | Archive and knowledge index | Notebook catalog | Search terminal, topic tabs, archive cards, study-density grid, empty archive hint | A second timeline |
| 项目 | Track work in progress | Task board | Pink mission files | Project board, status badges, progress bars, roadmap, empty board hint | A portfolio sales page |
| 关于 | Meet the author and site context | Profile | Character profile card | Avatar card, learning tags, current state, contact, comments | A resume page |
| 详情页 | Read one record or project | Reading page | Paper page or task file | Title, metadata, body, comments, reactions, public rules | A decorative page that hurts reading |

## 首页

首页 should answer one question: “What is this site and what is alive today?” It needs a clear first screen with Sailei presence and a pink diary interface.

### Required modules

- `AnimeHero`: Sailei companion hero with galgame dialogue
- `TodayStatus`: one compact status strip for current site heartbeat
- `TaskStickerCards`: three entry cards for recap, trace, and daily
- `ProjectPreview`: task-board preview with an empty project hint
- `MomentPreview`: two recent diary fragments or a designed empty state
- `CategoryStickers`: Linux, hardware, RTOS, life
- `GithubDiaryGrid`: contribution density as a diary rhythm module

### Copy direction

The hero should say that this is a place for revisiting Pi5, Linux, hardware, and AI experiments. It should not sound like product marketing. The status cards should feel like file tabs or handwritten task stickers.

## 瞬间

瞬间 owns short-lived updates. It is where a small progress note can live without becoming a full article.

### Content contract

- Length: short paragraphs, one idea per item
- Time: shown as a diary timestamp
- Media: images appear as polaroids
- Tags: stickers, not gray pills
- Categories: `碎片`, `项目`, `生活`

### Visual contract

- Use a vertical feed rail or soft notebook margin
- Moment cards can look like sticky notes, chat bubbles, or clipped diary scraps
- Image moments get a polaroid frame and handwritten caption treatment
- Empty state says the feed is quiet today, not that content is missing

### What it must not do

- Do not show article summaries
- Do not use archive-card layout
- Do not use long-reading controls
- Do not include GitHub density as a dominant module

## 笔记

笔记 owns durable records. It is for long-form posts, debugging trails, learning notes, commands, and explanations.

### Content contract

- Length: medium to long
- Structure: title, summary, topic, date, tags
- Topics: `长文`, `调试`, `学习`
- Search: visible and useful
- Empty state: a designed archive placeholder

### Visual contract

- Use a notebook index or document shelf layout
- Cards should feel like file tabs, paper pages, or archive slips
- GitHub density can appear as a study-density module
- Search should feel like a soft pink reference terminal, not a black console

### What it must not do

- Do not imitate a social feed
- Do not use moment-style chat bubbles
- Do not center the experience on image polaroids
- Do not call short notes `笔记`

## 项目

项目 owns public work-in-progress records. It is not a portfolio for impressing clients. It is a task board for services, hardware experiments, site changes, and next steps.

### Content contract

- Each project has status, summary, progress, next step, and public recap
- Empty projects still show a pink task board with Sailei hint copy
- Private ports, admin routes, secrets, and internal operations stay out of public copy

### Visual contract

- Project cards look like task files
- Progress bars look like soft energy bars
- Roadmap uses nodes and ribbon lines
- Detail page reads like one task dossier

## 关于

关于 explains who is behind the site and why the site exists. It should feel like a character profile page plus a calm personal note.

### Content contract

- Introduce Jlemonz as a learner around Linux, hardware, and AI
- Keep current status and long-term learning tags
- Keep contact and comments readable
- Do not expose private services or backend details

### Visual contract

- Avatar area becomes a profile card
- Learning directions become ability tags
- Current state becomes a small status panel
- Contact remains practical

## Shared components

| Component | IA role | Later phase owner |
|---|---|---|
| `Header` | Global orientation and shortcuts | Phase 023, Phase 024 |
| `SearchOverlay` | Cross-page record lookup | Phase 086, Phase 087 |
| `EmptySaileiState` | Designed empty data recovery | Phase 029, Phase 046, Phase 055, Phase 066 |
| `GithubDiaryGrid` | Study or sync rhythm | Phase 035, Phase 056 |
| `CommentPanel` | Page discussion | Phase 074 |
| `ReactionBar` | Lightweight feedback | Phase 075 |

## Navigation decision

Keep nav labels:

- 首页
- 瞬间
- 笔记
- 项目
- 关于

Do not rename `笔记` back to `小记` during the Astro rebuild. `笔记` is clearer for the archive role and reduces overlap with `瞬间`.

## Phase 004 acceptance gates

- A reviewer can explain the difference between `瞬间` and `笔记` in one sentence
- Each page has a distinct visual metaphor
- Empty states are defined for posts, projects, search, comments, and moments
- No implementation work leaked into this phase
- Later design phases can use this IA without guessing page purpose
