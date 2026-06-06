# Phase 005 component translation map

## Purpose

This map turns research into concrete future components for Jlemonz. Later phases should use this as a source of component intent.

## Global design language

| Reference idea | Jlemonz component | Implementation direction |
|---|---|---|
| Anime portfolio hero | `AnimeHero` | Pink Sailei companion scene, fixed background, galgame dialogue, status lights |
| Sakura blog cover | `DiaryCoverLayer` | Soft cover media treatment with milk-white veil and paper texture |
| Speech-bubble UI | `GalgameDialog` | Rounded dialogue box with nameplate, tail, soft inner highlight |
| Anime skill badges | `LearningSticker` | Linux, hardware, RTOS, AI stickers with tiny icon and ribbon color |
| Quote section | `SaileiWhisper` | Small rotating line near hero or empty state |
| Animated cards | `StickerTaskCard` | Low-motion hover, pink glass, tape corner, file number |
| Blog album | `PolaroidMoment` | Moment image card with white frame, date stamp, tag stickers |
| Vertical feed | `MomentFeedRail` | One-column diary rail with visible item animation and channel chips |
| Book-like theme | `ArchiveNotebook` | Notes index as document shelf, file tabs, search terminal |
| TikTok action cluster | `MomentActions` | Compact like/comment/share equivalents without social clone behavior |
| Feature-rich theme settings | `ThemeController` | Later theme switcher for `sailei-pink-diary`, `sakura-light`, `paper-milk` |
| AI-assisted reading | `ReadingCompanion` | Later non-AI reading helper panel if needed; do not add AI dependency now |

## Page mapping

### 首页

- `AnimeHero`
- `GalgameDialog`
- `SaileiWhisper`
- `StickerTaskCard`
- `GithubDiaryGrid`
- `ProjectPreviewBoard`
- `MomentPreviewRail`
- `CategoryStickerShelf`

### 瞬间

- `MomentChannelTabs`
- `MomentFeedRail`
- `StickyMomentCard`
- `PolaroidMoment`
- `MomentActions`
- `EmptySaileiState`

### 笔记

- `ArchiveNotebook`
- `ArchiveSearchTerminal`
- `ArchiveFileCard`
- `StudyDensityPanel`
- `TopicStickerTabs`
- `EmptyArchiveShelf`

### 项目

- `ProjectMissionBoard`
- `ProjectFileCard`
- `EnergyProgressBar`
- `RouteNodeTimeline`
- `PublicRuleNote`
- `EmptyTaskBoard`

### 关于

- `CharacterProfileCard`
- `LearningStickerGrid`
- `CurrentStatusPanel`
- `ContactMemo`
- `CommentPanel`

### 搜索

- `PinkRecordSearch`
- `SearchResultSlip`
- `SearchNoResultSailei`

## Interaction mapping

| Interaction | Source pattern | Jlemonz rule |
|---|---|---|
| Hover | Anime portfolio cards | Use 2 to 4 px lift, soft glow, no large jumps |
| Entry motion | Portfolio scroll animation | Stagger small sections, respect reduced motion |
| Feed visibility | Vertical feed libraries | Animate and hydrate visible items only where useful |
| Theme switch | Blog themes | Use color token changes, not layout shifts |
| Search overlay | App UI patterns | Soft modal, focus trap, Escape close, readable result list |

## Visual debt warnings

- If a later phase adds a card without a role, redesign it
- If moments and notes share a card style, reject the phase
- If pink becomes one flat color, add contrast with milk-white, lilac, cyan, gold, and paper texture
- If the UI becomes dark terminal again, revert that phase
- If an external visual asset is required, generate or design a local equivalent instead
