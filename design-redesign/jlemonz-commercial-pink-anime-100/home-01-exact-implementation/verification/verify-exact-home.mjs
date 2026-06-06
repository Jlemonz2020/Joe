import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4328";
const outputDir =
  process.env.OUTPUT_DIR ||
  "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary/artifacts/home-exact/screens";

const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 720 },
  { name: "1920", width: 1920, height: 1080 }
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/microsoft-edge",
  args: ["--no-proxy-server", "--ignore-certificate-errors"]
});

const results = [];

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".concept-exact__canvas img");

  const state = await page.evaluate(() => {
    const img = document.querySelector(".concept-exact__canvas img");
    const header = document.querySelector(".site-header");
    const hotspots = document.querySelectorAll(".concept-hotspot");
    const canvas = document.querySelector(".concept-exact__canvas");
    const body = document.body;
    const html = document.documentElement;
    const rect = canvas?.getBoundingClientRect();

    return {
      naturalWidth: img?.naturalWidth || 0,
      naturalHeight: img?.naturalHeight || 0,
      renderedWidth: Math.round(rect?.width || 0),
      renderedHeight: Math.round(rect?.height || 0),
      hasHeader: Boolean(header),
      hotspotCount: hotspots.length,
      bodyOverflowX: body.scrollWidth > html.clientWidth + 1,
      currentImage: img?.getAttribute("src") || ""
    };
  });

  if (state.naturalWidth !== 1672 || state.naturalHeight !== 941) {
    throw new Error(`Reference image did not load at native size: ${JSON.stringify(state)}`);
  }

  if (state.hasHeader) {
    throw new Error(`Homepage still rendered the old header: ${JSON.stringify(state)}`);
  }

  if (state.hotspotCount < 15) {
    throw new Error(`Expected at least 15 clickable hotspots: ${JSON.stringify(state)}`);
  }

  await page.screenshot({
    path: join(outputDir, `home-exact-${viewport.name}.png`),
    fullPage: true
  });

  results.push({ viewport: viewport.name, ...state });
  await page.close();
}

await browser.close();
console.log(JSON.stringify({ ok: true, baseUrl, outputDir, results }, null, 2));
