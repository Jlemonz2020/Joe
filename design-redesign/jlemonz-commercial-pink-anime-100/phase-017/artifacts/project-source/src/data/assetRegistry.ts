export type AssetFamily = "brand" | "sailei" | "generated-reference";
export type AssetUse = "production" | "needs-optimization" | "reference-only";

export interface SiteAsset {
  key: string;
  family: AssetFamily;
  path: string;
  bytes?: number;
  use: AssetUse;
  role: string;
  notes: string;
}

export const siteAssets: SiteAsset[] = [
  {
    key: "brand.logo",
    family: "brand",
    path: "/assets/brand/jlemonz-logo.png",
    bytes: 23622,
    use: "production",
    role: "Site logo and brand mark",
    notes: "Small enough for production use."
  },
  {
    key: "brand.favicon32",
    family: "brand",
    path: "/assets/brand/favicon-32.png",
    bytes: 1127,
    use: "production",
    role: "Browser favicon",
    notes: "Keep for SEO and browser identity."
  },
  {
    key: "brand.favicon192",
    family: "brand",
    path: "/assets/brand/favicon-192.png",
    bytes: 9158,
    use: "production",
    role: "PWA icon candidate",
    notes: "Keep for future manifest work."
  },
  {
    key: "sailei.main",
    family: "sailei",
    path: "/assets/sailei/sailei-main.jpg",
    bytes: 860962,
    use: "production",
    role: "Primary Sailei character image",
    notes: "Best candidate for the fixed pink diary background after responsive positioning."
  },
  {
    key: "sailei.avatar",
    family: "sailei",
    path: "/assets/sailei/avatar.jpg",
    bytes: 77317,
    use: "production",
    role: "Profile and character card avatar",
    notes: "Good size for about/profile components."
  },
  {
    key: "sailei.hero1600",
    family: "sailei",
    path: "/assets/sailei/hero-1600.jpg",
    bytes: 109050,
    use: "production",
    role: "Hero or section background candidate",
    notes: "Good weight for responsive hero experiments."
  },
  {
    key: "sailei.hero1100",
    family: "sailei",
    path: "/assets/sailei/hero-1100.jpg",
    bytes: 61922,
    use: "production",
    role: "Small hero fallback",
    notes: "Useful for mobile or low-density panels."
  },
  {
    key: "sailei.note1",
    family: "sailei",
    path: "/assets/sailei/note-1.jpg",
    bytes: 105580,
    use: "production",
    role: "Notebook and moment card image",
    notes: "Candidate for polaroid or sticky-note modules."
  },
  {
    key: "sailei.note2",
    family: "sailei",
    path: "/assets/sailei/note-2.jpg",
    bytes: 68187,
    use: "production",
    role: "Notebook and moment card image",
    notes: "Candidate for empty states and page dividers."
  },
  {
    key: "sailei.sideIllustration",
    family: "sailei",
    path: "/assets/sailei/side-illustration.jpg",
    bytes: 52913,
    use: "production",
    role: "Side panel illustration",
    notes: "Lightweight enough for secondary decorative use."
  },
  {
    key: "sailei.sidePhoto",
    family: "sailei",
    path: "/assets/sailei/side-photo.jpg",
    bytes: 107070,
    use: "production",
    role: "About/profile side image",
    notes: "Use when the page needs a softer photo-like insert."
  },
  {
    key: "sailei.aquaHero",
    family: "sailei",
    path: "/assets/sailei/aqua-hero-1600.jpg",
    bytes: 157380,
    use: "production",
    role: "Optional cool-accent hero variant",
    notes: "Use sparingly so the default site remains pink."
  },
  {
    key: "sailei.violetHero",
    family: "sailei",
    path: "/assets/sailei/violet-hero-1600.jpg",
    bytes: 287418,
    use: "production",
    role: "Optional violet-accent hero variant",
    notes: "Acceptable for section contrast, not as default theme."
  },
  {
    key: "sailei.lightHero",
    family: "sailei",
    path: "/assets/sailei/light-1400.jpg",
    bytes: 162670,
    use: "production",
    role: "Light paper-style background candidate",
    notes: "Good fit for the paper-milk optional theme."
  },
  {
    key: "sailei.amberHero",
    family: "sailei",
    path: "/assets/sailei/amber-hero.jpg",
    bytes: 86128,
    use: "production",
    role: "Warm accent candidate",
    notes: "Use as a minor warm note, not the main palette."
  },
  {
    key: "sailei.image1",
    family: "sailei",
    path: "/assets/sailei/image1.png",
    bytes: 3339452,
    use: "needs-optimization",
    role: "Legacy large PNG",
    notes: "Do not use above the fold until compressed or converted."
  },
  {
    key: "sailei.image2",
    family: "sailei",
    path: "/assets/sailei/image2.png",
    bytes: 6329711,
    use: "needs-optimization",
    role: "Legacy large PNG",
    notes: "Too large for first-view production use without optimization."
  }
];

export const productionAssets = siteAssets.filter((asset) => asset.use === "production");
export const optimizationQueue = siteAssets.filter((asset) => asset.use === "needs-optimization");
