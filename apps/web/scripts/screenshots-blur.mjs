// Capture the three "client-sensitive" README screenshots with subject
// text + project names blurred. Overrides the corresponding outputs of the
// main screenshots.mjs.
//
// Usage (from repo root, both api + web already running):
//   bun --filter @overtide/web screenshots:blur
//
// Targets:
//   01-dashboard.png       — blur subject after `#id` in the Earnings list
//   02-earning.png         — blur subject after `#id` in Issue col + whole Project col
//   08-issue-detail.png    — blur subject after `#id` in H1, blur "tracker · project"
//                            subtitle, blur the comment after "— " in each time entry

import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT = path.join(REPO_ROOT, "docs/screenshots");
mkdirSync(OUT, { recursive: true });

const BASE = "http://127.0.0.1:5173";

const BLUR_STYLE = `
  .ot-blur {
    filter: blur(6px);
    user-select: none;
    -webkit-user-select: none;
  }
`;

// JSX \`#{id} {subject}\` renders as 4 separate text nodes in the DOM:
//   ['#', '<id>', ' ', '<subject>'].
// Wrap the trailing subject text node in a .ot-blur span so the "#id" prefix
// stays sharp and the (potentially sensitive) subject is rendered blurred.
// Attached to \`window\` so each page.evaluate() (separate isolated context)
// can find it.
const INSTALL_HELPERS = `
window.splitIssueLabel = function(el) {
  const children = Array.from(el.childNodes);
  if (children.length < 2) return false;
  const last = children[children.length - 1];
  if (!last || last.nodeType !== 3) return false;
  if (!last.nodeValue || !last.nodeValue.trim()) return false;
  const span = document.createElement('span');
  span.className = 'ot-blur';
  span.textContent = last.nodeValue;
  last.replaceWith(span);
  return true;
};
`;

async function withBluredScreenshot(page, url, name, mutateBody) {
  console.log(`-> ${name}: ${url}`);
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  await page.waitForSelector("main", { timeout: 10_000 });
  await page.addStyleTag({ content: BLUR_STYLE });
  // Each page.evaluate runs in an isolated context; install helpers and
  // run the mutation in a single eval so they share scope.
  await page.evaluate(`(() => { ${INSTALL_HELPERS}; ${mutateBody} })()`);
  await page.waitForTimeout(400);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`   saved ${file}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const page = await ctx.newPage();

// 01-dashboard.png — Earnings list: blur subject after "#id ".
await withBluredScreenshot(
  page,
  "/",
  "01-dashboard",
  `
  document
    .querySelectorAll("main a[href^='/issue/'] span.truncate")
    .forEach((el) => splitIssueLabel(el));
`,
);

// 02-earning.png — Issue col (cell 1) + Project col (cell 2).
await withBluredScreenshot(
  page,
  "/earning",
  "02-earning",
  `
  document.querySelectorAll("main table tbody tr").forEach((row) => {
    const link = row.querySelector("td:nth-child(1) a");
    if (link) splitIssueLabel(link);
    const project = row.querySelector("td:nth-child(2)");
    if (project) project.classList.add("ot-blur");
  });
`,
);

// 08-issue-detail.png — pick #114518 (long subject + many time entries).
await withBluredScreenshot(
  page,
  "/issue/114518",
  "08-issue-detail",
  `
  // H1: "#114518 [AI] Agentic AI POC - migracja Intrum"
  document.querySelectorAll("main h1").forEach((h) => splitIssueLabel(h));

  // Subtitle "Tracker · ProjectName" — blur the whole muted-foreground span.
  const subtitle = document.querySelector("main .text-muted-foreground");
  if (subtitle && subtitle.textContent.includes("·")) {
    subtitle.classList.add("ot-blur");
  }

  // Time entries: each entry's middle div is "{activity}{ — {comment}}".
  // Walk it, keep the activity + ' — ', blur the comment tail.
  document.querySelectorAll("main .truncate").forEach((el) => {
    const text = el.textContent || "";
    const dashIdx = text.indexOf(" — ");
    if (dashIdx < 0) return;
    const head = text.slice(0, dashIdx + 3); // include " — "
    const tail = text.slice(dashIdx + 3);
    el.textContent = "";
    el.appendChild(document.createTextNode(head));
    const span = document.createElement("span");
    span.className = "ot-blur";
    span.textContent = tail;
    el.appendChild(span);
  });
`,
);

await browser.close();
console.log("done");
