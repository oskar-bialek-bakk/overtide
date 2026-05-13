# site/

VitePress site that publishes the repo `README.md` as a standalone page.

## How it works

`sync.mjs` runs before every dev/build:

- Copies `../README.md` → `./index.md` (with a tiny VitePress frontmatter
  prepended), rewriting `docs/screenshots/...` image paths to
  `/docs/screenshots/...` so Vite serves them from `public/` instead of
  trying to bundle them as relative assets.
- Mirrors `../docs/screenshots/` → `./public/docs/screenshots/`.

Both `index.md` and `public/docs/` are git-ignored — they're build inputs
generated from the canonical README, not source.

## Local

```bash
bun install
bun run docs:dev      # http://localhost:5173 (or next free port)
bun run docs:build    # → .vitepress/dist
bun run docs:preview  # serves the built site
```

## Deploy on Vercel

1. New Project → import `oskar-bialek-bakk/overtide`.
2. **Root Directory:** `site` (this folder).
3. Framework preset: **Other** (VitePress isn't a preset; the bundled
   `vercel.json` already tells Vercel what to run).
4. Build & install commands come from `vercel.json` — no manual override
   needed.
5. Deploy. Subsequent pushes to the configured production branch
   redeploy automatically.

The site is fully static, so the private repo stays private; Vercel only
needs read access via the GitHub integration to build it.
