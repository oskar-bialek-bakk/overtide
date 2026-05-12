# Overtide

Personal Redmine overtime tracker — earn hours under a Redmine **Nadgodziny** time-entry activity, redeem them via **Odbiór nadgodzin** tracker issues linked with `relates`, monitor FIFO balance.

> Status: **Backend v1 — DONE. Frontend v1 (`apps/web`) — DONE.**
> Spec: [`docs/superpowers/specs/2026-05-11-overtide-design.md`](docs/superpowers/specs/2026-05-11-overtide-design.md)
> Plan A (backend): [`docs/superpowers/plans/2026-05-11-overtide-backend.md`](docs/superpowers/plans/2026-05-11-overtide-backend.md)
> Plan B (frontend): [`docs/superpowers/plans/2026-05-11-overtide-frontend.md`](docs/superpowers/plans/2026-05-11-overtide-frontend.md)

## Architecture

```
[Redmine REST API]
        ▲
        │  GET /users/current, /time_entries, /issues (include=relations)
        │  POST /issues/{id}/relations  (write-through)
        │
   ┌────┴──────────┐
   │   api (Bun)   │── Drizzle ─► SQLite (apps/api/data/overtide.db)
   │ Hono routes   │     - issues, time_entries, issue_relations
   │ FIFO matching │     - sync_runs, app_config
   └────▲──────────┘
        │  REST + zod envelope
        │
   ┌────┴──────────┐
   │   web (Vite)  │  React 18 + TanStack Router/Query +
   │               │  shadcn/ui + Tailwind + Framer + Recharts + cmdk
   └───────────────┘
```

## Quick start (full stack)

```bash
bun install
cp .env.example apps/api/.env
# edit apps/api/.env (see "Quick start (backend only)" below for the variable list)

bun --filter @overtide/api db:migrate
bun --filter @overtide/api dev &
bun --filter @overtide/web dev
# open http://127.0.0.1:5173
```

The Vite dev server proxies `/api/*` → `http://127.0.0.1:8787` (the Bun API).

### Tests (full stack)

```bash
bun --filter @overtide/api test    # 38 tests (Bun + MSW)
bun --filter @overtide/web test    # vitest unit + component
bun --filter @overtide/web e2e     # Playwright smoke (boots both servers)
```

## Quick start (backend only)

Requires: Bun ≥ 1.3, a Redmine instance with REST API enabled, your Redmine login/password (or API key).

```bash
bun install

# Configure
cp .env.example apps/api/.env
# Edit apps/api/.env:
#   REDMINE_URL=https://your-redmine.example.com
#   REDMINE_USERNAME=your.login
#   REDMINE_PASSWORD=your-password
#   (or REDMINE_API_KEY=... — wins over username/password)
#   REDMINE_TRACKER_REDEMPTION_ID=<id of your "Odbiór nadgodzin" tracker>
#   REDMINE_ACTIVITY_OVERTIME_ID=<id of your "Nadgodziny" time-entry activity>

# Initialize DB
bun --filter @overtide/api db:migrate

# Start API
bun --filter @overtide/api dev
# → http://127.0.0.1:8787
```

## Finding tracker / activity IDs

Once your credentials work, the API exposes them:

```bash
curl -u "$LOGIN:$PASS" https://your-redmine.example.com/trackers.json
curl -u "$LOGIN:$PASS" https://your-redmine.example.com/enumerations/time_entry_activities.json
```

## HTTP API

All responses use a typed envelope: `{ data: T }` on success, `{ error: { code, message, details? } }` on failure.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Redmine reachability + DB status + last sync |
| `/api/sync` | POST | Trigger on-demand sync (blocking, ~90s on cold start with 10k+ time entries) |
| `/api/sync/history?limit=N` | GET | Last N sync runs |
| `/api/sync/:id` | GET | One sync run |
| `/api/balance` | GET | `{ earned, redeemed, available, unlinkedHours }` |
| `/api/balance/timeline?bucket=month` | GET | Monthly series |
| `/api/issues/earning` | GET | Earning issues with `earned/consumed/remaining` per FIFO |
| `/api/issues/redemption` | GET | Redemption issues with `requested/covered/unlinked` |
| `/api/issues/:id` | GET | One issue + time entries + relations |
| `/api/unlinked` | GET | Redemptions with `unlinked > 0` (need manual linking) |
| `/api/relations` | POST | Body `{ from_earning_id, to_redemption_id }` — creates 'relates' in Redmine + mirror |
| `/api/relations/:id` | DELETE | Only locally-created relations |

## Tests

```bash
# Backend
bun --filter @overtide/api test           # 38 tests
cd packages/shared && bun test            # 3 tests
```

Total **41 unit + integration tests**, all green.

## Smoke evidence (2026-05-11)

First full sync against the live company Redmine completed in **94.7s**:

| Metric | Value |
|---|---|
| Issues mirrored | 441 |
| Time entries mirrored | 3,472 |
| `relates` relations mirrored | 188 |
| **Available balance** | **1,042.25h** |
| Earned (total overtime) | 1,226.25h |
| Redeemed (linked to earnings) | 184h |
| Unlinked redemption hours | 133.5h (across 47 issues) |

## Repo layout

```
overtide/
├── apps/
│   └── api/               # Bun + Hono + Drizzle backend
│       ├── src/
│       │   ├── config/    # zod env loader
│       │   ├── db/        # Drizzle schema + queries
│       │   ├── lib/       # logger, response envelope
│       │   ├── matching/  # FIFO algorithm (pure)
│       │   ├── middleware/
│       │   ├── redmine/   # typed REST client
│       │   ├── routes/    # Hono route handlers
│       │   └── sync/      # orchestrator + normalizers
│       ├── drizzle/       # SQL migrations
│       └── test/fixtures/redmine/
├── packages/
│   └── shared/            # zod schemas + types (used by api + future web)
└── docs/superpowers/
    ├── specs/             # design spec
    └── plans/             # backend + frontend implementation plans
```

## Tech stack

- **Runtime:** Bun 1.3
- **Backend:** Hono 4 (HTTP), Drizzle ORM 0.36 + `bun:sqlite`, zod 3, pino (logger with secret redaction)
- **Tests:** `bun test` (vitest replaced — vitest 2.x can't resolve `bun:sqlite` on Windows), MSW for HTTP mocks, `@sinonjs/fake-timers` for retry tests
- **TypeScript:** strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **Auth to Redmine:** HTTP Basic by default; API key supported as override
- **Network binding:** `127.0.0.1` only — single-user local app

## License

Private — not licensed for distribution.
