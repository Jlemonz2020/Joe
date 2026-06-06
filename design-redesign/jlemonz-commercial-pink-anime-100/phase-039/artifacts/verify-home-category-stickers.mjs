import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const projectDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary";
const phaseDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-039";
const require = createRequire(`${projectDir}/package.json`);
const { chromium } = require("playwright-core");

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4461";
const edgePath = "/usr/bin/microsoft-edge";
const screensDir = path.join(phaseDir, "artifacts", "screens");
const stateFile = path.join(phaseDir, "artifacts", "home-category-stickers-state.json");
const summaryFile = path.join(phaseDir, "artifacts", "home-category-stickers-summary.txt");

if (!fs.existsSync(edgePath)) {
  throw new Error(`Microsoft Edge executable not found at ${edgePath}`);
}

fs.mkdirSync(screensDir, { recursive: true });

const routeStableHomeApis = async (page) => {
  await page.route("**/api/github/contributions", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ username: "Jlemonz2020", total: 0, days: [] }) });
  });
  await page.route("**/api/projects", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
  });
  await page.route("**/api/moments", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
  });
};

const collectState = async (page) => page.evaluate(() => {
  const root = document.querySelector("[data-home-categories]");
  const cards = Array.from(document.querySelectorAll(".home-category-sticker"));
  const doc = document.documentElement;

  return {
    exists: Boolean(root),
    rulesCount: Number(root?.dataset.rulesCount || 0),
    heading: document.querySelector("#home-category-title")?.textContent.trim() || "",
    count: cards.length,
    labels: cards.map((card) => card.querySelector("strong")?.textContent.trim() || ""),
    codes: cards.map((card) => card.querySelector(".home-category-sticker__code")?.textContent.trim() || ""),
    hrefs: cards.map((card) => card.getAttribute("href") || ""),
    heights: cards.map((card) => card.getBoundingClientRect().height),
    widths: cards.map((card) => card.getBoundingClientRect().width),
    placeholderVisible: document.body.textContent.includes("新分类"),
    pageOverflowX: doc.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1,
    transitionDuration: cards[0] ? getComputedStyle(cards[0]).transitionDuration : ""
  };
});

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const expectedLabels = ["Linux", "硬件/裸机", "RTOS", "生活"];
const expectedHrefs = [
  "/archive.html?category=Linux",
  "/projects.html",
  "/archive.html?category=RTOS",
  "/moments.html?kind=life"
];

const validateState = (state, viewportWidth) => {
  expect(state.exists, "category stickers root is missing");
  expect(state.rulesCount >= 5, "category rules are not wired");
  expect(state.heading === "分类入口", "category heading mismatch");
  expect(state.count === 4, `expected 4 categories, got ${state.count}`);
  expect(JSON.stringify(state.labels) === JSON.stringify(expectedLabels), `labels mismatch: ${state.labels.join(",")}`);
  expect(JSON.stringify(state.hrefs) === JSON.stringify(expectedHrefs), `hrefs mismatch: ${state.hrefs.join(",")}`);
  expect(state.heights.every((height) => height >= 44), "a category touch target is below 44px");
  expect(!state.placeholderVisible, "placeholder category is visible");
  expect(!state.pageOverflowX, `page overflowed horizontally at ${viewportWidth}`);
};

const runViewport = async (browser, viewport) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await routeStableHomeApis(page);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".home-category-sticker", { timeout: 10000 });
  await page.locator(".home-category-stickers").scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  validateState(state, viewport.width);
  expect(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);

  const screenshot = path.join(screensDir, `home-category-stickers-${viewport.width}.png`);
  await page.locator(".home-category-stickers").screenshot({ path: screenshot });
  await context.close();

  return { viewport, screenshot, state, pageErrors };
};

const runReducedMotion = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
  });
  const page = await context.newPage();

  await routeStableHomeApis(page);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".home-category-sticker", { timeout: 10000 });
  await page.locator(".home-category-stickers").scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  validateState(state, 1280);
  expect(state.transitionDuration.includes("0.001s") || state.transitionDuration.includes("1ms"), `reduced transition duration mismatch: ${state.transitionDuration}`);

  const screenshot = path.join(screensDir, "home-category-stickers-reduced-motion-1280.png");
  await page.locator(".home-category-stickers").screenshot({ path: screenshot });
  await context.close();

  return { viewport: { width: 1280, height: 900 }, screenshot, state };
};

const browser = await chromium.launch({ headless: true, executablePath: edgePath, args: ["--no-sandbox"] });

const results = {
  baseUrl,
  edgePath,
  viewports: [],
  reducedMotion: null
};

for (const viewport of [
  { width: 390, height: 900 },
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 }
]) {
  results.viewports.push(await runViewport(browser, viewport));
}

results.reducedMotion = await runReducedMotion(browser);
await browser.close();

fs.writeFileSync(stateFile, `${JSON.stringify(results, null, 2)}\n`);
fs.writeFileSync(
  summaryFile,
  [
    "Phase 039 home category stickers verification",
    `baseUrl=${baseUrl}`,
    `edgePath=${edgePath}`,
    "viewports=390,1280,1920",
    `categoryCounts=${results.viewports.map((item) => `${item.viewport.width}:${item.state.count}`).join(",")}`,
    `labels=${results.viewports[0].state.labels.join("|")}`,
    `minHeight=${Math.min(...results.viewports.flatMap((item) => item.state.heights)).toFixed(2)}`,
    `reducedTransitionDuration=${results.reducedMotion.state.transitionDuration}`,
    "placeholderVisible=false",
    "pageOverflowX=false in all checked cases"
  ].join("\n") + "\n"
);

console.log(fs.readFileSync(summaryFile, "utf8"));
