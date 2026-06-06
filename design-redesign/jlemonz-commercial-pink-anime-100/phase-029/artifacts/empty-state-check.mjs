import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require = createRequire("/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary/package.json");
const { chromium } = require("playwright-core");

const baseUrl = process.argv[2] || "http://127.0.0.1:4409";
const phaseRoot = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-029";
const browser = await chromium.launch({
  executablePath: "/usr/bin/microsoft-edge",
  headless: true
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1
});
const page = await context.newPage();
const pages = [
  { path: "/index.html", name: "index" },
  { path: "/archive.html", name: "archive" },
  { path: "/moments.html", name: "moments" },
  { path: "/projects.html", name: "projects" },
  { path: "/post.html", name: "post" }
];
const results = [];

async function inspect(label) {
  return page.evaluate((label) => {
    const states = [...document.querySelectorAll("[data-empty-tone]")].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        tone: node.getAttribute("data-empty-tone"),
        label: node.getAttribute("aria-label"),
        ribbon: node.querySelector(".empty-ribbon")?.textContent?.trim() || "",
        title: node.querySelector("strong")?.textContent?.trim() || "",
        body: node.querySelector("p")?.textContent?.trim() || "",
        width: rect.width,
        height: rect.height
      };
    });
    return {
      label,
      stateCount: states.length,
      states,
      text: document.body.textContent || "",
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  }, label);
}

for (const item of pages) {
  await page.goto(`${baseUrl}${item.path}`, { waitUntil: "networkidle" });
  results.push(await inspect(`${item.name}-1440`));
  await page.screenshot({
    path: `${phaseRoot}/screens/empty-${item.name}-1440.png`,
    fullPage: false
  });
}

await page.setViewportSize({ width: 390, height: 1100 });
await page.goto(`${baseUrl}/archive.html`, { waitUntil: "networkidle" });
results.push(await inspect("archive-390"));
await page.screenshot({
  path: `${phaseRoot}/screens/empty-archive-390.png`,
  fullPage: false
});

await browser.close();

await writeFile(`${phaseRoot}/artifacts/empty-state-state.json`, `${JSON.stringify(results, null, 2)}\n`);
await writeFile(`${phaseRoot}/artifacts/empty-state-summary.txt`, results.map((item) => {
  const states = item.states.map((state) => `${state.tone}:${state.title}`).join(" | ");
  return `${item.label}: count=${item.stateCount} overflow=${item.horizontalOverflow} states=${states}`;
}).join("\n") + "\n");

const forbidden = ["暂无", "暂无数据", "No data"];
const failures = [];
for (const item of results) {
  if (item.stateCount < 1) {
    failures.push(`${item.label}: no empty state found`);
  }
  if (item.horizontalOverflow) {
    failures.push(`${item.label}: horizontal overflow detected`);
  }
  for (const phrase of forbidden) {
    if (item.text.includes(phrase)) {
      failures.push(`${item.label}: forbidden empty phrase found: ${phrase}`);
    }
  }
  for (const state of item.states) {
    if (!state.tone || !state.ribbon || !state.title || !state.body) {
      failures.push(`${item.label}: incomplete empty state ${JSON.stringify(state)}`);
    }
    if (state.width < 260 && item.label.endsWith("1440")) {
      failures.push(`${item.label}: empty state too narrow on desktop`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Empty state checks passed for ${results.length} layouts.`);
