# Phase 004 decision: moments versus notes

## Decision

`瞬间` and `笔记` will stay as separate top-level pages.

`瞬间` means short updates. `笔记` means durable records.

## Why this matters

The current site uses warmer copy than a default template, but both pages still share a similar rhythm: hero, chips, list area, footer, and search overlay. Because the future design is anime-first, page identity must come from component behavior and content contracts, not from headings alone.

## One-sentence distinction

`瞬间` is for today’s scraps and small progress. `笔记` is for records worth searching, rereading, and citing later.

## Moments rules

- Use `碎片 / 项目 / 生活` as the channel model
- Keep entries short
- Lead with time, mood, small progress, and image context
- Use sticky-note, chat-bubble, or polaroid components
- Show a feed rail or diary margin
- Use tags as stickers
- Empty copy should feel like a quiet day

## Notes rules

- Use `长文 / 调试 / 学习` as the category model
- Treat posts as searchable documents
- Lead with title, summary, topic, and reading context
- Use archive cards, paper pages, file tabs, and catalog layout
- Keep search and study density prominent
- Use tags as index labels
- Empty copy should feel like an archive shelf waiting for its first file

## Rejected alternatives

| Alternative | Reason rejected |
|---|---|
| Merge moments into notes | It removes the short diary flow and makes lightweight updates feel too formal |
| Rename notes to small notes | It makes the conflict worse because the label sounds like moments |
| Keep both as similar timelines | It fails the user’s feedback that the tabs feel repetitive |
| Make moments a social feed clone | It pushes the site away from personal anime diary tone |
| Make notes a black terminal archive | It conflicts with the pink Sailei diary direction |

## Future implementation test

Open `/moments.html` and `/archive.html` at 1280 px. If both pages can swap their card CSS without breaking meaning, the implementation fails this decision. They need different components, different rhythm, and different empty states.
