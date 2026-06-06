import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary/package.json");
const { chromium } = require("playwright-core");

const baseURL = "http://127.0.0.1:4411";
const screensDir = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-030/screens";
const statePath = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-030/artifacts/status-state-state.json";
const summaryPath = "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/github/Joe/design-redesign/jlemonz-commercial-pink-anime-100/phase-030/artifacts/status-state-summary.txt";

fs.mkdirSync(screensDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/microsoft-edge"
});

const cases = [
  { name: "status-lab-1440", width: 1440, height: 1100 },
  { name: "status-lab-390", width: 390, height: 1100 }
];

const requiredKinds = ["loading", "error", "offline", "timeout"];
const badVisibleCopy = /(TypeError|ReferenceError|SyntaxError|Exception|stack trace|ECONN|undefined|null|500 Internal|raw failure)/i;
const results = [];

for (const testCase of cases) {
  const page = await browser.newPage({ viewport: { width: testCase.width, height: testCase.height } });
  await page.goto(`${baseURL}/status-lab.html`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${screensDir}/${testCase.name}.png`, fullPage: true });

  const stateCards = await page.locator("[data-status-kind]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      kind: node.getAttribute("data-status-kind"),
      label: node.getAttribute("aria-label"),
      text: node.textContent?.replace(/\s+/g, " ").trim() || "",
      width: node.getBoundingClientRect().width
    }))
  );

  const foundKinds = stateCards.map((card) => card.kind);
  for (const kind of requiredKinds) {
    if (!foundKinds.includes(kind)) {
      throw new Error(`${testCase.name} missing state ${kind}`);
    }
  }

  const badCopy = stateCards.find((card) => badVisibleCopy.test(card.text));
  if (badCopy) {
    throw new Error(`${testCase.name} exposes technical copy in ${badCopy.kind}: ${badCopy.text}`);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) {
    throw new Error(`${testCase.name} has horizontal overflow`);
  }

  results.push({
    name: testCase.name,
    count: stateCards.length,
    overflow,
    states: stateCards.map((card) => `${card.kind}:${card.label}`)
  });

  await page.close();
}

await browser.close();

fs.writeFileSync(statePath, JSON.stringify(results, null, 2));
fs.writeFileSync(summaryPath, results.map((item) => `${item.name}: count=${item.count} overflow=${item.overflow} states=${item.states.join(", ")}`).join("\n"));
console.log(fs.readFileSync(summaryPath, "utf8"));
