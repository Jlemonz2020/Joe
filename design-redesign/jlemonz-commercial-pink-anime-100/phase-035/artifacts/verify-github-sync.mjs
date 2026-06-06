import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const projectDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary";
const phaseDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-035";
const require = createRequire(`${projectDir}/package.json`);
const { chromium } = require("playwright-core");

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4421";
const edgePath = "/usr/bin/microsoft-edge";
const screensDir = path.join(phaseDir, "artifacts", "screens");
const stateFile = path.join(phaseDir, "artifacts", "github-sync-state.json");
const summaryFile = path.join(phaseDir, "artifacts", "github-sync-summary.txt");
const livePayloadFile = path.join(phaseDir, "artifacts", "live-github-contributions.json");

if (!fs.existsSync(edgePath)) {
  throw new Error(`Microsoft Edge executable not found at ${edgePath}`);
}

fs.mkdirSync(screensDir, { recursive: true });

const livePayload = JSON.parse(fs.readFileSync(livePayloadFile, "utf8"));
if (!livePayload || !Array.isArray(livePayload.days) || livePayload.days.length === 0) {
  throw new Error("live GitHub payload is missing contribution days");
}

const routeGithubSuccess = async (page) => {
  await page.route("**/api/github/contributions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(livePayload)
    });
  });
};

const routeGithubFailure = async (page) => {
  await page.route("**/api/github/contributions", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false })
    });
  });
};

const collectState = async (page) => page.evaluate(() => {
  const root = document.querySelector("[data-github-sync]");
  const grid = document.querySelector("[data-github-grid]");
  const wrap = document.querySelector(".github-sync__grid-wrap");
  const section = document.querySelector(".github-sync");
  const stamp = document.querySelector(".github-sync__stamp");
  const firstCell = document.querySelector(".github-sync__cell");
  const fallback = document.querySelector("[data-github-fallback]");
  const note = document.querySelector("[data-github-note]");
  const doc = document.documentElement;
  const sectionRect = section.getBoundingClientRect();

  return {
    state: root.dataset.githubState,
    rulesCount: Number(root.dataset.rulesCount || 0),
    user: document.querySelector("[data-github-user]").textContent.trim(),
    total: document.querySelector("[data-github-total]").textContent.trim(),
    range: document.querySelector("[data-github-range]").textContent.trim(),
    status: document.querySelector("[data-github-status]").textContent.trim(),
    fallbackVisible: fallback ? !fallback.hidden : false,
    fallbackText: fallback ? fallback.textContent.trim() : "",
    noteText: note ? note.textContent.trim() : "",
    cells: grid.querySelectorAll(".github-sync__cell").length,
    activeCells: grid.querySelectorAll(".github-sync__cell[data-level]").length,
    mutedCells: grid.querySelectorAll(".github-sync__cell--muted").length,
    maxLevel: Math.max(...Array.from(grid.querySelectorAll(".github-sync__cell[data-level]")).map((cell) => Number(cell.dataset.level || 0)), 0),
    pageOverflowX: doc.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1,
    sectionWithinViewport: sectionRect.left >= -1 && sectionRect.right <= window.innerWidth + 1,
    gridScrollableWidth: wrap.scrollWidth,
    gridClientWidth: wrap.clientWidth,
    cellAnimationName: firstCell ? getComputedStyle(firstCell).animationName : "",
    stampAnimationName: stamp ? getComputedStyle(stamp, "::before").animationName : ""
  };
});

const expect = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runReadyCase = async (browser, viewport) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "no-preference"
  });
  const page = await context.newPage();
  const browserMessages = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await routeGithubSuccess(page);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-github-sync][data-github-state='ready']", { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  expect(state.state === "ready", `ready case did not enter ready state at ${viewport.width}`);
  expect(state.rulesCount >= 5, "rules file is not wired into the component");
  expect(state.user === "Jlemonz2020", "username did not come from payload");
  expect(state.total === String(livePayload.total ?? 0), "total did not come from live payload");
  expect(state.cells === 98, `expected 98 cells, got ${state.cells}`);
  expect(state.activeCells === 98, `expected 98 active cells, got ${state.activeCells}`);
  expect(state.maxLevel >= 3, "live payload did not produce visible strong activity levels");
  expect(state.noteText.includes("最近 98 天"), "ready note did not summarize the recent range");
  expect(!state.pageOverflowX, `page overflowed horizontally at ${viewport.width}`);
  expect(state.sectionWithinViewport, `github sync section escaped viewport at ${viewport.width}`);
  expect(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);

  const screenshot = path.join(screensDir, `github-sync-ready-${viewport.width}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return {
    viewport,
    screenshot,
    browserMessages,
    pageErrors,
    state
  };
};

const runFallbackCase = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference"
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await routeGithubFailure(page);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-github-sync][data-github-state='fallback']", { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  expect(state.state === "fallback", "fallback case did not enter fallback state");
  expect(state.fallbackVisible, "fallback message is hidden");
  expect(state.fallbackText.includes("稍后"), "fallback copy is not warm enough");
  expect(state.noteText.includes("等下次同步"), "fallback note did not explain retry state");
  expect(state.cells === 49, `expected 49 muted fallback cells, got ${state.cells}`);
  expect(state.mutedCells === 49, `expected 49 muted cells, got ${state.mutedCells}`);
  expect(!state.pageOverflowX, "fallback page overflowed horizontally");
  expect(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);

  const screenshot = path.join(screensDir, "github-sync-fallback-390.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return {
    viewport: { width: 390, height: 900 },
    screenshot,
    pageErrors,
    state
  };
};

const runReducedMotionCase = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
  });
  const page = await context.newPage();

  await routeGithubSuccess(page);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-github-sync][data-github-state='ready']", { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  expect(state.cellAnimationName === "none", `cell animation still active: ${state.cellAnimationName}`);
  expect(state.stampAnimationName === "none", `stamp animation still active: ${state.stampAnimationName}`);
  expect(!state.pageOverflowX, "reduced-motion page overflowed horizontally");

  const screenshot = path.join(screensDir, "github-sync-reduced-motion-1280.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return {
    viewport: { width: 1280, height: 900 },
    screenshot,
    state
  };
};

const browser = await chromium.launch({
  headless: true,
  executablePath: edgePath,
  args: ["--no-sandbox"]
});

const results = {
  baseUrl,
  edgePath,
  livePayload: {
    username: livePayload.username,
    total: livePayload.total,
    days: livePayload.days.length,
    firstDate: livePayload.days[0]?.date,
    lastDate: livePayload.days.at(-1)?.date
  },
  ready: [],
  fallback: null,
  reducedMotion: null
};

for (const viewport of [
  { width: 390, height: 900 },
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 }
]) {
  results.ready.push(await runReadyCase(browser, viewport));
}

results.fallback = await runFallbackCase(browser);
results.reducedMotion = await runReducedMotionCase(browser);

await browser.close();

fs.writeFileSync(stateFile, `${JSON.stringify(results, null, 2)}\n`);
fs.writeFileSync(
  summaryFile,
  [
    "Phase 035 GitHub sync grid verification",
    `baseUrl=${baseUrl}`,
    `edgePath=${edgePath}`,
    `liveUsername=${livePayload.username}`,
    `liveTotal=${livePayload.total}`,
    `liveDays=${livePayload.days.length}`,
    "readyViewports=390,1280,1920",
    `readyCells=${results.ready.map((item) => `${item.viewport.width}:${item.state.cells}`).join(",")}`,
    `fallbackCells=${results.fallback.state.cells}`,
    `reducedCellAnimation=${results.reducedMotion.state.cellAnimationName}`,
    `reducedStampAnimation=${results.reducedMotion.state.stampAnimationName}`,
    "pageOverflowX=false in all checked cases"
  ].join("\n") + "\n"
);

console.log(fs.readFileSync(summaryFile, "utf8"));
