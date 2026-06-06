export interface InteractionRule {
  surface: string;
  requirement: string;
  check: string;
}

export const interactionRules: InteractionRule[] = [
  {
    surface: "Navigation links",
    requirement: "Use anchor elements and mark the current page with `aria-current`.",
    check: "Links must support normal browser navigation."
  },
  {
    surface: "Icon buttons",
    requirement: "Use `button type=\"button\"` and provide an `aria-label`.",
    check: "Decorative icon text should be hidden from assistive technology."
  },
  {
    surface: "Custom controls",
    requirement: "Prefer semantic `button`, `a`, `input`, and `dialog` elements before ARIA.",
    check: "`role=\"button\"` is only allowed when a native control cannot represent the interaction."
  },
  {
    surface: "Focus states",
    requirement: "Use `:focus-visible` with a visible ring.",
    check: "Do not remove outlines without a replacement."
  },
  {
    surface: "Touch targets",
    requirement: "Use at least 2.75rem targets, 3rem on coarse pointers.",
    check: "Header and tool buttons must remain finger-friendly."
  },
  {
    surface: "Future panels",
    requirement: "Use contained overscroll for modals, search panels, and drawers.",
    check: "Background content should not scroll when a panel is active."
  }
];
