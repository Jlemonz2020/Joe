import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4328";
const outputDir =
  process.env.OUTPUT_DIR ||
  "/home/jlemonz/Documents/Codex/2026-06-05/new-chat-2/work/jlemonz-astro-pink-diary/artifacts/exact-pages/screens";

const pages = [
  { name: "home", path: "/index.html", image: "home-01-reference.png", width: 1672, height: 941 },
  { name: "moments", path: "/moments.html", image: "moments-01.png", width: 1672, height: 941 },
  { name: "notes", path: "/archive.html", image: "notes-01.png", width: 1672, height: 941 },
  { name: "projects", path: "/projects.html", image: "projects-01.png", width: 1672, height: 941 },
  { name: "project-detail", path: "/project.html", image: "project-detail-01.png", width: 1536, height: 1024 },
  { name: "post-detail", path: "/post.html", image: "post-detail-01.png", width: 1619, height: 971 },
  { name: "about", path: "/about.html", image: "about-01.png", width: 1672, height: 941 },
  { name: "search", path: "/search.html", image: "search-modal-01.png", width: 1536, height: 1024 }
];

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

for (const target of pages) {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(new URL(target.path, baseUrl).toString(), { waitUntil: "networkidle" });
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
        imageSrc: img?.getAttribute("src") || "",
        naturalWidth: img?.naturalWidth || 0,
        naturalHeight: img?.naturalHeight || 0,
        renderedWidth: Math.round(rect?.width || 0),
        renderedHeight: Math.round(rect?.height || 0),
        hasHeader: Boolean(header),
        hotspotCount: hotspots.length,
        bodyOverflowX: body.scrollWidth > html.clientWidth + 1,
        shell: body.getAttribute("data-shell")
      };
    });

    if (!state.imageSrc.includes(target.image)) {
      throw new Error(`${target.name} loaded wrong image: ${JSON.stringify(state)}`);
    }

    if (state.naturalWidth !== target.width || state.naturalHeight !== target.height) {
      throw new Error(`${target.name} wrong native size: ${JSON.stringify(state)}`);
    }

    if (state.hasHeader) {
      throw new Error(`${target.name} still rendered the old header: ${JSON.stringify(state)}`);
    }

    if (state.shell !== "concept-exact") {
      throw new Error(`${target.name} did not use exact shell: ${JSON.stringify(state)}`);
    }

    if (state.hotspotCount < 6) {
      throw new Error(`${target.name} expected navigation hotspots: ${JSON.stringify(state)}`);
    }

    await page.screenshot({
      path: join(outputDir, `${target.name}-${viewport.name}.png`),
      fullPage: true
    });

    results.push({ page: target.name, viewport: viewport.name, ...state });
    await page.close();
  }
}

await browser.close();
console.log(JSON.stringify({ ok: true, baseUrl, outputDir, pages: pages.length, screenshots: results.length, results }, null, 2));
