# Phase 008 component quality gates

## Global gate

A component passes only if it has:

- A clear role
- A visual metaphor
- Empty state or loading state where relevant
- Hover state if interactive
- Focus state if keyboard reachable
- Mobile behavior
- Long-content behavior
- Reduced-motion behavior if animated

## Header gate

Must include:

- Brand area
- Navigation links
- Search button
- Theme button
- Contact or external link affordance
- Active state
- Mobile menu strategy
- `aria-label` on icon buttons

Must avoid:

- Overlapping nav text
- Hidden focus outlines
- Div-based navigation actions

## GalgameDialog gate

Must include:

- Nameplate
- Body text area
- Optional tail or tape
- Loading variant
- Empty-state variant
- Readable body width

Must avoid:

- Giant text that hides content
- Fake unreadable generated text
- Overlapping with background character

## StickerTaskCard gate

Must include:

- File number
- Status label
- Body copy
- Sticker tags
- Action affordance
- Hover and focus states

Must avoid:

- Plain generic card layout
- Excessive tilt
- Card inside card

## Moment component gate

Must include:

- Time stamp
- Short body
- Kind or channel
- Tags
- Optional image as polaroid
- Compact reaction area

Must avoid:

- Long article summary layout
- Archive card styling
- Full video-feed imitation

## Note component gate

Must include:

- Title
- Summary
- Category or topic
- Date
- Tags
- Link to detail

Must avoid:

- Moment rail styling
- Polaroid as default card
- Social-feed rhythm

## Project component gate

Must include:

- Project title
- Summary
- Status
- Progress or fallback
- Tags
- Next step
- Link to detail

Must avoid:

- Sales portfolio tone
- Admin dashboard density
- Private system details

## Search gate

Must include:

- Labeled input
- Keyboard close
- Focus management
- Loading state
- Empty state
- Result list with links

Must avoid:

- No-result blank area
- Modal scroll bleed
- Missing Escape behavior

## Footer gate

Must include:

- Site context
- Navigation links
- GitHub link
- Tags
- Compact height

Must avoid:

- Oversized decorative footer
- Hidden link focus states
- Unclear external links
