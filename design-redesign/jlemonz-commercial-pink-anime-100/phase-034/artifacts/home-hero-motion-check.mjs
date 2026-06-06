import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary/package.json");
const { chromium } = require("playwright-core");

const baseURL = "http://127.0.0.1:4419";
const screensDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-034/screens";
const statePath = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-034/artifacts/home-hero-motion-state.json";
const summaryPath = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-034/artifacts/home-hero-motion-summary.txt";

fs.mkdirSync(screensDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/microsoft-edge"
});

const cases = [
  { name: "home-motion-390", width: 390, height: 1200 },
  { name: "home-motion-1280", width: 1280, height: 1000 },
  { name: "home-motion-1920", width: 1920, height: 1080 }
];

const results = [];

for (const testCase of cases) {
  const page = await browser.newPage({ viewport: { width: testCase.width, height: testCase.height } });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${baseURL}/index.html`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${screensDir}/${testCase.name}.png`, fullPage: true });

  const metrics = await page.evaluate(() => {
    const styleOf = (selector, pseudo = null) => {
      const element = document.querySelector(selector);
      if (!element) return "";
      return window.getComputedStyle(element, pseudo).animationName;
    };
    const bodyBefore = window.getComputedStyle(document.body, "::before");
    const beforeScrollPosition = bodyBefore.backgroundPosition;
    window.scrollTo(0, 520);
    const afterScrollPosition = window.getComputedStyle(document.body, "::before").backgroundPosition;
    return {
      dialogAnimation: styleOf(".home-hero__dialog"),
      companionAnimation: styleOf(".home-hero__companion"),
      choiceAnimation: styleOf(".home-hero__choice"),
      hudAnimation: styleOf(".home-hero__hud-line"),
      dotAnimation: styleOf(".home-hero__nameplate span:last-child", "::before"),
      portraitGlowAnimation: styleOf(".home-hero__portrait-frame", "::after"),
      beforeScrollPosition,
      afterScrollPosition,
      overflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });

  const expected = [
    ["dialogAnimation", "home-hero-panel-in"],
    ["companionAnimation", "home-hero-panel-in"],
    ["choiceAnimation", "home-hero-choice-in"],
    ["hudAnimation", "home-hero-hud-breathe"],
    ["dotAnimation", "home-hero-status-dot"],
    ["portraitGlowAnimation", "home-hero-portrait-glow"]
  ];

  for (const [key, value] of expected) {
    if (!metrics[key]?.includes(value)) {
      throw new Error(`${testCase.name} missing ${value}, got ${metrics[key]}`);
    }
  }
  if (metrics.beforeScrollPosition !== metrics.afterScrollPosition) {
    throw new Error(`${testCase.name} background position changed after scroll`);
  }
  if (metrics.overflow) {
    throw new Error(`${testCase.name} has horizontal overflow`);
  }

  results.push({ name: testCase.name, mode: "no-preference", ...metrics });
  await page.close();
}

const reducePage = await browser.newPage({ viewport: { width: 390, height: 1200 } });
await reducePage.emulateMedia({ reducedMotion: "reduce" });
await reducePage.goto(`${baseURL}/index.html`, { waitUntil: "networkidle" });
await reducePage.screenshot({ path: `${screensDir}/home-motion-reduce-390.png`, fullPage: true });

const reduceMetrics = await reducePage.evaluate(() => {
  const animationName = (selector, pseudo = null) => {
    const element = document.querySelector(selector);
    if (!element) return "";
    return window.getComputedStyle(element, pseudo).animationName;
  };
  return {
    dialogAnimation: animationName(".home-hero__dialog"),
    companionAnimation: animationName(".home-hero__companion"),
    choiceAnimation: animationName(".home-hero__choice"),
    hudAnimation: animationName(".home-hero__hud-line"),
    dotAnimation: animationName(".home-hero__nameplate span:last-child", "::before"),
    portraitGlowAnimation: animationName(".home-hero__portrait-frame", "::after"),
    overflow: document.documentElement.scrollWidth > window.innerWidth
  };
});

for (const [key, value] of Object.entries(reduceMetrics)) {
  if (key !== "overflow" && value !== "none") {
    throw new Error(`reduced motion should disable ${key}, got ${value}`);
  }
}
if (reduceMetrics.overflow) {
  throw new Error("reduced motion viewport has horizontal overflow");
}

results.push({ name: "home-motion-reduce-390", mode: "reduce", ...reduceMetrics });
await reducePage.close();
await browser.close();

fs.writeFileSync(statePath, JSON.stringify(results, null, 2));
fs.writeFileSync(
  summaryPath,
  results.map((item) => `${item.name}: mode=${item.mode} dialog=${item.dialogAnimation} choice=${item.choiceAnimation} hud=${item.hudAnimation} reduceDot=${item.dotAnimation} overflow=${item.overflow}`).join("\n")
);
console.log(fs.readFileSync(summaryPath, "utf8"));
