import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const projectDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary";
const phaseDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-038";
const require = createRequire(`${projectDir}/package.json`);
const { chromium } = require("playwright-core");

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4451";
const edgePath = "/usr/bin/microsoft-edge";
const screensDir = path.join(phaseDir, "artifacts", "screens");
const stateFile = path.join(phaseDir, "artifacts", "home-moment-preview-state.json");
const summaryFile = path.join(phaseDir, "artifacts", "home-moment-preview-summary.txt");
const liveMomentsFile = path.join(phaseDir, "artifacts", "live-moments.json");
const liveGithubFile = path.join(phaseDir, "artifacts", "live-github-contributions.json");
const liveProjectsFile = path.join(phaseDir, "artifacts", "live-projects.json");
const liveImageUrlFile = path.join(phaseDir, "artifacts", "live-moment-image-url.txt");
const liveImageFile = path.join(phaseDir, "artifacts", "live-moment-image.webp");

if (!fs.existsSync(edgePath)) {
  throw new Error(`Microsoft Edge executable not found at ${edgePath}`);
}

const liveMoments = JSON.parse(fs.readFileSync(liveMomentsFile, "utf8"));
const liveGithub = JSON.parse(fs.readFileSync(liveGithubFile, "utf8"));
const liveProjects = JSON.parse(fs.readFileSync(liveProjectsFile, "utf8"));
const liveImageUrl = fs.readFileSync(liveImageUrlFile, "utf8").trim();
fs.mkdirSync(screensDir, { recursive: true });

const fixtureMoments = {
  items: [
    {
      id: "note-live-photo",
      content: "把首页最近瞬间贴成拍立得，图片完整显示。",
      kind: "life",
      tags: ["维护", "图片", "手帐"],
      image_url: liveImageUrl,
      created_at: "2026-06-06T08:30:00.000Z"
    },
    {
      id: "note-terminal",
      content: "Pi5 服务重启后，把命令和现象先贴在便签上。",
      kind: "project",
      tags: ["Pi5", "服务"],
      created_at: "2026-06-05T21:20:00.000Z"
    },
    {
      id: "note-ai",
      content: "AI 帮我把排版问题拆成阶段，下一轮继续细调。",
      kind: "fragment",
      tags: ["AI", "排版"],
      created_at: "2026-06-05T09:10:00.000Z"
    },
    {
      id: "note-hidden-fourth",
      content: "不应显示的第四条瞬间。",
      kind: "life",
      tags: ["限制"],
      created_at: "2026-06-04T09:10:00.000Z"
    }
  ]
};

const routeCommon = async (page) => {
  await page.route("**/api/github/contributions", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(liveGithub) });
  });
  await page.route("**/api/projects", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(liveProjects) });
  });
  await page.route("**/uploads/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/webp", path: liveImageFile });
  });
};

const routeMoments = async (page, payload) => {
  await page.route("**/api/moments", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
};

const collectState = async (page) => page.evaluate(() => {
  const root = document.querySelector("[data-home-moments]");
  const cards = Array.from(document.querySelectorAll(".home-moment-card:not(.home-moment-card--loading)"));
  const empty = document.querySelector("[data-moment-empty]");
  const statusDot = document.querySelector(".home-moment-preview__status i");
  const doc = document.documentElement;

  return {
    exists: Boolean(root),
    state: root?.dataset.momentState || "",
    rulesCount: Number(root?.dataset.rulesCount || 0),
    heading: document.querySelector("#home-moment-preview-title")?.textContent.trim() || "",
    statusText: document.querySelector("[data-moment-status] span")?.textContent.trim() || "",
    emptyVisible: empty ? !empty.hidden : false,
    emptyText: empty?.textContent.replace(/\s+/g, " ").trim() || "",
    cardCount: cards.length,
    photoCount: document.querySelectorAll(".home-moment-card--photo").length,
    fourthMomentVisible: document.body.textContent.includes("不应显示的第四条瞬间"),
    cards: cards.map((card) => {
      const link = card.querySelector(".home-moment-card__link");
      const linkRect = link.getBoundingClientRect();
      const img = card.querySelector("img");
      return {
        note: card.querySelector(".home-moment-card__topline span")?.textContent.trim() || "",
        time: card.querySelector("time")?.textContent.trim() || "",
        kind: card.querySelector("strong")?.textContent.trim() || "",
        content: card.querySelector("p")?.textContent.trim() || "",
        tags: Array.from(card.querySelectorAll(".home-moment-card__tags li")).map((tag) => tag.textContent.trim()),
        linkHeight: linkRect.height,
        imageComplete: img ? img.complete : null,
        imageNaturalWidth: img ? img.naturalWidth : null,
        imageObjectFit: img ? getComputedStyle(img).objectFit : null
      };
    }),
    pageOverflowX: doc.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1,
    statusAnimationName: statusDot ? getComputedStyle(statusDot).animationName : ""
  };
});

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const validateCommon = (state, viewportWidth) => {
  expect(state.exists, "moment preview root is missing");
  expect(state.rulesCount >= 5, "moment preview rules are not wired");
  expect(state.heading === "最近瞬间", "moment preview heading mismatch");
  expect(!state.pageOverflowX, `page overflowed horizontally at ${viewportWidth}`);
};

const waitForImages = async (page) => {
  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll(".home-moment-card img"));
    return images.length === 0 || images.every((img) => img.complete && img.naturalWidth > 0);
  });
};

const runReadyCase = async (browser, viewport, payload, label) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await routeCommon(page);
  await routeMoments(page, payload);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-home-moments][data-moment-state='ready']", { timeout: 10000 });
  await page.locator(".home-moment-preview").scrollIntoViewIfNeeded();
  await waitForImages(page);
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  validateCommon(state, viewport.width);
  expect(state.cardCount >= 1 && state.cardCount <= 3, `ready case rendered ${state.cardCount} cards`);
  expect(state.cards.every((card) => card.linkHeight >= 44), "a moment link target is smaller than 44px");
  expect(state.cards.filter((card) => card.imageObjectFit).every((card) => card.imageObjectFit === "contain"), "a moment image is not object-fit contain");
  expect(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  const screenshot = path.join(screensDir, `home-moment-${label}-${viewport.width}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return { viewport, screenshot, state, pageErrors };
};

const runFixtureCase = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference"
  });
  const page = await context.newPage();

  await routeCommon(page);
  await routeMoments(page, fixtureMoments);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-home-moments][data-moment-state='ready']", { timeout: 10000 });
  await page.locator(".home-moment-preview").scrollIntoViewIfNeeded();
  await waitForImages(page);
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  validateCommon(state, 1280);
  expect(state.cardCount === 3, `fixture case rendered ${state.cardCount} cards`);
  expect(state.photoCount >= 1, "fixture case did not render a polaroid card");
  expect(!state.fourthMomentVisible, "fourth moment was rendered on homepage");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  const screenshot = path.join(screensDir, "home-moment-fixture-1280.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return { viewport: { width: 1280, height: 900 }, screenshot, state };
};

const runEmptyCase = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference"
  });
  const page = await context.newPage();

  await routeCommon(page);
  await routeMoments(page, { items: [] });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-home-moments][data-moment-state='empty']", { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  validateCommon(state, 390);
  expect(state.emptyVisible, "empty state is hidden");
  expect(state.cardCount === 0, `empty case rendered ${state.cardCount} moment cards`);
  expect(state.emptyText.includes("时间线暂时安静"), "empty state copy is missing");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  const screenshot = path.join(screensDir, "home-moment-empty-390.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return { viewport: { width: 390, height: 900 }, screenshot, state };
};

const runReducedMotion = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
  });
  const page = await context.newPage();

  await routeCommon(page);
  await routeMoments(page, fixtureMoments);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-home-moments][data-moment-state='ready']", { timeout: 10000 });
  await page.locator(".home-moment-preview").scrollIntoViewIfNeeded();
  await waitForImages(page);
  await page.waitForLoadState("networkidle");

  const state = await collectState(page);
  validateCommon(state, 1280);
  expect(state.statusAnimationName === "none", `status animation still active: ${state.statusAnimationName}`);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  const screenshot = path.join(screensDir, "home-moment-reduced-motion-1280.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return { viewport: { width: 1280, height: 900 }, screenshot, state };
};

const browser = await chromium.launch({ headless: true, executablePath: edgePath, args: ["--no-sandbox"] });

const results = {
  baseUrl,
  edgePath,
  liveMomentItems: Array.isArray(liveMoments.items) ? liveMoments.items.length : 0,
  liveReady: [],
  fixture: null,
  empty: null,
  reducedMotion: null
};

for (const viewport of [
  { width: 390, height: 900 },
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 }
]) {
  results.liveReady.push(await runReadyCase(browser, viewport, liveMoments, "live"));
}

results.fixture = await runFixtureCase(browser);
results.empty = await runEmptyCase(browser);
results.reducedMotion = await runReducedMotion(browser);
await browser.close();

fs.writeFileSync(stateFile, `${JSON.stringify(results, null, 2)}\n`);
fs.writeFileSync(
  summaryFile,
  [
    "Phase 038 home moment preview verification",
    `baseUrl=${baseUrl}`,
    `edgePath=${edgePath}`,
    `liveMomentItems=${results.liveMomentItems}`,
    "liveViewports=390,1280,1920",
    `liveCardCounts=${results.liveReady.map((item) => `${item.viewport.width}:${item.state.cardCount}`).join(",")}`,
    `fixtureCardCount=${results.fixture.state.cardCount}`,
    `fixturePhotoCount=${results.fixture.state.photoCount}`,
    `emptyCardCount=${results.empty.state.cardCount}`,
    `reducedStatusAnimation=${results.reducedMotion.state.statusAnimationName}`,
    "imageObjectFit=contain",
    "pageOverflowX=false in all checked cases"
  ].join("\n") + "\n"
);

console.log(fs.readFileSync(summaryFile, "utf8"));
