# Phase 008 interface guideline gates

## Source

The latest Web Interface Guidelines were fetched from:

`https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`

The first attempt failed due a transient SSL connection issue. A retry succeeded.

## Accessibility gates

- Icon-only buttons need `aria-label`
- Form controls need labels or `aria-label`
- Use `<button>` for actions
- Use `<a>` for navigation
- Decorative icons use `aria-hidden="true"`
- Images need `alt`, or `alt=""` when decorative
- Headings must be hierarchical
- Include skip link for main content in the Astro shell

## Focus gates

- All interactive elements need visible `:focus-visible`
- Never remove outlines without replacement
- Compound controls use `:focus-within`
- Search overlay must trap or manage focus

## Animation gates

- Respect `prefers-reduced-motion`
- Animate `transform` and `opacity`
- Do not use `transition: all`
- Animations must not block input
- Use correct `transform-origin`

## Content gates

- Long text must wrap, clamp, or break safely
- Flex and grid children need minimum-width rules where text may overflow
- Empty arrays render designed empty states
- User-generated content must handle short, average, and long inputs

## Image gates

- Images need explicit width and height when rendered as `<img>`
- Below-fold images should lazy-load
- Above-fold critical images should be prioritized
- Generated concept art is not production art

## Navigation gates

- Filters and tabs should sync to URL where useful
- Links must remain real links
- Destructive actions are out of scope for this public frontend

## Touch and layout gates

- Use `touch-action: manipulation`
- Modal and drawer surfaces use `overscroll-behavior: contain`
- Full-bleed layouts account for safe areas
- Fix content overflow instead of hiding important text
- Use flex and grid over JavaScript measurement

## Locale gates

- Dates use `Intl.DateTimeFormat`
- Numbers use `Intl.NumberFormat`
- Brand names and code tokens use `translate="no"` where auto-translation could mangle them
