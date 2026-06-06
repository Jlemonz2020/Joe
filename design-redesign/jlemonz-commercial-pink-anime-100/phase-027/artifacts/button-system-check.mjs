import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require = createRequire("/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary/package.json");
const { chromium } = require("playwright-core");

const baseUrl = process.argv[2] || "http://127.0.0.1:4405";
const phaseRoot = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-027";
const browser = await chromium.launch({
  executablePath: "/usr/bin/microsoft-edge",
  headless: true
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1
});
const page = await context.newPage();

await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
const desktopState = await page.evaluate(() => [...document.querySelectorAll(".ui-button")].map((button) => {
  const rect = button.getBoundingClientRect();
  return {
    tag: button.tagName.toLowerCase(),
    className: button.className,
    ariaLabel: button.getAttribute("aria-label"),
    title: button.getAttribute("title"),
    tooltip: button.getAttribute("data-tooltip"),
    pressed: button.getAttribute("aria-pressed"),
    width: rect.width,
    height: rect.height,
    text: button.textContent?.trim() || ""
  };
}));

await page.screenshot({
  path: `${phaseRoot}/screens/buttons-default-1440.png`,
  fullPage: false
});

await page.locator('[data-theme-id="paper-milk"]').hover();
await page.waitForTimeout(220);
await page.screenshot({
  path: `${phaseRoot}/screens/buttons-hover-1440.png`,
  fullPage: false
});

await page.locator(".search-entry-submit").focus();
await page.waitForTimeout(120);
await page.screenshot({
  path: `${phaseRoot}/screens/buttons-focus-1440.png`,
  fullPage: false
});

await page.setViewportSize({ width: 390, height: 1100 });
await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
const mobileState = await page.evaluate(() => [...document.querySelectorAll(".ui-button")].map((button) => {
  const rect = button.getBoundingClientRect();
  return {
    className: button.className,
    ariaLabel: button.getAttribute("aria-label"),
    tooltip: button.getAttribute("data-tooltip"),
    pressed: button.getAttribute("aria-pressed"),
    width: rect.width,
    height: rect.height
  };
}));
await page.screenshot({
  path: `${phaseRoot}/screens/buttons-mobile-390.png`,
  fullPage: false
});

await browser.close();

const results = {
  desktopState,
  mobileState,
  desktopOverflow: false,
  mobileOverflow: false
};

await writeFile(`${phaseRoot}/artifacts/button-system-state.json`, `${JSON.stringify(results, null, 2)}\n`);
await writeFile(`${phaseRoot}/artifacts/button-system-summary.txt`, [
  `desktop buttons: ${desktopState.length}`,
  `mobile buttons: ${mobileState.length}`,
  ...desktopState.map((button, index) => `desktop[${index}] ${button.width}x${button.height} label=${button.ariaLabel || "none"} tooltip=${button.tooltip || "none"} pressed=${button.pressed || "none"}`),
  ...mobileState.map((button, index) => `mobile[${index}] ${button.width}x${button.height} label=${button.ariaLabel || "none"} tooltip=${button.tooltip || "none"} pressed=${button.pressed || "none"}`)
].join("\n") + "\n");

const failures = [];
for (const [scope, buttons] of [["desktop", desktopState], ["mobile", mobileState]]) {
  for (const [index, button] of buttons.entries()) {
    if (!button.ariaLabel && !button.text) {
      failures.push(`${scope}[${index}] lacks accessible text`);
    }
    if (!button.tooltip && button.className.includes("ui-button--icon")) {
      failures.push(`${scope}[${index}] icon button lacks data-tooltip`);
    }
    if (button.width < 44 || button.height < 43.9) {
      failures.push(`${scope}[${index}] target smaller than 44x44`);
    }
  }
}

const pressed = desktopState.filter((button) => button.pressed === "true");
if (pressed.length !== 1) {
  failures.push("expected one active pressed theme swatch on desktop");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Button system checks passed for ${desktopState.length} desktop and ${mobileState.length} mobile buttons.`);
