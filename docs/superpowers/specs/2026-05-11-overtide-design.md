# Overtide — Design Spec

**Date:** 2026-05-11
**Status:** Draft — for implementation planning
**Author:** Oskar Białek (with brainstorming via Claude Code)

> Personal web app for tracking Redmine **overtime hours** (logged as a time-entry activity on any issue) and **redemption issues** (separate Redmine tracker), with FIFO matching between them and write-through linking of `relates` relations.

---

## 1. Goals & Non-goals

### Goals (v1)
- Read time entries + issues + relations from a Redmine instance using my account credentials.
- Classify issues into two roles: **earning** (any issue where I logged ≥1 time entry with activity = Overtime) and **redemption** (issues whose tracker = Redemption).
- Compute, for each redemption issue, how many hours from which earning issues cover it — using **FIFO** allocation across `relates` relations.
- Show a balance (earned − redeemed) and warn about redemption issues that lack a `relates` link to any earning issue (manual linking required).
- Allow me to add the missing `relates` relations from inside Overtide (write-through to Redmine).
- Run locally on `127.0.0.1` only, no auth on the app itself (single user, machine-bound).
- Modern UI aesthetic (Linear / Vercel / Cal.com class). No 2005-era forms-and-tables look.

### Non-goals (v1)
- Multi-user / shared access.
- Automatic re-linking (only manual linking with FIFO hints).
- Auto-sync on schedule (sync is on-demand only).
- Time entry CRUD (we don't write time entries to Redmine — only relations).
- Hosting outside `localhost`.
- Negative balance handling (assumed not to occur; loud-fail if it does).

---

## 2. Stack & Repo Layout

### Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React 18 + TypeScript |
| Routing | TanStack Router |
| Data fetching | TanStack Query |
| UI | shadcn/ui + Tailwind |
| Charts | Recharts |
| Motion / animations | Framer Motion |
| Command palette | cmdk |
| Toast | sonner |
| Backend runtime | Bun |
| HTTP server | Hono |
| ORM | Drizzle |
| Database | SQLite (file: `apps/api/data/overtide.db`) |
| Shared types / validation | zod |
| Logging | pino |
| Test (unit/integration) | Vitest |
| Mock HTTP | MSW |
| E2E | Playwright |

### Repo layout (pnpm/bun workspaces monorepo)

```
overtide/
  apps/
    web/                       # Vite + React + TS
      src/
        routes/                # TanStack Router pages
        components/            # shadcn/ui + custom
        api/                   # TanStack Query hooks (typed fetch wrappers)
        lib/
      index.html
      vite.config.ts
    api/                       # Bun + Hono + Drizzle
      src/
        routes/                # Hono route handlers
        redmine/               # Redmine REST client (read + write)
        sync/                  # Sync orchestrator + normalizers
        matching/              # FIFO algorithm (pure functions)
        db/                    # Drizzle schema + queries + migrations
        config/                # env loader (zod-validated)
      drizzle/                 # generated migrations
      data/                    # SQLite file lives here (git-ignored)
      test/
        fixtures/redmine/      # sanitized JSON payload snapshots
  packages/
    shared/                    # DTOs, zod schemas shared web↔api
  .env.example
  drizzle.config.ts
  package.json                 # workspaces
  README.md
  .gitignore
```

### Environment variables (`apps/api/.env`)

```env
REDMINE_URL=https://redmine.example.com

# Auth — Basic Auth (login + password). API key fallback supported if user
# provides REDMINE_API_KEY instead; if both set, API key wins.
REDMINE_USERNAME=...
REDMINE_PASSWORD=...
# REDMINE_API_KEY=...

# Redmine identifiers (set once, validated at startup via /trackers.json and
# /enumerations/time_entry_activities.json)
REDMINE_TRACKER_REDEMPTION_ID=12
REDMINE_ACTIVITY_OVERTIME_ID=8

# App
PORT=8787
LOG_LEVEL=info
```

`apps/api/.env` is git-ignored. `.env.example` is committed with placeholders only.

### Run model (local dev)

- `bun --filter api dev` → backend on `http://127.0.0.1:8787`
- `bun --filter web dev` → frontend on `http://127.0.0.1:5173` with Vite dev proxy to `8787`
- One SQLite file at `apps/api/data/overtide.db` (git-ignored)
- Production single-user "deployment" = same as dev. PM2 / Task Scheduler not in scope for v1.

---

## 3. Data flow (high level)

```
[Redmine REST API]
        ▲
        │  GET /users/current.json
        │  GET /time_entries.json?user_id=me
        │  GET /issues.json?issue_id=…&include=relations
        │  POST /issues/{id}/relations.json
        │  DELETE /relations/{id}.json
        │
   ┌────┴──────────┐
   │   api (Bun)   │── Drizzle ─► SQLite (overtide.db)
   │   Hono routes │
   └────▲──────────┘
        │  REST/JSON (typed)
        │
   ┌────┴──────────┐
   │   web (Vite)  │── TanStack Query ─► api
   │   React UI    │
   └───────────────┘
```

---

## 4. Domain model

### Concepts

- **Earning issue** — any Redmine issue on which I logged ≥1 time entry whose `activity_id = REDMINE_ACTIVITY_OVERTIME_ID`. The issue's regular tracker (Development, Bug, etc.) is irrelevant — only the activity matters. `earned_hours = SUM(time_entries.hours WHERE activity_id = OVERTIME_ACTIVITY)`.
- **Redemption issue** — an issue whose `tracker_id = REDMINE_TRACKER_REDEMPTION_ID`. `redeemed_hours = SUM(time_entries.hours)` (any activity).
- **Relation** — a Redmine `relates` issue relation between an earning issue and a redemption issue. We ignore other relation types (`blocks`, `duplicates`, …) and we ignore cross-kind violations (OT↔OT or R↔R).
- **Allocation** — computed (not persisted) result of FIFO matching: "X hours of earning issue A cover Y hours of redemption issue B".
- **Balance** — `Σ earned − Σ consumed_by_redemptions` across all my mirrored issues. Always ≥ 0 in normal operation.

### Conservative assumption (per user)

> An issue with `tracker = Redemption` does NOT have time entries with `activity = Overtime`. If it ever does, we log a warning during sync and ignore that time entry when computing `earned_hours`. We do NOT double-count.

---

## 5. SQLite schema (Drizzle)

```sql
-- Mirror of Redmine issues we care about (earning OR redemption)
CREATE TABLE issues (
  id              INTEGER PRIMARY KEY,            -- Redmine issue id
  role            TEXT NOT NULL                   -- 'earning' | 'redemption'
                    CHECK (role IN ('earning','redemption')),
  tracker_id      INTEGER NOT NULL,
  tracker_name    TEXT NOT NULL,
  project_id      INTEGER NOT NULL,
  project_name    TEXT NOT NULL,
  subject         TEXT NOT NULL,
  status_name     TEXT NOT NULL,
  is_closed       INTEGER NOT NULL DEFAULT 0,
  author_id       INTEGER,
  assigned_to_id  INTEGER,
  created_on      TEXT NOT NULL,                  -- ISO datetime
  updated_on      TEXT NOT NULL,
  start_date      TEXT,
  due_date        TEXT,
  url             TEXT NOT NULL,
  raw_json        TEXT NOT NULL                   -- full payload for debug
);
CREATE INDEX idx_issues_role ON issues(role);

-- Mirror of time_entries: only mine (user_id = me) on mirrored issues
CREATE TABLE time_entries (
  id             INTEGER PRIMARY KEY,
  issue_id       INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL,
  hours          REAL NOT NULL,
  activity_id    INTEGER NOT NULL,
  activity_name  TEXT NOT NULL,
  spent_on       TEXT NOT NULL,                   -- ISO date (FIFO anchor)
  comments       TEXT,
  created_on     TEXT NOT NULL,
  updated_on     TEXT NOT NULL
);
CREATE INDEX idx_te_issue    ON time_entries(issue_id);
CREATE INDEX idx_te_spent_on ON time_entries(spent_on);
CREATE INDEX idx_te_activity ON time_entries(activity_id);

-- Mirror of 'relates' relations between mirrored issues
CREATE TABLE issue_relations (
  id              INTEGER PRIMARY KEY,            -- Redmine relation id
  issue_from_id   INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  issue_to_id     INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  relation_type   TEXT NOT NULL,                  -- 'relates' only (others filtered out)
  created_locally INTEGER NOT NULL DEFAULT 0,     -- 1 if Overtide created it
  mirrored_at     TEXT NOT NULL
);
CREATE INDEX idx_rel_from ON issue_relations(issue_from_id);
CREATE INDEX idx_rel_to   ON issue_relations(issue_to_id);

-- Audit log of sync operations
CREATE TABLE sync_runs (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at            TEXT NOT NULL,
  finished_at           TEXT,
  status                TEXT NOT NULL
                          CHECK (status IN ('running','success','failed')),
  issues_upserted       INTEGER DEFAULT 0,
  time_entries_upserted INTEGER DEFAULT 0,
  relations_upserted    INTEGER DEFAULT 0,
  error_message         TEXT
);
-- Concurrent-sync guard: at most one 'running' row at any time.
CREATE UNIQUE INDEX uq_sync_running ON sync_runs(status) WHERE status = 'running';

-- Key-value config (last_sync_at, schema_version, etc.)
CREATE TABLE app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Computed (not stored):**
- Per-issue totals — derived in SQL or TS as needed.
- FIFO allocations — derived in TS by `computeFIFO()` (see §7). NOT persisted; recomputed on every query that needs them.

**FIFO anchor date** per issue = `MIN(time_entries.spent_on)`, fallback `DATE(issues.created_on)` if no time entries yet.

---

## 6. Redmine integration

### Authentication

The backend supports two mechanisms, auto-selected by env vars at startup:

1. **Basic Auth** (chosen for v1) — `Authorization: Basic base64(USERNAME:PASSWORD)` on every request. Requires `REDMINE_USERNAME` + `REDMINE_PASSWORD` in `.env`.
2. **API key** (fallback / future) — `X-Redmine-API-Key: <40-hex>`. Requires `REDMINE_API_KEY`. If set, takes precedence over Basic.

If neither is configured: backend fails to start with `AUTH_NOT_CONFIGURED`.

> **Pre-condition:** the Redmine instance must have REST API enabled (`Administration → Settings → API → Enable REST web service`). If disabled, both auth methods fail on REST endpoints; we surface a clear health error directing the user to ask their Redmine admin.

### Read endpoints used

| Endpoint | Purpose |
|---|---|
| `GET /users/current.json` | Validate auth + obtain current user id (cached in `app_config.current_user_id`) |
| `GET /trackers.json` | One-time validation that `REDMINE_TRACKER_REDEMPTION_ID` exists |
| `GET /enumerations/time_entry_activities.json` | One-time validation that `REDMINE_ACTIVITY_OVERTIME_ID` exists |
| `GET /time_entries.json?user_id=me&limit=100&offset=N&from=YYYY-MM-DD` | Paginated, optionally windowed |
| `GET /issues.json?issue_id=1,2,3&status_id=*&include=relations` | Batch fetch issues + relations (chunked to ≤50 ids per call) |

### Write endpoints used

| Endpoint | Purpose |
|---|---|
| `POST /issues/{from_id}/relations.json` | Body `{"relation":{"issue_to_id":Y,"relation_type":"relates"}}` |
| `DELETE /relations/{id}.json` | Only for relations with `created_locally = 1` (undo); rarely used |

### Sync algorithm (on-demand)

```
1. Insert sync_runs row with status='running' (unique index enforces no concurrent sync).
2. GET /users/current.json. Fail-fast on 401/403 with REDMINE_AUTH_FAILED.
3. Determine fetch window:
     - if app_config.last_sync_at exists  → from = (last_sync_at - 7 days)  (overlap buffer)
     - else                                → from = null                    (full history)
4. Paginate GET /time_entries.json (limit=100), collecting all entries
   for user_id = me.
5. Distinct(issue_id) → fetch in chunks of ≤50 via
   GET /issues.json?issue_id=…&status_id=*&include=relations.
   Concurrency cap = 5 (p-limit). Exponential backoff on 429/5xx
   (250ms → 1000ms → 4000ms, max 3 attempts per call).
6. Upsert time_entries first (so DB reflects everything we just fetched).
   Then classify each candidate issue using the UNION of (existing DB rows +
   freshly fetched rows for that issue):
     a. If tracker_id == REDMINE_TRACKER_REDEMPTION_ID → role = 'redemption'.
     b. else if ∃ time_entry on this issue (in DB after upsert) with
              activity_id == REDMINE_ACTIVITY_OVERTIME_ID → role = 'earning'.
     c. else → SKIP from mirror.
   Rationale: an issue may have older overtime entries already mirrored from
   prior syncs; a window-only check would mis-classify it as a regular dev
   task. We re-classify on every sync to handle role transitions (e.g.,
   user retroactively re-categorises a time entry's activity in Redmine).
7. For role='redemption' issues, when ingesting their time entries:
     - if a time entry has activity_id == OVERTIME → log warning, store the
       entry (full mirror) but do NOT include it in earned-hours computation.
8. Transaction:
     a. Upsert issues by id.
     b. Upsert time_entries by id (only for retained issues).
     c. For each retained issue, fetch its 'relates' relations (already in
        the /issues include=relations payload). Replace this issue's
        'relates' set in issue_relations table.
9. Set app_config.last_sync_at = NOW.
10. Update sync_runs row: status='success', finished_at=NOW, counters set.
11. On any uncaught error: status='failed', error_message=<truncated 2KB>.
```

**Idempotency:** all upserts by primary key; rerun produces the same DB state. 7-day overlap buffer protects against backdated edits in Redmine.

### Backend HTTP API (exposed to web)

```
GET    /api/health                          → { redmine, db, lastSync, errors[] }
POST   /api/sync                            → kicks sync (blocking); returns sync_run
GET    /api/sync/:id                        → sync_run detail
GET    /api/sync/history?limit=20           → last N sync_runs
GET    /api/balance                         → { earned, redeemed, available, unlinkedHours }
GET    /api/balance/timeline?bucket=month   → series for chart
GET    /api/issues/earning?status=open|all  → earning issues with computed earned/consumed/remaining
GET    /api/issues/redemption               → redemption issues with covered/unlinked
GET    /api/issues/:id                      → detail + linked counterparts + raw time entries
GET    /api/unlinked                        → redemptions with `unlinked > 0`
POST   /api/relations                       → body: { from_earning_id, to_redemption_id } → write-through
DELETE /api/relations/:id                   → only for created_locally=1
```

**Response envelope (consistent):**

```ts
type ApiResponse<T> =
  | { data: T; meta?: { total?: number; lastSync?: string } }
  | { error: { code: string; message: string; details?: unknown } };
```

**Write-through for `POST /api/relations`:**

```
1. Validate from_issue exists & role='earning'         → else 400 ISSUE_NOT_EARNING
2. Validate to_issue   exists & role='redemption'      → else 400 ISSUE_NOT_REDEMPTION
3. Validate fromId != toId                             → else 400 SELF_LINK
4. If relation already in DB → return 200 ALREADY_LINKED (idempotent)
5. POST /issues/{from_earning_id}/relations.json to Redmine
6. On success → insert issue_relations with created_locally=1
7. On 422 "Relation already exists" → fetch existing, upsert, return ALREADY_LINKED
8. On other error → bubble up as REDMINE_HTTP_<status>
```

---

## 7. FIFO matching algorithm

### Signature

```ts
type FIFOInput = {
  earnings:    Array<{ id: number; earned: number;   anchorDate: string }>;
  redemptions: Array<{ id: number; requested: number; anchorDate: string }>;
  relations:   Array<{ earningId: number; redemptionId: number }>;  // 'relates' only, cross-kind
};

type Allocation = { earningId: number; redemptionId: number; hours: number };

type FIFOResult = {
  allocations: Allocation[];
  perEarning:    Map<number, { earned: number; consumed: number; remaining: number }>;
  perRedemption: Map<number, { requested: number; covered: number; unlinked: number }>;
  totals: { earned: number; redeemed: number; available: number; unlinkedHours: number };
};
```

### Algorithm (pseudocode)

```
sort redemptions by anchorDate ASC, tie-break by id ASC
sort earnings    by anchorDate ASC, tie-break by id ASC

consumedByEarning := Map<earningId, 0>
allocations := []

for each R in redemptions (in sorted order):
    linkedEarnings := earnings filtered by (∃ relation { earningId, R.id }),
                      sorted ASC by anchorDate, tie-break by id
    remaining := R.requested

    for each E in linkedEarnings:
        available := E.earned - consumedByEarning[E.id]
        if available <= 0: continue
        give := min(remaining, available)
        allocations.push({ earningId: E.id, redemptionId: R.id, hours: give })
        consumedByEarning[E.id] += give
        remaining -= give
        if remaining == 0: break

    R.unlinked := remaining

emit perEarning, perRedemption, totals as above
```

### Semantics

| Rule | Rationale |
|---|---|
| Anchor date = `MIN(time_entries.spent_on)`, fallback `created_on` | When I *started* working on that issue |
| Redemption ordering: ASC by anchor | Older redemption consumes first — historical fact |
| Earning ordering inside `linkedEarnings`: ASC by anchor | Classic FIFO — oldest earned hour redeemed first |
| Only `relates`, only cross-kind | Other relation types and same-kind links are ignored |
| `is_closed = 1` still counts | Status closure ≠ erased hours |
| Determinism via tie-break on id ASC | Same inputs → same allocations always |
| `R.unlinked > 0` does NOT decrement balance | It surfaces as a warning; balance only reflects legally consumed hours |

### Edge cases

1. **Redemption exceeds linkedEarnings:** allocates what it can; remainder → `R.unlinked > 0`.
2. **Redemption links to multiple earnings:** FIFO by earning anchor date — oldest first.
3. **Earning with 0 hours (no overtime entries yet):** `available <= 0` → skipped.
4. **Redemption with 0 hours (draft):** allocations empty; not a problem.
5. **Self-link or cross-role violation:** filtered out of `linkedEarnings`; logged.
6. **Floating-point hours:** computed in `number` (IEEE-754); displayed via `.toFixed(2)`; comparisons use `<=`/`>=`, never `==`.

### Performance

- O(R × E_per_R). For personal use (hundreds of issues max) → sub-millisecond per call.
- Computed live on every query that needs allocations (no cache in v1). If volume ever grows >5k issues, introduce `matching_snapshot` table invalidated on sync + relation write.

---

## 8. UI design

### Aesthetic mandate

Look and feel must match contemporary product apps (Linear, Vercel dashboard, Cal.com, Arc), not 2005-era enterprise forms. Concrete requirements:

- **Dark mode default** (light mode toggle in Settings).
- **shadcn/ui + Tailwind**, neutral zinc palette; accent color reserved for balance / warnings only.
- **Inter font** with `font-feature-settings: "cv11"` for tabular figures (balance counter alignment).
- **Soft shadows, `rounded-2xl` cards**, subtle gradient backgrounds (`zinc-950` + faint noise, not pure black).
- **Framer Motion** for route transitions, modal entry/exit, list item enter/leave, animated balance counter (`useMotionValue`).
- **cmdk** command palette (`Cmd/Ctrl+K`): quick navigation, jump to issue by id, "Sync now" action.
- **sonner** toasts, bottom-right.
- **Skeleton loaders** on all async surfaces (TanStack Query `placeholderData`).
- **Empty states** with lucide icons + tasteful copy, not bare numbers.
- **Glass-like overlay** for modals (`backdrop-blur` + low-opacity background).

### Routes (TanStack Router)

```
/                     Dashboard — hero balance + recent activity + warnings
/earning              Earning list — issues with overtime hours; FIFO order; earned/consumed/remaining
/redemptions          Redemption list — covered/unlinked per issue
/unlinked             Manual linking UI — redemptions without 'relates' to an earning
/issue/$id            Issue detail — metadata, time entries, linked counterparts
/timeline             Earned vs redeemed monthly chart + cumulative balance
/sync                 Sync history + manual "Sync now"
/settings             Redmine connection health, tracker/activity ID mapping, DB stats, theme toggle
```

### Layout (root)

```
┌─────────────────────────────────────────────────────────────────┐
│ [Overtide]  Dashboard ▸ Earning ▸ Redemptions ▸ Unlinked ▸ …   │
│                                                                 │
│ [BalancePill 18.5h ●]            [Last sync 2h ago ↻]  [⚙]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      [route content]                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key components

| Component | Purpose |
|---|---|
| `<BalanceCard/>` | Dashboard hero: available + earned + redeemed + animated delta |
| `<IssueTable/>` | shadcn DataTable; reused for earning/redemption with different column sets |
| `<IssueDetailPanel/>` | Side drawer with metadata, time entries timeline, linked counterparts |
| `<RelationLinker/>` | Modal on `/unlinked`: pick earnings to link to a redemption; "Suggest FIFO" pre-selects per algorithm; user clicks final "Link selected" |
| `<TimelineChart/>` | Recharts stacked bar (earned vs redeemed/mo) + line for cumulative balance |
| `<UnlinkedBanner/>` | Persistent dashboard banner when `unlinkedHours > 0`; click → `/unlinked` |
| `<SyncRunBadge/>` | Top-right indicator showing relative time + click → `/sync` |
| `<EmptyState/>` | "Click Sync to fetch from Redmine" + lucide icon when DB empty |

### Earning table columns

| Issue | Project | Anchor date | Earned | Consumed | Remaining | Status | Open ↗ |

### Redemption table columns

| Issue | Project | Anchor date | Requested | Covered | Unlinked | Linked earnings | Open ↗ |

### `/unlinked` UX

For each redemption with `unlinked > 0`, a "Pick earning to link" trigger opens a `<RelationLinker>` modal listing earnings with `remaining > 0`, sorted ascending by anchor. "Suggest FIFO" pre-checks earnings until coverage is achieved; user confirms with "Link selected (N)". Multiple POSTs to `/api/relations` happen serially; toast on each.

### Issue detail panel

Split visibility for transparency:

```
Issue total spent: 10.0h
   ├─ Overtime activity:    2.0h  ← earning hours
   └─ Other activities:     8.0h  ← regular dev work, ignored by balance

Linked redemptions consuming this earning:
   ─ #1240 "Wolne 2026-04-20"   2.0h  (full consume)
```

---

## 9. Error handling

### Layered defence

| Layer | Handling |
|---|---|
| Network / Redmine HTTP | 3-attempt retry on 429 + 5xx with exponential backoff (250ms→1s→4s); 15s timeout per attempt; 401/403 fail-fast |
| Sync orchestrator | `try/finally` on the whole run; `sync_runs.status='failed'` + truncated `error_message` on uncaught; atomic per object type so partial progress survives |
| FIFO matching | Defensive filters for `tracker_kind`, cross-kind relations, malformed payloads; log warning, skip bad rows |
| API ↔ web | TanStack Query `retry: 2` on 5xx, `retry: 0` on 4xx; global `onError` toast |
| Concurrent sync | Unique index on `sync_runs(status='running')`; second concurrent `POST /api/sync` → 409 `SYNC_IN_PROGRESS` |
| Negative balance | Loud-fail: `/api/balance` returns 200 with payload, plus `errors: [{ code: 'DEFICIT_DETECTED', earned, redeemed, delta }]`; FE shows red full-width banner |

### Error code catalogue

- `AUTH_NOT_CONFIGURED` — neither API key nor user/pass in env
- `REDMINE_AUTH_FAILED` — 401/403
- `REDMINE_REST_DISABLED` — heuristic: 404 or HTML response on `/users/current.json`
- `REDMINE_UNREACHABLE` — DNS / TCP / TLS errors
- `REDMINE_TIMEOUT` — 3× 15s exceeded
- `REDMINE_RATE_LIMITED` — 429 after exhausting retries
- `REDMINE_HTTP_<status>` — other 4xx
- `REDEMPTION_TRACKER_NOT_FOUND` — `REDMINE_TRACKER_REDEMPTION_ID` doesn't exist in `/trackers.json`
- `OVERTIME_ACTIVITY_NOT_FOUND` — `REDMINE_ACTIVITY_OVERTIME_ID` doesn't exist in `/enumerations/time_entry_activities.json`
- `SYNC_IN_PROGRESS` — concurrent sync attempted (409)
- `ISSUE_NOT_EARNING` / `ISSUE_NOT_REDEMPTION` / `SELF_LINK` — relation POST validation
- `ALREADY_LINKED` — idempotent success (200)
- `RELATION_NOT_OWNED` — DELETE attempt on relation with `created_locally=0`
- `DEFICIT_DETECTED` — totals would go negative

### Logging

- Backend uses `pino`, pretty-print in dev. Sync errors are mirrored to `sync_runs.error_message`.
- Frontend errors → sonner toasts; full payload visible in `/sync` for failed runs.

### Explicit non-goals (v1)

- No retry queue for failed writes. POST relation errors surface immediately; user re-clicks.
- No conflict resolution for Redmine-side edits between syncs (overlap buffer of 7 days mitigates).
- No DB rollback if Redmine POST succeeded but local INSERT failed. Next sync corrects.

---

## 10. Testing strategy

| Layer | What | Tooling | Target coverage |
|---|---|---|---|
| Unit | FIFO algorithm, Redmine normalizers, FE selectors, zod schemas | Vitest | 90%+ in `matching/`, `redmine/`, `sync/normalize/` |
| Integration | Sync orchestrator end-to-end against MSW-mocked Redmine; DB upserts; write-through relations | Vitest + MSW + in-memory SQLite | 80%+ backend lines |
| E2E | Single smoke flow: launch → sync → link unlinked → balance updates | Playwright | 1 happy-path scenario |
| Manual | Visual polish, dark mode, motion smoothness | — | every release |

**Explicit skips (v1):** load testing, fuzzing, mutation testing.

### Notable test cases

**`matching/fifo.test.ts`** (table-driven, ~12–15 cases):
- 1:1 perfect cover
- 1 redemption splits across 2 earnings (FIFO order)
- redemption exceeds linked earnings → `unlinked > 0`
- orphan redemption (no relation) → `unlinked = requested`
- cross-kind violations are filtered
- tie-break by id ASC at equal anchor dates
- floating-point: `0.25 + 0.25 + 0.5 == 1.0` covered without precision drift

**`redmine/client.test.ts`:**
- retry on 429 with fake timers
- 401/403 → no retry, `REDMINE_AUTH_FAILED`
- 15s timeout → 3 attempts → `REDMINE_TIMEOUT`
- batch chunking when >50 issue ids

**`sync/orchestrator.test.ts` (MSW):**
- full first sync
- incremental sync with `from = lastSync − 7d`
- partial failure → `failed` run, next sync completes work (idempotent)
- classification: redemption tracker wins over overtime activity; warning logged
- concurrent sync attempt → 409

**`api/relations.test.ts`:**
- POST creates in Redmine + DB
- POST when already linked → 200 ALREADY_LINKED
- POST cross-role invalid → 400
- DELETE when `created_locally=0` → 403

**E2E (`e2e/smoke.spec.ts`):**
1. Boot api + web with seeded MSW fixture (3 earnings, 2 redemptions, 1 unlinked)
2. Click "Sync now"; assert toast + counters
3. Navigate `/unlinked`; assert 1 row
4. Click "Pick earning to link" → choose → Link
5. Assert `/unlinked` empty and balance updated

### Coverage gating

- `bun test --coverage` runs in pre-commit (lefthook) and CI
- CI fails if `matching/` < 90% or overall < 80%

### Fixtures

`apps/api/test/fixtures/redmine/` holds sanitized JSON snapshots of real Redmine responses (`/issues.json`, `/time_entries.json`, `/users/current.json`). Names/projects scrubbed.

---

## 11. Security

- App listens only on `127.0.0.1`. No external exposure.
- No auth on Overtide itself (single user, machine-bound).
- Redmine credentials live in `apps/api/.env`, git-ignored. `.env.example` ships in repo with placeholders.
- Backend redacts `password` and `api_key` from all log output (`pino` redact paths).
- Frontend never sees credentials — backend mediates all Redmine calls.

---

## 12. Open questions / future work

Out of scope for v1 but worth noting:

1. Auto-detection of `REDMINE_TRACKER_REDEMPTION_ID` and `REDMINE_ACTIVITY_OVERTIME_ID` via Settings page UI (dropdowns populated from `/trackers.json` and `/enumerations/time_entry_activities.json`).
2. Scheduled background sync (currently on-demand only).
3. Export to CSV (timeline + per-issue allocations).
4. Multi-user support (would need real auth on the app).
5. Migration from Basic Auth to API key once admin enables REST API exposure of personal keys.
6. PM2 / Task Scheduler config for auto-start.

---

## 13. Acceptance criteria for v1

The MVP is considered done when:

- [ ] `bun --filter api dev` and `bun --filter web dev` start with no errors against a working Redmine instance (`/users/current.json` returns 200).
- [ ] Clicking "Sync now" populates `issues`, `time_entries`, `issue_relations` tables and the dashboard renders a balance.
- [ ] FIFO allocation matches the table-driven test fixtures.
- [ ] `/unlinked` page lists redemptions without `relates` to an earning, and using the linker modal POSTs a relation to Redmine that survives a re-sync.
- [ ] Concurrent `POST /api/sync` returns 409.
- [ ] Deficit (if forced via fixtures) shows the loud-fail banner.
- [ ] Coverage gate passes (matching ≥ 90%, overall ≥ 80%).
- [ ] E2E smoke run is green.
- [ ] UI feels modern by manual inspection: dark mode, animated balance, cmdk works, no jarring layout shifts.
