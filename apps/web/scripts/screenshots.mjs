// Capture README screenshots against a running dev stack.
//
// Usage (from repo root, both api + web already running):
//   bun --filter @overtide/web screenshots
//
// Output: docs/screenshots/*.png (paths the README links to).

import { chromium } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";

// scripts/screenshots.mjs → apps/web/scripts → up 3 = repo root
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const OUT = path.join(REPO_ROOT, "docs/screenshots");
mkdirSync(OUT, { recursive: true });

const BASE = "http://127.0.0.1:5173";

const shots = [
  { name: "01-dashboard", path: "/", wait: "main" },
  { name: "02-earning", path: "/earning", wait: "main" },
  { name: "03-redemptions", path: "/redemptions", wait: "main" },
  { name: "04-unlinked", path: "/unlinked", wait: "main" },
  { name: "05-timeline", path: "/timeline", wait: "main" },
  { name: "06-sync", path: "/sync", wait: "main" },
  { name: "07-settings", path: "/settings", wait: "main" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const page = await ctx.newPage();

for (const s of shots) {
  const url = `${BASE}${s.path}`;
  console.log(`-> ${s.name}: ${url}`);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(s.wait, { timeout: 10_000 });
  await page.waitForTimeout(800);
  const file = path.join(OUT, `${s.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`   saved ${file}`);
}

// Issue detail — pick the first earning row from the dashboard
console.log("-> 08-issue-detail");
await page.goto(`${BASE}/earning`, { waitUntil: "networkidle" });
await page.waitForSelector("table tbody tr");
const firstId = await page.$eval(
  "table tbody tr a, table tbody tr [data-issue-id], table tbody tr",
  (el) => {
    const link = el.querySelector?.("a[href*='/issue/']");
    if (link) return link.getAttribute("href")?.split("/").pop();
    const m = el.textContent?.match(/#(\d+)/);
    return m ? m[1] : null;
  },
);
if (firstId) {
  await page.goto(`${BASE}/issue/${firstId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(OUT, "08-issue-detail.png"),
    fullPage: true,
  });
} else {
  console.warn("   could not find an issue id; skipping detail screen");
}

// Command palette (Cmd/Ctrl+K)
console.log("-> 09-command-palette");
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForSelector("main");
await page.waitForTimeout(500);
await page.keyboard.press("Control+K");
await page.waitForTimeout(600);
await page.screenshot({
  path: path.join(OUT, "09-command-palette.png"),
  fullPage: false,
});

// Redemption wizard (open via button)
console.log("-> 10-redemption-wizard");
await page.goto(`${BASE}/redemptions`, { waitUntil: "networkidle" });
await page.waitForSelector("main");
// try a button labelled "New redemption" or similar
const btn = await page.$('button:has-text("redemption"), button:has-text("Nowy"), button:has-text("New")');
if (btn) {
  await btn.click();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(OUT, "10-redemption-wizard.png"),
    fullPage: false,
  });
} else {
  console.warn("   redemption wizard trigger not found; skipping");
}

await browser.close();
console.log("done");
