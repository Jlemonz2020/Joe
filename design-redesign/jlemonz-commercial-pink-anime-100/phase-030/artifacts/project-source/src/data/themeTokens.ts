export type ThemeId = "sailei-pink-diary" | "sakura-light" | "pink-neon-lite" | "paper-milk";

export interface ThemeTokenProfile {
  id: ThemeId;
  label: string;
  mood: string;
  primaryAssetKey: string;
  accentColors: string[];
  reviewNotes: string[];
}

export const themeProfiles: ThemeTokenProfile[] = [
  {
    id: "sailei-pink-diary",
    label: "赛蕾粉色手帐",
    mood: "默认主题，樱粉、奶白、浅紫、青蓝和淡金组成柔和二次元手帐感。",
    primaryAssetKey: "sailei.main",
    accentColors: ["sakura pink", "milk white", "aqua cyan", "soft gold"],
    reviewNotes: ["Default theme", "No black terminal mood", "Use Sailei asset as identity anchor"]
  },
  {
    id: "sakura-light",
    label: "樱花轻亮",
    mood: "更轻的樱花纸面，用于需要降低粉色浓度的页面。",
    primaryAssetKey: "sailei.lightHero",
    accentColors: ["sakura blush", "warm white", "soft lavender"],
    reviewNotes: ["Optional theme", "Keep contrast readable", "Do not become generic white template"]
  },
  {
    id: "pink-neon-lite",
    label: "粉色轻霓虹",
    mood: "保留粉色主轴，增加少量青蓝发光，适合任务卡和同步模块。",
    primaryAssetKey: "sailei.violetHero",
    accentColors: ["neon pink", "aqua cyan", "lavender"],
    reviewNotes: ["Optional theme", "Glow must stay restrained", "Avoid dark cyber terminal styling"]
  },
  {
    id: "paper-milk",
    label: "奶白纸页",
    mood: "更偏手帐纸页和阅读场景，适合笔记详情和长文。",
    primaryAssetKey: "sailei.lightHero",
    accentColors: ["milk white", "paper cream", "soft rose"],
    reviewNotes: ["Optional theme", "Good for long reading", "Keep anime details in components"]
  }
];

export const defaultTheme: ThemeId = "sailei-pink-diary";

export const switchableThemeIds: ThemeId[] = ["sailei-pink-diary", "sakura-light", "paper-milk"];

export const themeStorageKey = "jlemonz:theme:v1";

export const themeColorById: Record<ThemeId, string> = {
  "sailei-pink-diary": "#fff6fa",
  "sakura-light": "#fff8fb",
  "pink-neon-lite": "#fff4fb",
  "paper-milk": "#fffaf3"
};

export const themeSwitchRules = [
  {
    rule: "Default stays pink",
    detail: "`sailei-pink-diary` is always the first load and fallback theme."
  },
  {
    rule: "No black terminal mode",
    detail: "The switcher exposes only pink, sakura, and milk-paper themes in this phase."
  },
  {
    rule: "Persist locally",
    detail: `Use localStorage key \`${themeStorageKey}\`; ignore unknown values instead of applying them.`
  },
  {
    rule: "Keep controls direct",
    detail: "Use visible swatches instead of a hidden menu so mobile users can switch without overlay risk."
  }
];
