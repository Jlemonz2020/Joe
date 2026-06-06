export interface TypographyRule {
  target: string;
  rule: string;
  reason: string;
}

export const typographyRules: TypographyRule[] = [
  {
    target: "Body copy",
    rule: "Use readable sans-serif Chinese fonts, 1rem body size, and 1.72 line height.",
    reason: "Long notes and debugging records need reading comfort before decoration."
  },
  {
    target: "Hero title",
    rule: "Use rem-based breakpoints instead of viewport-scaled font sizes.",
    reason: "Large screens should not turn headings into oversized posters."
  },
  {
    target: "Dialog lead",
    rule: "Limit lead copy to 46ch.",
    reason: "Galgame dialogue should feel focused and easy to scan."
  },
  {
    target: "Cards",
    rule: "Limit card copy to 58ch and keep line height at 1.72.",
    reason: "Task cards and sticky notes need rhythm without cramped paragraphs."
  },
  {
    target: "Numbers and timestamps",
    rule: "Use tabular numbers.",
    reason: "Stats, dates, and heatmap counts should align cleanly."
  }
];
