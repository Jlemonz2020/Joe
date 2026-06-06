import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary/package.json");
const { chromium } = require("playwright-core");

const baseURL = "http://127.0.0.1:4417";
const screensDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-033/screens";
const statePath = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-033/artifacts/home-hero-decor-state.json";
const summaryPath = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-033/artifacts/home-hero-decor-summary.txt";

fs.mkdirSync(screensDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/microsoft-edge"
});

const cases = [
  { name: "home-decor-390", width: 390, height: 1200 },
  { name: "home-decor-1280", width: 1280, height: 1000 },
  { name: "home-decor-1920", width: 1920, height: 1080 }
];

const results = [];

for (const testCase of cases) {
  const page = await browser.newPage({ viewport: { width: testCase.width, height: testCase.height } });
  await page.goto(`${baseURL}/index.html`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${screensDir}/${testCase.name}.png`, fullPage: true });

  const metrics = await page.evaluate(() => {
    const decor = document.querySelector(".home-hero__decor");
    const stickers = Array.from(document.querySelectorAll(".home-hero__sticker"));
    const hero = document.querySelector(".home-hero");
    const dialog = document.querySelector(".home-hero__dialog");
    const portraitFrame = document.querySelector(".home-hero__portrait-frame");
    const bodyBefore = window.getComputedStyle(document.body, "::before");
    const heroBefore = hero ? window.getComputedStyle(hero, "::before") : null;
    const dialogBefore = dialog ? window.getComputedStyle(dialog, "::before") : null;
    const portraitBefore = portraitFrame ? window.getComputedStyle(portraitFrame, "::before") : null;
    return {
      hasDecor: Boolean(decor),
      hudLines: document.querySelectorAll(".home-hero__hud-line").length,
      stickerDisplay: stickers.map((sticker) => window.getComputedStyle(sticker).display),
      bodyBackgroundPosition: bodyBefore.backgroundPosition,
      heroBeforeBackground: heroBefore?.backgroundImage || "",
      dialogBeforeBackground: dialogBefore?.backgroundImage || "",
      portraitBeforeBackground: portraitBefore?.backgroundImage || "",
      overflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });

  if (!metrics.hasDecor || metrics.hudLines !== 2) {
    throw new Error(`${testCase.name} missing decorative HUD layers`);
  }
  if (!metrics.heroBeforeBackground.includes("radial-gradient")) {
    throw new Error(`${testCase.name} missing Hero glow layer`);
  }
  if (!metrics.dialogBeforeBackground.includes("linear-gradient")) {
    throw new Error(`${testCase.name} missing dialogue paper/HUD texture`);
  }
  if (!metrics.portraitBeforeBackground.includes("linear-gradient")) {
    throw new Error(`${testCase.name} missing portrait HUD texture`);
  }
  if (metrics.overflow) {
    throw new Error(`${testCase.name} has horizontal overflow`);
  }
  if (testCase.width < 900 && !metrics.stickerDisplay.every((display) => display === "none")) {
    throw new Error(`${testCase.name} mobile stickers should be hidden`);
  }
  if (testCase.width >= 900 && !metrics.stickerDisplay.every((display) => display !== "none")) {
    throw new Error(`${testCase.name} desktop stickers should be visible`);
  }

  results.push({ name: testCase.name, ...metrics });
  await page.close();
}

await browser.close();

fs.writeFileSync(statePath, JSON.stringify(results, null, 2));
fs.writeFileSync(
  summaryPath,
  results.map((item) => `${item.name}: decor=${item.hasDecor} hudLines=${item.hudLines} stickers=${item.stickerDisplay.join(",")} fixedBodyPosition=${item.bodyBackgroundPosition} overflow=${item.overflow}`).join("\n")
);
console.log(fs.readFileSync(summaryPath, "utf8"));
