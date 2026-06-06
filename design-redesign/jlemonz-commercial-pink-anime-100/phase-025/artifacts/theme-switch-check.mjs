import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require = createRequire("/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary/package.json");
const { chromium } = require("playwright-core");

const baseUrl = process.argv[2] || "http://127.0.0.1:4401";
const phaseRoot = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-025";
const storageKey = "jlemonz:theme:v1";
const edgePath = "/usr/bin/microsoft-edge";

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1
});
const page = await context.newPage();
const results = [];

async function readState(label) {
  return page.evaluate(
    ({ label, storageKey }) => {
      const pressed = [...document.querySelectorAll("[data-theme-option]")].map((button) => ({
        id: button.getAttribute("data-theme-id"),
        pressed: button.getAttribute("aria-pressed"),
        label: button.getAttribute("aria-label")
      }));
      return {
        label,
        htmlTheme: document.documentElement.dataset.theme,
        bodyTheme: document.body.dataset.theme,
        ready: document.documentElement.dataset.themeReady,
        storedTheme: window.localStorage.getItem(storageKey),
        themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
        pressed,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    },
    { label, storageKey }
  );
}

async function capture(label, width, height, themeId) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  if (themeId) {
    await page.locator(`[data-theme-id="${themeId}"]`).click();
    await page.waitForTimeout(220);
  }
  const state = await readState(label);
  await page.screenshot({
    path: `${phaseRoot}/screens/${label}.png`,
    fullPage: false
  });
  results.push({ width, height, requestedTheme: themeId || "stored-or-default", ...state });
}

await capture("theme-default-1280", 1280, 900, null);
await capture("theme-paper-1280", 1280, 900, "paper-milk");
await page.reload({ waitUntil: "networkidle" });
results.push({ width: 1280, height: 900, requestedTheme: "reload-after-paper-milk", ...(await readState("theme-paper-reload")) });
await capture("theme-sakura-390", 390, 1100, "sakura-light");
await page.evaluate(({ storageKey }) => window.localStorage.setItem(storageKey, "sailei-night"), { storageKey });
await page.reload({ waitUntil: "networkidle" });
results.push({ width: 390, height: 1100, requestedTheme: "invalid-storage-fallback", ...(await readState("theme-invalid-fallback")) });

await writeFile(`${phaseRoot}/artifacts/theme-switch-state.json`, `${JSON.stringify(results, null, 2)}\n`);
await writeFile(`${phaseRoot}/artifacts/theme-switch-summary.txt`, results.map((item) => {
  const active = item.pressed.find((button) => button.pressed === "true")?.id || "none";
  return `${item.label}: html=${item.htmlTheme} body=${item.bodyTheme} stored=${item.storedTheme} active=${active} color=${item.themeColor} overflow=${item.horizontalOverflow}`;
}).join("\n") + "\n");

const failures = [];
for (const item of results) {
  const active = item.pressed.filter((button) => button.pressed === "true");
  if (active.length !== 1) {
    failures.push(`${item.label}: expected exactly one active theme chip`);
  }
  if (item.horizontalOverflow) {
    failures.push(`${item.label}: horizontal overflow detected`);
  }
}

const reload = results.find((item) => item.label === "theme-paper-reload");
if (reload?.htmlTheme !== "paper-milk" || reload?.storedTheme !== "paper-milk") {
  failures.push("paper-milk did not persist after reload");
}

const fallback = results.find((item) => item.label === "theme-invalid-fallback");
if (fallback?.htmlTheme !== "sailei-pink-diary") {
  failures.push("invalid stored theme did not fall back to sailei-pink-diary");
}

await browser.close();

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Theme switch checks passed for ${results.length} states.`);
