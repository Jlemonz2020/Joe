import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require = createRequire("/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary/package.json");
const { chromium } = require("playwright-core");

const baseUrl = process.argv[2] || "http://127.0.0.1:4403";
const phaseRoot = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-026";
const browser = await chromium.launch({
  executablePath: "/usr/bin/microsoft-edge",
  headless: true
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1
});
const page = await context.newPage();
const results = [];

async function readState(label) {
  return page.evaluate((label) => {
    const form = document.querySelector("[data-search-entry]");
    const input = document.querySelector(".search-entry-input");
    const submit = document.querySelector(".search-entry-submit");
    const formRect = form?.getBoundingClientRect();
    const inputRect = input?.getBoundingClientRect();
    const submitRect = submit?.getBoundingClientRect();
    return {
      label,
      role: form?.getAttribute("role"),
      action: form?.getAttribute("action"),
      method: form?.getAttribute("method"),
      formLabel: form?.getAttribute("aria-label"),
      inputName: input?.getAttribute("name"),
      inputType: input?.getAttribute("type"),
      inputVisible: Boolean(inputRect && inputRect.width > 4 && inputRect.height > 4),
      submitLabel: submit?.getAttribute("aria-label"),
      submitWidth: submitRect?.width || 0,
      submitHeight: submitRect?.height || 0,
      formWidth: formRect?.width || 0,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  }, label);
}

await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
results.push(await readState("desktop-input-1440"));
await page.screenshot({
  path: `${phaseRoot}/screens/search-entry-1440.png`,
  fullPage: false
});

await page.locator(".search-entry-input").fill("Linux");
await page.locator(".search-entry-input").press("Enter");
await page.waitForURL(/archive\.html\?q=Linux/);
results.push({
  label: "desktop-submit",
  url: page.url()
});

await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
results.push(await readState("desktop-compact-1280"));
await page.screenshot({
  path: `${phaseRoot}/screens/search-entry-1280.png`,
  fullPage: false
});

await page.setViewportSize({ width: 390, height: 1100 });
await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
results.push(await readState("mobile-initial"));
await page.screenshot({
  path: `${phaseRoot}/screens/search-entry-390.png`,
  fullPage: false
});

await writeFile(`${phaseRoot}/artifacts/search-entry-state.json`, `${JSON.stringify(results, null, 2)}\n`);
await writeFile(`${phaseRoot}/artifacts/search-entry-summary.txt`, results.map((item) => {
  if (item.label === "desktop-submit") {
    return `${item.label}: url=${item.url}`;
  }
  return `${item.label}: role=${item.role} action=${item.action} inputVisible=${item.inputVisible} submit=${item.submitWidth}x${item.submitHeight} formWidth=${item.formWidth} overflow=${item.horizontalOverflow}`;
}).join("\n") + "\n");

await browser.close();

const desktop = results.find((item) => item.label === "desktop-input-1440");
const compact = results.find((item) => item.label === "desktop-compact-1280");
const mobile = results.find((item) => item.label === "mobile-initial");
const submit = results.find((item) => item.label === "desktop-submit");
const failures = [];

if (desktop?.role !== "search" || desktop?.inputName !== "q" || desktop?.submitLabel !== "提交资料检索") {
  failures.push("desktop search form semantics are incomplete");
}
if (!desktop?.inputVisible) {
  failures.push("1440 desktop search input is not visible");
}
if (compact?.horizontalOverflow) {
  failures.push("1280 compact search entry causes horizontal overflow");
}
if (!submit?.url?.includes("/archive.html?q=Linux")) {
  failures.push("desktop search submit did not navigate to archive query URL");
}
if ((mobile?.submitWidth || 0) < 44 || (mobile?.submitHeight || 0) < 44) {
  failures.push("mobile search submit target is smaller than 44x44");
}
if (mobile?.horizontalOverflow) {
  failures.push("mobile search entry causes horizontal overflow");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Search entry checks passed for ${results.length} states.`);
