import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const projectDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary";
const phaseDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-036";
const require = createRequire(`${projectDir}/package.json`);
const { chromium } = require("playwright-core");

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4431";
const edgePath = "/usr/bin/microsoft-edge";
const screensDir = path.join(phaseDir, "artifacts", "screens");
const stateFile = path.join(phaseDir, "artifacts", "home-task-cards-state.json");
const summaryFile = path.join(phaseDir, "artifacts", "home-task-cards-summary.txt");
const livePayloadFile = path.join(phaseDir, "artifacts", "live-github-contributions.json");

if (!fs.existsSync(edgePath)) {
  throw new Error(`Microsoft Edge executable not found at ${edgePath}`);
}

const livePayload = JSON.parse(fs.readFileSync(livePayloadFile, "utf8"));
fs.mkdirSync(screensDir, { recursive: true });

const routeGithubSuccess = async (page) => {
  await page.route("**/api/github/contributions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(livePayload)
    });
  });
};

const collectState = async (page) => page.evaluate(() => {
  const board = document.querySelector(".home-task-board");
  const cards = Array.from(document.querySelectorAll(".home-task-card"));
  const doc = document.documentElement;

  return {
    boardExists: Boolean(board),
    heading: document.querySelector("#home-task-board-title")?.textContent.trim() || "",
    cardCount: cards.length,
    cards: cards.map((card) => {
      const action = card.querySelector(".home-task-card__action");
      const actionRect = action.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      return {
        file: card.querySelector(".home-task-card__file")?.textContent.trim() || "",
        state: card.querySelector(".home-task-card__state")?.textContent.trim() || "",
        title: card.querySelector("h3")?.textContent.replace(/\s+/g, " ").trim() || "",
        copy: card.querySelector("p")?.textContent.trim() || "",
        tags: Array.from(card.querySelectorAll(".home-task-card__tags li")).map((tag) => tag.textContent.trim()),
        action: action?.textContent.replace(/\s+/g, " ").trim() || "",
        href: action?.getAttribute("href") || "",
        actionHeight: actionRect.height,
        width: rect.width,
        height: rect.height
      };
    }),
    oldInlineTicketCards: document.querySelectorAll(".module-grid .diary-card--ticket.panel").length,
    pageOverflowX: doc.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1,
    statusAnimationName: getComputedStyle(document.querySelector(".home-task-card__state i")).animationName,
    cardTransitionDuration: getComputedStyle(document.querySelector(".home-task-card")).transitionDuration
  };
});

const expect = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const expected = {
  files: ["FILE 01", "FILE 02", "FILE 03"],
  states: ["RECAP", "TRACE", "DAILY"],
  titles: ["SYNC复盘档案", "TRACE现场线索", "DAILY日常碎片"],
  hrefs: ["/archive.html", "/projects.html", "/moments.html"]
};

const validateTaskState = (state, viewportWidth) => {
  expect(state.boardExists, "home task board is missing");
  expect(state.heading === "今日记录任务", "board heading changed unexpectedly");
  expect(state.cardCount === 3, `expected 3 task cards, got ${state.cardCount}`);
  expect(state.oldInlineTicketCards === 0, "old inline ticket cards still exist");
  expect(!state.pageOverflowX, `page overflowed horizontally at ${viewportWidth}`);

  for (const [index, card] of state.cards.entries()) {
    expect(card.file === expected.files[index], `file label mismatch at card ${index + 1}`);
    expect(card.state === expected.states[index], `state label mismatch at card ${index + 1}`);
    expect(card.title === expected.titles[index], `title mismatch at card ${index + 1}`);
    expect(card.href === expected.hrefs[index], `href mismatch at card ${index + 1}`);
    expect(card.tags.length === 3, `expected 3 tags at card ${index + 1}`);
    expect(card.copy.length >= 20, `copy is too thin at card ${index + 1}`);
    expect(card.actionHeight >= 44, `action target is smaller than 44px at card ${index + 1}`);
    expect(card.width > 0 && card.height > 0, `card ${index + 1} has invalid size`);
  }
};

const runViewport = async (browser, viewport) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "no-preference"
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await routeGithubSuccess(page);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".home-task-card", { timeout: 10000 });
  await page.waitForSelector("[data-github-sync][data-github-state='ready']", { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  validateTaskState(state, viewport.width);
  expect(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);

  const screenshot = path.join(screensDir, `home-task-cards-${viewport.width}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
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

  await routeGithubSuccess(page);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".home-task-card", { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  validateTaskState(state, 1280);
  expect(state.statusAnimationName === "none", `status animation still active: ${state.statusAnimationName}`);

  const screenshot = path.join(screensDir, "home-task-cards-reduced-motion-1280.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return { viewport: { width: 1280, height: 900 }, screenshot, state };
};

const browser = await chromium.launch({
  headless: true,
  executablePath: edgePath,
  args: ["--no-sandbox"]
});

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
    "Phase 036 home task cards verification",
    `baseUrl=${baseUrl}`,
    `edgePath=${edgePath}`,
    "viewports=390,1280,1920",
    `cardCounts=${results.viewports.map((item) => `${item.viewport.width}:${item.state.cardCount}`).join(",")}`,
    `oldInlineTicketCards=${results.viewports[0].state.oldInlineTicketCards}`,
    `actionsMinHeight=${Math.min(...results.viewports.flatMap((item) => item.state.cards.map((card) => card.actionHeight))).toFixed(2)}`,
    `reducedStatusAnimation=${results.reducedMotion.state.statusAnimationName}`,
    "pageOverflowX=false in all checked cases"
  ].join("\n") + "\n"
);

console.log(fs.readFileSync(summaryFile, "utf8"));
