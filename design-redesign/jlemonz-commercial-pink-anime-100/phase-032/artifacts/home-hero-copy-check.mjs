import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary/package.json");
const { chromium } = require("playwright-core");

const baseURL = "http://127.0.0.1:4415";
const screensDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-032/screens";
const statePath = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-032/artifacts/home-hero-copy-state.json";
const summaryPath = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-032/artifacts/home-hero-copy-summary.txt";

fs.mkdirSync(screensDir, { recursive: true });

const requiredCopy = [
  "Pi5 / Linux / AI",
  "赛蕾留言",
  "今日在线",
  "先把今天的线索贴好，下一次回来还能接着查。",
  "看项目",
  "角色资料",
  "把 Pi5、Linux、硬件和 AI 的折腾收进手帐，陪我慢慢补课。",
  "长期记录",
  "粉色手帐"
];

const rejectedCopy = [
  "Sailei's Whisper",
  "CONNECTED",
  "COMPANION FILE",
  "查项目",
  "技术日记",
  "粉色赛蕾",
  "冷冰冰"
];

const cases = [
  { name: "home-copy-390", width: 390, height: 1200 },
  { name: "home-copy-1280", width: 1280, height: 1000 },
  { name: "home-copy-1920", width: 1920, height: 1080 }
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/microsoft-edge"
});

const results = [];

for (const testCase of cases) {
  const page = await browser.newPage({ viewport: { width: testCase.width, height: testCase.height } });
  await page.goto(`${baseURL}/index.html`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${screensDir}/${testCase.name}.png`, fullPage: true });

  const text = await page.locator(".home-hero").innerText();
  for (const copy of requiredCopy) {
    if (!text.includes(copy)) {
      throw new Error(`${testCase.name} missing copy: ${copy}`);
    }
  }

  for (const copy of rejectedCopy) {
    if (text.includes(copy)) {
      throw new Error(`${testCase.name} still contains old copy: ${copy}`);
    }
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) {
    throw new Error(`${testCase.name} has horizontal overflow`);
  }

  const buttonWidths = await page.locator(".home-hero__choice").evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: node.textContent?.replace(/\s+/g, " ").trim() || "",
      width: node.getBoundingClientRect().width,
      scrollWidth: node.scrollWidth
    }))
  );

  const clipped = buttonWidths.find((item) => item.scrollWidth > Math.ceil(item.width) + 1);
  if (clipped) {
    throw new Error(`${testCase.name} clipped button text: ${clipped.text}`);
  }

  results.push({
    name: testCase.name,
    overflow,
    heroTextLength: text.length,
    buttons: buttonWidths
  });
  await page.close();
}

await browser.close();

fs.writeFileSync(statePath, JSON.stringify(results, null, 2));
fs.writeFileSync(summaryPath, results.map((item) => `${item.name}: overflow=${item.overflow} heroTextLength=${item.heroTextLength} buttons=${item.buttons.map((button) => button.text).join(" | ")}`).join("\n"));
console.log(fs.readFileSync(summaryPath, "utf8"));
