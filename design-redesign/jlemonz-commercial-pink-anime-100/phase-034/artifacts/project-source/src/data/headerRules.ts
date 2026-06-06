export interface HeaderRule {
  part: string;
  intent: string;
  guardrail: string;
}

export const headerRules: HeaderRule[] = [
  {
    part: "Brand plaque",
    intent: "Make the header feel like a Sailei character nameplate instead of a generic blog logo.",
    guardrail: "The brand remains a real link to `/index.html` with an accessible label."
  },
  {
    part: "Whisper bubble",
    intent: "Add a small galgame-style companion line without turning the header into a hero section.",
    guardrail: "The text must wrap and must not force horizontal scroll on mobile."
  },
  {
    part: "Sticker navigation",
    intent: "Turn navigation into numbered pink stickers with a clear active state.",
    guardrail: "Each item remains an anchor and the active page uses `aria-current=\"page\"`."
  },
  {
    part: "Tool buttons",
    intent: "Keep search and theme controls as small HUD tools.",
    guardrail: "Icon-only buttons need `aria-label` and decorative glyphs stay `aria-hidden`."
  },
  {
    part: "Mobile sticker rail",
    intent: "Group the five primary links into a compact single-row diary rail on narrow screens.",
    guardrail: "Keep the rail in normal document flow so it does not cover content or reduce tap targets."
  }
];
