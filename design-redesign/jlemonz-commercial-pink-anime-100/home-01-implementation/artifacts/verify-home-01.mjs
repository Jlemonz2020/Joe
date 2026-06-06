import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const projectDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary";
const archiveDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/home-01-implementation";
const require = createRequire(`${projectDir}/package.json`);
const { chromium } = require("playwright-core");
const screensDir = path.join(archiveDir, "artifacts", "screens");
const statePath = path.join(archiveDir, "artifacts", "home-01-state.json");
const summaryPath = path.join(archiveDir, "artifacts", "home-01-summary.txt");
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4481";
const edgePath = "/usr/bin/microsoft-edge";

fs.mkdirSync(screensDir, { recursive: true });

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const collectState = async (page) => page.evaluate(() => {
  const doc = document.documentElement;
  const visibleTargets = Array.from(document.querySelectorAll("a, button, [role='button']")).map((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      label: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || element.getAttribute("aria-label") || element.tagName,
      width: rect.width,
      height: rect.height,
      visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"
    };
  }).filter((target) => target.visible);

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    hasConceptDesk: Boolean(document.querySelector(".concept-desk")),
    hasDialog: Boolean(document.querySelector(".concept-dialog")),
    hasCompanion: Boolean(document.querySelector(".concept-companion")),
    taskCount: document.querySelectorAll(".concept-task-card").length,
    panelCount: document.querySelectorAll(".concept-panel").length,
    categoryCount: document.querySelectorAll(".concept-categories a").length,
    bodyText: document.body.textContent || "",
    overflowX: doc.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1,
    smallTargets: visibleTargets.filter((target) => target.width < 44 || target.height < 44),
    scrollHeight: Math.max(doc.scrollHeight, document.body.scrollHeight),
    deskRect: document.querySelector(".concept-desk")?.getBoundingClientRect().toJSON?.() || null
  };
});

const validate = (state) => {
  expect(state.hasConceptDesk, "concept desk missing");
  expect(state.hasDialog, "galgame dialogue missing");
  expect(state.taskCount === 3, `expected 3 task cards, got ${state.taskCount}`);
  expect(state.panelCount === 3, `expected 3 lower panels, got ${state.panelCount}`);
  expect(state.categoryCount === 4, `expected 4 category stickers, got ${state.categoryCount}`);
  expect(state.bodyText.includes("Hi, I'm Jlemonz"), "home-01 hero title missing");
  expect(state.bodyText.includes("PROJECTS IN PROGRESS"), "project panel missing");
  expect(state.bodyText.includes("RECENT MOMENTS"), "moments panel missing");
  expect(state.bodyText.includes("CATEGORY ENTRANCE"), "category panel missing");
  expect(!state.bodyText.includes("黑色终端"), "dark terminal copy leaked into page");
  expect(!state.overflowX, `horizontal overflow at ${state.viewport.width}`);
  expect(state.smallTargets.length === 0, `small interactive targets at ${state.viewport.width}: ${JSON.stringify(state.smallTargets.slice(0, 5))}`);
};

const browser = await chromium.launch({ headless: true, executablePath: edgePath, args: ["--no-sandbox"] });
const results = [];

for (const viewport of [
  { width: 390, height: 900 },
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 }
]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector(".concept-desk", { timeout: 10000 });
  const state = await collectState(page);
  validate(state);
  expect(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);
  const screenshot = path.join(screensDir, `home-01-${viewport.width}.png`);
  await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
  results.push({ viewport, screenshot, state, pageErrors });
  await context.close();
}

await browser.close();

fs.writeFileSync(statePath, `${JSON.stringify(results, null, 2)}\n`);
fs.writeFileSync(summaryPath, [
  "home-01 implementation verification",
  `baseUrl=${baseUrl}`,
  `viewports=${results.map((item) => item.viewport.width).join(",")}`,
  `tasks=${results.map((item) => `${item.viewport.width}:${item.state.taskCount}`).join(",")}`,
  `panels=${results.map((item) => `${item.viewport.width}:${item.state.panelCount}`).join(",")}`,
  `categories=${results.map((item) => `${item.viewport.width}:${item.state.categoryCount}`).join(",")}`,
  "overflowX=false",
  "smallTargets=0"
].join("\n") + "\n");

console.log(fs.readFileSync(summaryPath, "utf8"));
