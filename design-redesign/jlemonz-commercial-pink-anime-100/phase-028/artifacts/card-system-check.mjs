import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require = createRequire("/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary/package.json");
const { chromium } = require("playwright-core");

const baseUrl = process.argv[2] || "http://127.0.0.1:4407";
const phaseRoot = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-028";
const browser = await chromium.launch({
  executablePath: "/usr/bin/microsoft-edge",
  headless: true
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1
});
const page = await context.newPage();
const paths = [
  { path: "/index.html", name: "index" },
  { path: "/moments.html", name: "moments" },
  { path: "/archive.html", name: "archive" },
  { path: "/projects.html", name: "projects" }
];
const results = [];

async function inspect(label) {
  return page.evaluate((label) => {
    const cards = [...document.querySelectorAll(".diary-card")].map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        className: card.className,
        width: rect.width,
        height: rect.height,
        text: card.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || ""
      };
    });
    return {
      label,
      cardCount: cards.length,
      variants: [...new Set(cards.flatMap((card) => card.className.split(/\s+/).filter((item) => item.startsWith("diary-card--"))))].sort(),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      cards
    };
  }, label);
}

for (const item of paths) {
  await page.goto(`${baseUrl}${item.path}`, { waitUntil: "networkidle" });
  results.push(await inspect(`${item.name}-1440`));
  await page.screenshot({
    path: `${phaseRoot}/screens/cards-${item.name}-1440.png`,
    fullPage: false
  });
}

await page.setViewportSize({ width: 390, height: 1100 });
await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
results.push(await inspect("index-390"));
await page.screenshot({
  path: `${phaseRoot}/screens/cards-index-390.png`,
  fullPage: false
});

await browser.close();

await writeFile(`${phaseRoot}/artifacts/card-system-state.json`, `${JSON.stringify(results, null, 2)}\n`);
await writeFile(`${phaseRoot}/artifacts/card-system-summary.txt`, results.map((item) => {
  return `${item.label}: cards=${item.cardCount} variants=${item.variants.join(",")} overflow=${item.horizontalOverflow}`;
}).join("\n") + "\n");

const failures = [];
for (const item of results) {
  if (item.cardCount < 1) {
    failures.push(`${item.label}: no diary cards found`);
  }
  if (item.horizontalOverflow) {
    failures.push(`${item.label}: horizontal overflow detected`);
  }
  for (const card of item.cards) {
    if (card.width < 240 && item.label.endsWith("1440")) {
      failures.push(`${item.label}: card too narrow on desktop`);
    }
    if (!card.className.includes("diary-card--")) {
      failures.push(`${item.label}: card missing variant ${card.className}`);
    }
  }
}

const allVariants = new Set(results.flatMap((item) => item.variants));
for (const required of ["diary-card--glass", "diary-card--ticket", "diary-card--tape", "diary-card--paper"]) {
  if (!allVariants.has(required)) {
    failures.push(`missing applied variant ${required}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Card system checks passed for ${results.length} layouts.`);
