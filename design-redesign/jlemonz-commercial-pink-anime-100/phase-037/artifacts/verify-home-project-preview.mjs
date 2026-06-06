import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const projectDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary";
const phaseDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-037";
const require = createRequire(`${projectDir}/package.json`);
const { chromium } = require("playwright-core");

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4441";
const edgePath = "/usr/bin/microsoft-edge";
const screensDir = path.join(phaseDir, "artifacts", "screens");
const stateFile = path.join(phaseDir, "artifacts", "home-project-preview-state.json");
const summaryFile = path.join(phaseDir, "artifacts", "home-project-preview-summary.txt");
const liveProjectsFile = path.join(phaseDir, "artifacts", "live-projects.json");
const liveGithubFile = path.join(phaseDir, "artifacts", "live-github-contributions.json");

if (!fs.existsSync(edgePath)) {
  throw new Error(`Microsoft Edge executable not found at ${edgePath}`);
}

const liveProjects = JSON.parse(fs.readFileSync(liveProjectsFile, "utf8"));
const liveGithub = JSON.parse(fs.readFileSync(liveGithubFile, "utf8"));
fs.mkdirSync(screensDir, { recursive: true });

const fixtureProjects = {
  items: [
    {
      id: "pi5-panel",
      slug: "pi5-panel",
      title: "Pi5 服务面板",
      summary: "把 Pi5 上的站点、接口和监控入口收成一张任务档案。",
      status: "active",
      progress: 72,
      tags: ["Pi5", "服务", "Linux"]
    },
    {
      id: "sailei-diary",
      slug: "sailei-diary",
      title: "赛蕾手帐改版",
      summary: "把首页组件语言改成粉色贴纸、任务板和角色陪伴感。",
      status: "planning",
      progress: 38,
      tags: ["前端", "二次元", "视觉"]
    },
    {
      id: "hardware-log",
      slug: "hardware-log",
      title: "硬件记录台",
      summary: "把裸机、驱动和硬件折腾留下进度、状态和下一步。",
      status: "paused",
      progress: 15,
      tags: ["硬件", "调试", "记录"]
    },
    {
      id: "hidden-fourth",
      title: "不应显示的第四条",
      summary: "首页最多只显示三条项目。",
      status: "active",
      progress: 99,
      tags: ["限制"]
    }
  ]
};

const routeCommon = async (page) => {
  await page.route("**/api/github/contributions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(liveGithub)
    });
  });
};

const routeProjects = async (page, payload) => {
  await page.route("**/api/projects", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload)
    });
  });
};

const collectState = async (page) => page.evaluate(() => {
  const root = document.querySelector("[data-home-projects]");
  const cards = Array.from(document.querySelectorAll(".home-project-card:not(.home-project-card--loading)"));
  const empty = document.querySelector("[data-project-empty]");
  const statusDot = document.querySelector(".home-project-preview__status i");
  const doc = document.documentElement;

  return {
    exists: Boolean(root),
    state: root?.dataset.projectState || "",
    rulesCount: Number(root?.dataset.rulesCount || 0),
    heading: document.querySelector("#home-project-preview-title")?.textContent.trim() || "",
    statusText: document.querySelector("[data-project-status] span")?.textContent.trim() || "",
    emptyVisible: empty ? !empty.hidden : false,
    emptyText: empty?.textContent.replace(/\s+/g, " ").trim() || "",
    loadingCards: document.querySelectorAll(".home-project-card--loading").length,
    cards: cards.map((card) => {
      const link = card.querySelector(".home-project-card__link");
      const linkRect = link.getBoundingClientRect();
      const meter = card.querySelector(".home-project-card__meter");
      return {
        title: card.querySelector("h3")?.textContent.trim() || "",
        status: card.querySelector(".home-project-card__topline strong")?.textContent.trim() || "",
        summary: card.querySelector("p")?.textContent.trim() || "",
        tags: Array.from(card.querySelectorAll(".home-project-card__tags li")).map((tag) => tag.textContent.trim()),
        href: link?.getAttribute("href") || "",
        linkText: link?.textContent.replace(/\s+/g, " ").trim() || "",
        linkHeight: linkRect.height,
        progress: meter?.getAttribute("aria-valuenow") || ""
      };
    }),
    cardCount: cards.length,
    fourthProjectVisible: document.body.textContent.includes("不应显示的第四条"),
    pageOverflowX: doc.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1,
    statusAnimationName: statusDot ? getComputedStyle(statusDot).animationName : ""
  };
});

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const validateCommon = (state, viewportWidth) => {
  expect(state.exists, "project preview root is missing");
  expect(state.rulesCount >= 5, "project preview rules are not wired");
  expect(state.heading === "项目进行中", "project preview heading mismatch");
  expect(!state.pageOverflowX, `page overflowed horizontally at ${viewportWidth}`);
};

const runEmptyCase = async (browser, viewport) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "no-preference"
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await routeCommon(page);
  await routeProjects(page, liveProjects);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-home-projects][data-project-state='empty']", { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  validateCommon(state, viewport.width);
  expect(state.emptyVisible, "empty state is hidden");
  expect(state.cardCount === 0, `empty case rendered ${state.cardCount} project cards`);
  expect(state.emptyText.includes("项目档案暂时空着"), "empty state copy is missing");
  expect(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);

  const screenshot = path.join(screensDir, `home-project-empty-${viewport.width}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return { viewport, screenshot, state, pageErrors };
};

const runReadyCase = async (browser, viewport) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "no-preference"
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await routeCommon(page);
  await routeProjects(page, fixtureProjects);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-home-projects][data-project-state='ready']", { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  validateCommon(state, viewport.width);
  expect(!state.emptyVisible, "empty state is visible in ready case");
  expect(state.cardCount === 3, `ready case rendered ${state.cardCount} cards`);
  expect(!state.fourthProjectVisible, "fourth project was rendered on homepage");
  expect(state.cards.every((card) => card.linkHeight >= 44), "a project link target is smaller than 44px");
  expect(state.cards[0].progress === "72", "first progress did not render from payload");
  expect(state.cards[1].href === "/project.html?id=sailei-diary", "second project href mismatch");
  expect(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);

  const screenshot = path.join(screensDir, `home-project-ready-${viewport.width}.png`);
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

  await routeCommon(page);
  await routeProjects(page, fixtureProjects);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-home-projects][data-project-state='ready']", { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  validateCommon(state, 1280);
  expect(state.statusAnimationName === "none", `status animation still active: ${state.statusAnimationName}`);

  const screenshot = path.join(screensDir, "home-project-reduced-motion-1280.png");
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
  liveProjects,
  empty: [],
  ready: [],
  reducedMotion: null
};

for (const viewport of [
  { width: 390, height: 900 },
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 }
]) {
  results.empty.push(await runEmptyCase(browser, viewport));
}

for (const viewport of [
  { width: 390, height: 900 },
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 }
]) {
  results.ready.push(await runReadyCase(browser, viewport));
}

results.reducedMotion = await runReducedMotion(browser);
await browser.close();

fs.writeFileSync(stateFile, `${JSON.stringify(results, null, 2)}\n`);
fs.writeFileSync(
  summaryFile,
  [
    "Phase 037 home project preview verification",
    `baseUrl=${baseUrl}`,
    `edgePath=${edgePath}`,
    "emptyViewports=390,1280,1920",
    "readyViewports=390,1280,1920",
    `liveProjectItems=${Array.isArray(liveProjects.items) ? liveProjects.items.length : "unknown"}`,
    `emptyCardCounts=${results.empty.map((item) => `${item.viewport.width}:${item.state.cardCount}`).join(",")}`,
    `readyCardCounts=${results.ready.map((item) => `${item.viewport.width}:${item.state.cardCount}`).join(",")}`,
    `readyLinksMinHeight=${Math.min(...results.ready.flatMap((item) => item.state.cards.map((card) => card.linkHeight))).toFixed(2)}`,
    `reducedStatusAnimation=${results.reducedMotion.state.statusAnimationName}`,
    "pageOverflowX=false in all checked cases"
  ].join("\n") + "\n"
);

console.log(fs.readFileSync(summaryFile, "utf8"));
