// Sync the repo README + screenshots into the VitePress site source.
//
// Run before `vitepress dev` / `vitepress build`.
//   - Copies ../README.md to ./index.md (overwrites). Image paths get a
//     leading slash added: `docs/screenshots/…` → `/docs/screenshots/…`.
//     GitHub renders root-relative paths fine; VitePress needs the leading
//     slash so Vite serves the images from `public/` instead of trying to
//     bundle them as relative assets next to `index.md`.
//   - Mirrors ../docs/screenshots/ to ./public/docs/screenshots/, which is
//     where the rewritten paths above resolve to.

import { fileURLToPath } from "node:url";
import path from "node:path";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const SITE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SITE_DIR, "..");

const README_SRC = path.join(REPO_ROOT, "README.md");
const INDEX_DST = path.join(SITE_DIR, "index.md");
const SHOTS_SRC = path.join(REPO_ROOT, "docs", "screenshots");
const SHOTS_DST = path.join(SITE_DIR, "public", "docs", "screenshots");

// Wrap the README with VitePress frontmatter so the homepage gets a meta
// title and an opt-out from the right-hand outline (the README is long
// and has its own TOC at the top).
const FRONTMATTER = `---
title: Overtide
description: Osobisty tracker nadgodzin dla Redmine — wyrobione vs odebrane godziny z dopasowaniem FIFO.
aside: false
outline: false
---

`;

const readme = readFileSync(README_SRC, "utf8").replace(
  /\]\((docs\/screenshots\/)/g,
  "](/$1",
);
writeFileSync(INDEX_DST, FRONTMATTER + readme, "utf8");
console.log(`✓ wrote ${path.relative(SITE_DIR, INDEX_DST)} (${readme.length} chars)`);

rmSync(SHOTS_DST, { recursive: true, force: true });
mkdirSync(SHOTS_DST, { recursive: true });
cpSync(SHOTS_SRC, SHOTS_DST, { recursive: true });
console.log(`✓ mirrored screenshots → ${path.relative(SITE_DIR, SHOTS_DST)}`);
