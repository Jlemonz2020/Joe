import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary/package.json");
const { chromium } = require("playwright-core");

const baseURL = "http://127.0.0.1:4413";
const screensDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-031/screens";
const statePath = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-031/artifacts/home-hero-state.json";
const summaryPath = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-031/artifacts/home-hero-summary.txt";

fs.mkdirSync(screensDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/microsoft-edge"
});

const cases = [
  { name: "home-hero-390", width: 390, height: 1200 },
  { name: "home-hero-1280", width: 1280, height: 1000 },
  { name: "home-hero-1920", width: 1920, height: 1080 }
];

const results = [];

for (const testCase of cases) {
  const page = await browser.newPage({ viewport: { width: testCase.width, height: testCase.height } });
  await page.goto(`${baseURL}/index.html`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${screensDir}/${testCase.name}.png`, fullPage: true });

  const hero = page.locator(".home-hero");
  await hero.waitFor({ state: "visible" });

  const metrics = await page.evaluate(() => {
    const heroEl = document.querySelector(".home-hero");
    const companion = document.querySelector(".home-hero__companion");
    const portrait = document.querySelector(".home-hero__portrait-frame img");
    const firstCard = document.querySelector(".module-grid");
    const rect = heroEl?.getBoundingClientRect();
    const companionRect = companion?.getBoundingClientRect();
    const firstCardRect = firstCard?.getBoundingClientRect();
    return {
      title: document.querySelector("#home-hero-title")?.textContent?.trim(),
      choiceCount: document.querySelectorAll(".home-hero__choice").length,
      hasCompanion: Boolean(companion),
      hasPortrait: Boolean(portrait),
      heroHeight: rect?.height || 0,
      heroTop: rect?.top || 0,
      heroBottom: rect?.bottom || 0,
      companionWidth: companionRect?.width || 0,
      firstModuleTop: firstCardRect?.top || 0,
      overflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });

  if (metrics.title !== "Jlemonz") {
    throw new Error(`${testCase.name} missing hero title`);
  }
  if (metrics.choiceCount !== 3) {
    throw new Error(`${testCase.name} expected 3 hero choices, got ${metrics.choiceCount}`);
  }
  if (!metrics.hasCompanion || !metrics.hasPortrait) {
    throw new Error(`${testCase.name} missing companion card or portrait`);
  }
  if (metrics.overflow) {
    throw new Error(`${testCase.name} has horizontal overflow`);
  }
  if (testCase.width >= 900 && metrics.companionWidth < 280) {
    throw new Error(`${testCase.name} companion card too narrow: ${metrics.companionWidth}`);
  }

  results.push({ name: testCase.name, ...metrics });
  await page.close();
}

await browser.close();

fs.writeFileSync(statePath, JSON.stringify(results, null, 2));
fs.writeFileSync(
  summaryPath,
  results
    .map((item) => `${item.name}: title=${item.title} choices=${item.choiceCount} companion=${item.hasCompanion} portrait=${item.hasPortrait} overflow=${item.overflow} heroHeight=${Math.round(item.heroHeight)} firstModuleTop=${Math.round(item.firstModuleTop)}`)
    .join("\n")
);
console.log(fs.readFileSync(summaryPath, "utf8"));
