export interface MotionRule {
  target: string;
  rule: string;
  guardrail: string;
}

export const motionRules: MotionRule[] = [
  {
    target: "Page entrance",
    rule: "Use opacity and translateY only.",
    guardrail: "Do not animate layout properties."
  },
  {
    target: "Sticker hover",
    rule: "Lift by 0.125rem with a short transition.",
    guardrail: "Avoid large movement that distracts from reading."
  },
  {
    target: "Idle accents",
    rule: "Use slow, small scale changes on tiny decorative elements only.",
    guardrail: "Never animate body copy or long content blocks."
  },
  {
    target: "Reduced motion",
    rule: "Keep all motion behind `prefers-reduced-motion` checks.",
    guardrail: "Reduced mode must stop repeated motion."
  },
  {
    target: "Performance",
    rule: "Animate transform and opacity.",
    guardrail: "Do not use heavy animation libraries."
  }
];
