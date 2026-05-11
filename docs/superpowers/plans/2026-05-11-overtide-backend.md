# Overtide Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Overtide REST API that mirrors Redmine into local SQLite, computes FIFO overtime allocations, and exposes a typed HTTP surface for the frontend.

**Architecture:** Bun monorepo with `apps/api` (Hono + Drizzle + SQLite) and `packages/shared` (zod schemas). Sync is on-demand; matching is a pure function recomputed per request. Redmine auth is HTTP Basic with env-var fallback to API key.

**Tech Stack:** Bun, Hono, Drizzle ORM, SQLite (`bun:sqlite`), zod, pino, **`bun test`** (NOT vitest), MSW, `@sinonjs/fake-timers` for fake-timer tests. TypeScript strict mode throughout.

**Spec reference:** `docs/superpowers/specs/2026-05-11-overtide-design.md`

---

## ⚠️ Test Runner Override (read first)

**This plan was originally written for Vitest, but Vitest 2.x on Windows + Bun cannot resolve `bun:sqlite` (its worker pool runs under Node).** The repo uses **`bun test`** as the canonical test runner instead. When you implement any task in this plan, apply these substitutions to every code block:

| Plan says | Use instead |
|---|---|
| `import { ... } from "vitest"` | `import { ... } from "bun:test"` |
| `import { vi } from "vitest"` | Remove. Use `@sinonjs/fake-timers` for fake timers (see below); use `mock()` from `bun:test` for spies. |
| `vi.useFakeTimers()` / `vi.useRealTimers()` | `import { install } from "@sinonjs/fake-timers";` then `const clock = install(); ... clock.uninstall();` |
| `vi.advanceTimersByTimeAsync(N)` | `await clock.tickAsync(N)` |
| `vi.fn()` | `import { mock } from "bun:test"; mock(impl?)` |
| `bunx vitest run <path>` | `bun test <path>` |
| `vitest.config.ts` | Not needed. Delete if present. |
| `await expect(promise).rejects.toThrow()` for Drizzle inserts | Use synchronous `.run()` / `.all()` / `.get()` on Drizzle queries and `expect(() => stmt.run()).toThrow()`. Drizzle's thenable trips `expect().rejects` under `bun test`. |

**Existing dependency notes:**
- `@sinonjs/fake-timers` + `@types/sinonjs__fake-timers` are already in `apps/api/devDependencies` (added by the db fix).
- Bun's test runner is invoked from each package: `cd apps/api && bun test` or `cd packages/shared && bun test`.
- `bun test <path>` filters by path; `bun test src/foo` runs only files under `src/foo`.

**Test scripts in `apps/api/package.json`** (already set):
```json
"test": "bun test",
"test:watch": "bun test --watch"
```

If you find this note conflicts with later guidance in this plan, the note wins.

---

## File Structure (locked)

```
overtide/
├── package.json                          (root, workspaces)
├── tsconfig.base.json
├── biome.json                            (lint+format)
├── .env.example
├── apps/
│   └── api/
│       ├── package.json
│       ├── tsconfig.json
│       ├── drizzle.config.ts
│       ├── vitest.config.ts
│       ├── .env                          (gitignored)
│       ├── data/                         (gitignored .db files)
│       ├── drizzle/                      (generated migrations)
│       ├── src/
│       │   ├── index.ts                  (Hono server entry)
│       │   ├── app.ts                    (Hono app factory, exported for tests)
│       │   ├── config/
│       │   │   └── env.ts                (zod-validated env loader)
│       │   ├── db/
│       │   │   ├── schema.ts             (Drizzle schema)
│       │   │   ├── client.ts             (DB connection factory)
│       │   │   └── queries.ts            (typed query helpers)
│       │   ├── redmine/
│       │   │   ├── auth.ts               (header builder)
│       │   │   ├── client.ts             (HTTP wrapper: retry/backoff/timeout)
│       │   │   ├── endpoints.ts          (typed endpoint wrappers)
│       │   │   └── types.ts              (Redmine payload types)
│       │   ├── sync/
│       │   │   ├── normalize.ts          (payload → DB rows)
│       │   │   ├── classify.ts           (role detection)
│       │   │   ├── lock.ts               (concurrent sync guard)
│       │   │   └── orchestrator.ts       (sync algorithm)
│       │   ├── matching/
│       │   │   └── fifo.ts               (computeFIFO pure function)
│       │   ├── lib/
│       │   │   ├── logger.ts             (pino setup)
│       │   │   └── envelope.ts           (response wrappers + AppError)
│       │   ├── middleware/
│       │   │   └── errors.ts             (error handler)
│       │   └── routes/
│       │       ├── health.ts
│       │       ├── sync.ts
│       │       ├── balance.ts
│       │       ├── issues.ts
│       │       ├── unlinked.ts
│       │       └── relations.ts
│       └── test/
│           ├── fixtures/redmine/         (sanitized JSON payloads)
│           └── helpers/                  (test DB factory, MSW server)
└── packages/
    └── shared/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts                  (re-exports)
            ├── envelope.ts               (ApiResponse, ApiError types + zod)
            └── domain.ts                 (Issue, Balance, Allocation schemas)
```

**Each file has one responsibility.** No file should grow past ~300 LOC; if it does, split.

---

## Phase 0 — Repo bootstrap

### Task 0.1: Root workspace setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `biome.json`
- Create: `.env.example`

- [ ] **Step 1: Write root `package.json`**

```json
{
  "name": "overtide",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "tsc -b apps/api packages/shared --noEmit"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["bun-types"]
  }
}
```

- [ ] **Step 3: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "files": { "ignore": ["node_modules", "dist", "drizzle", "data", "**/*.gen.ts"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true, "style": { "noNonNullAssertion": "off" } }
  },
  "organizeImports": { "enabled": true }
}
```

- [ ] **Step 4: Write `.env.example`**

```env
REDMINE_URL=https://redmine.example.com

# Auth — pick one block. If both set, API key wins.
REDMINE_USERNAME=your.login
REDMINE_PASSWORD=your-password
# REDMINE_API_KEY=

REDMINE_TRACKER_REDEMPTION_ID=12
REDMINE_ACTIVITY_OVERTIME_ID=8

PORT=8787
LOG_LEVEL=info
```

- [ ] **Step 5: Install root deps and commit**

```bash
bun install
git add package.json tsconfig.base.json biome.json .env.example bun.lock
git commit -m "chore: root workspace scaffolding"
```

Expected: `bun install` succeeds, root commit lands.

---

## Phase 1 — Shared package

### Task 1.1: Scaffold `packages/shared`

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: `packages/shared/package.json`**

```json
{
  "name": "@overtide/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": { "zod": "^3.23.0" }
}
```

- [ ] **Step 2: `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 3: `packages/shared/src/index.ts`**

```ts
export * from "./envelope";
export * from "./domain";
```

(Empty for now — Task 1.2 fills it.)

- [ ] **Step 4: Install**

```bash
bun install
```

### Task 1.2: Envelope + domain schemas (TDD)

**Files:**
- Create: `packages/shared/src/envelope.ts`
- Create: `packages/shared/src/domain.ts`
- Test: `packages/shared/src/envelope.test.ts`

- [ ] **Step 1: Write failing test `envelope.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { apiResponseSchema, type ApiResponse } from "./envelope";
import { z } from "zod";

describe("apiResponseSchema", () => {
  const wrap = apiResponseSchema(z.object({ value: z.number() }));

  it("parses success payload", () => {
    const parsed = wrap.parse({ data: { value: 42 } });
    expect(parsed).toEqual({ data: { value: 42 } });
  });

  it("parses error payload", () => {
    const parsed = wrap.parse({ error: { code: "X", message: "y" } });
    expect("error" in parsed).toBe(true);
  });

  it("rejects payload with both data and error", () => {
    expect(() => wrap.parse({ data: { value: 1 }, error: { code: "X", message: "y" } })).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
cd packages/shared && bunx vitest run
```

Expected: cannot find module `./envelope`.

- [ ] **Step 3: Implement `envelope.ts`**

```ts
import { z } from "zod";

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiMetaSchema = z.object({
  total: z.number().optional(),
  lastSync: z.string().optional(),
}).optional();
export type ApiMeta = z.infer<typeof apiMetaSchema>;

export const apiResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.union([
    z.object({ data, meta: apiMetaSchema }).strict(),
    z.object({ error: apiErrorSchema }).strict(),
  ]);

export type ApiResponse<T> = { data: T; meta?: ApiMeta } | { error: ApiError };
```

- [ ] **Step 4: Write `domain.ts`**

```ts
import { z } from "zod";

export const issueRoleSchema = z.enum(["earning", "redemption"]);
export type IssueRole = z.infer<typeof issueRoleSchema>;

export const issueSchema = z.object({
  id: z.number().int().positive(),
  role: issueRoleSchema,
  subject: z.string(),
  projectName: z.string(),
  trackerName: z.string(),
  statusName: z.string(),
  isClosed: z.boolean(),
  createdOn: z.string(),
  updatedOn: z.string(),
  anchorDate: z.string(),
  url: z.string().url(),
});
export type Issue = z.infer<typeof issueSchema>;

export const earningIssueSchema = issueSchema.extend({
  earned: z.number().nonnegative(),
  consumed: z.number().nonnegative(),
  remaining: z.number(),
});
export type EarningIssue = z.infer<typeof earningIssueSchema>;

export const redemptionIssueSchema = issueSchema.extend({
  requested: z.number().nonnegative(),
  covered: z.number().nonnegative(),
  unlinked: z.number().nonnegative(),
  linkedEarningIds: z.array(z.number().int().positive()),
});
export type RedemptionIssue = z.infer<typeof redemptionIssueSchema>;

export const balanceSchema = z.object({
  earned: z.number(),
  redeemed: z.number(),
  available: z.number(),
  unlinkedHours: z.number(),
});
export type Balance = z.infer<typeof balanceSchema>;

export const allocationSchema = z.object({
  earningId: z.number().int().positive(),
  redemptionId: z.number().int().positive(),
  hours: z.number().positive(),
});
export type Allocation = z.infer<typeof allocationSchema>;

export const syncRunSchema = z.object({
  id: z.number(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: z.enum(["running", "success", "failed"]),
  issuesUpserted: z.number(),
  timeEntriesUpserted: z.number(),
  relationsUpserted: z.number(),
  errorMessage: z.string().nullable(),
});
export type SyncRun = z.infer<typeof syncRunSchema>;
```

- [ ] **Step 5: Re-run tests, verify PASS**

```bash
bunx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): envelope + domain zod schemas with tests"
```

---

## Phase 2 — API skeleton

### Task 2.1: Bun + Hono server scaffolding

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/app.ts`

- [ ] **Step 1: `apps/api/package.json`**

```json
{
  "name": "@overtide/api",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun run scripts/migrate.ts",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "@hono/zod-validator": "^0.4.0",
    "@overtide/shared": "workspace:*",
    "drizzle-orm": "^0.36.0",
    "hono": "^4.6.0",
    "pino": "^9.5.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "drizzle-kit": "^0.28.0",
    "msw": "^2.6.0",
    "pino-pretty": "^11.3.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src", "test", "scripts"]
}
```

- [ ] **Step 3: `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "**/*.test.ts"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
```

- [ ] **Step 4: `apps/api/src/app.ts`**

```ts
import { Hono } from "hono";

export function createApp() {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ data: { ok: true } }));
  return app;
}
```

- [ ] **Step 5: `apps/api/src/index.ts`**

```ts
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 8787);
const app = createApp();

Bun.serve({ hostname: "127.0.0.1", port, fetch: app.fetch });
console.log(`Overtide API listening on http://127.0.0.1:${port}`);
```

- [ ] **Step 6: Install + smoke**

```bash
bun install
bun --filter @overtide/api dev &
sleep 1
curl -s http://127.0.0.1:8787/api/health
kill %1
```

Expected: `{"data":{"ok":true}}`

- [ ] **Step 7: Commit**

```bash
git add apps/api package.json bun.lock
git commit -m "feat(api): Bun + Hono skeleton with /api/health stub"
```

---

## Phase 3 — Env config (TDD)

### Task 3.1: zod-validated env loader

**Files:**
- Create: `apps/api/src/config/env.ts`
- Test: `apps/api/src/config/env.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const minimal = {
  REDMINE_URL: "https://r.example.com",
  REDMINE_TRACKER_REDEMPTION_ID: "12",
  REDMINE_ACTIVITY_OVERTIME_ID: "8",
};

describe("loadEnv", () => {
  it("prefers API key when both auth methods set", () => {
    const e = loadEnv({ ...minimal, REDMINE_API_KEY: "abc", REDMINE_USERNAME: "u", REDMINE_PASSWORD: "p" });
    expect(e.auth.kind).toBe("apiKey");
  });

  it("falls back to basic auth", () => {
    const e = loadEnv({ ...minimal, REDMINE_USERNAME: "u", REDMINE_PASSWORD: "p" });
    expect(e.auth).toEqual({ kind: "basic", username: "u", password: "p" });
  });

  it("throws AUTH_NOT_CONFIGURED when neither is set", () => {
    expect(() => loadEnv(minimal)).toThrow(/AUTH_NOT_CONFIGURED/);
  });

  it("coerces numeric ids", () => {
    const e = loadEnv({ ...minimal, REDMINE_USERNAME: "u", REDMINE_PASSWORD: "p" });
    expect(e.redemptionTrackerId).toBe(12);
    expect(e.overtimeActivityId).toBe(8);
  });

  it("rejects invalid URL", () => {
    expect(() => loadEnv({ ...minimal, REDMINE_URL: "not-a-url", REDMINE_USERNAME: "u", REDMINE_PASSWORD: "p" })).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
cd apps/api && bunx vitest run src/config
```

- [ ] **Step 3: Implement `env.ts`**

```ts
import { z } from "zod";

const rawSchema = z.object({
  REDMINE_URL: z.string().url(),
  REDMINE_USERNAME: z.string().min(1).optional(),
  REDMINE_PASSWORD: z.string().min(1).optional(),
  REDMINE_API_KEY: z.string().min(1).optional(),
  REDMINE_TRACKER_REDEMPTION_ID: z.coerce.number().int().positive(),
  REDMINE_ACTIVITY_OVERTIME_ID: z.coerce.number().int().positive(),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = {
  redmineUrl: string;
  auth: { kind: "apiKey"; apiKey: string } | { kind: "basic"; username: string; password: string };
  redemptionTrackerId: number;
  overtimeActivityId: number;
  port: number;
  logLevel: string;
};

export function loadEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Env {
  const parsed = rawSchema.parse(source);

  let auth: Env["auth"];
  if (parsed.REDMINE_API_KEY) {
    auth = { kind: "apiKey", apiKey: parsed.REDMINE_API_KEY };
  } else if (parsed.REDMINE_USERNAME && parsed.REDMINE_PASSWORD) {
    auth = { kind: "basic", username: parsed.REDMINE_USERNAME, password: parsed.REDMINE_PASSWORD };
  } else {
    throw new Error("AUTH_NOT_CONFIGURED: set REDMINE_API_KEY or REDMINE_USERNAME+REDMINE_PASSWORD");
  }

  return {
    redmineUrl: parsed.REDMINE_URL.replace(/\/$/, ""),
    auth,
    redemptionTrackerId: parsed.REDMINE_TRACKER_REDEMPTION_ID,
    overtimeActivityId: parsed.REDMINE_ACTIVITY_OVERTIME_ID,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
  };
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
bunx vitest run src/config
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config
git commit -m "feat(api): zod env loader with auth mode auto-detect"
```

---

## Phase 4 — Logger

### Task 4.1: pino with secret redaction

**Files:**
- Create: `apps/api/src/lib/logger.ts`

- [ ] **Step 1: Implement**

```ts
import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password", "*.password", "*.*.password",
      "apiKey", "*.apiKey",
      "authorization", "*.authorization",
      "REDMINE_PASSWORD", "REDMINE_API_KEY",
    ],
    censor: "[REDACTED]",
  },
  ...(isDev ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
});
```

- [ ] **Step 2: Smoke test (manual)**

```bash
cd apps/api
bun -e 'import("./src/lib/logger").then(({ logger }) => logger.info({ password: "secret" }, "hello"))'
```

Expected: log shows `password: '[REDACTED]'`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/logger.ts
git commit -m "feat(api): pino logger with redacted secrets"
```

---

## Phase 5 — DB schema (Drizzle)

### Task 5.1: Drizzle config + schema

**Files:**
- Create: `apps/api/drizzle.config.ts`
- Create: `apps/api/src/db/schema.ts`

- [ ] **Step 1: `apps/api/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: "./data/overtide.db" },
});
```

- [ ] **Step 2: Add `drizzle-orm`'s SQLite driver (Bun)**

Edit `apps/api/package.json` dependencies — add `"drizzle-orm": "^0.36.0"` already present; the SQLite driver lives inside `drizzle-orm/bun-sqlite`. No extra package needed.

- [ ] **Step 3: `apps/api/src/db/schema.ts`**

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const issues = sqliteTable(
  "issues",
  {
    id: integer("id").primaryKey(),
    role: text("role", { enum: ["earning", "redemption"] }).notNull(),
    trackerId: integer("tracker_id").notNull(),
    trackerName: text("tracker_name").notNull(),
    projectId: integer("project_id").notNull(),
    projectName: text("project_name").notNull(),
    subject: text("subject").notNull(),
    statusName: text("status_name").notNull(),
    isClosed: integer("is_closed", { mode: "boolean" }).notNull().default(false),
    authorId: integer("author_id"),
    assignedToId: integer("assigned_to_id"),
    createdOn: text("created_on").notNull(),
    updatedOn: text("updated_on").notNull(),
    startDate: text("start_date"),
    dueDate: text("due_date"),
    url: text("url").notNull(),
    rawJson: text("raw_json").notNull(),
  },
  (t) => ({ roleIdx: index("idx_issues_role").on(t.role) }),
);

export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: integer("id").primaryKey(),
    issueId: integer("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull(),
    hours: real("hours").notNull(),
    activityId: integer("activity_id").notNull(),
    activityName: text("activity_name").notNull(),
    spentOn: text("spent_on").notNull(),
    comments: text("comments"),
    createdOn: text("created_on").notNull(),
    updatedOn: text("updated_on").notNull(),
  },
  (t) => ({
    issueIdx: index("idx_te_issue").on(t.issueId),
    spentOnIdx: index("idx_te_spent_on").on(t.spentOn),
    activityIdx: index("idx_te_activity").on(t.activityId),
  }),
);

export const issueRelations = sqliteTable(
  "issue_relations",
  {
    id: integer("id").primaryKey(),
    issueFromId: integer("issue_from_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    issueToId: integer("issue_to_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull(),
    createdLocally: integer("created_locally", { mode: "boolean" }).notNull().default(false),
    mirroredAt: text("mirrored_at").notNull(),
  },
  (t) => ({
    fromIdx: index("idx_rel_from").on(t.issueFromId),
    toIdx: index("idx_rel_to").on(t.issueToId),
  }),
);

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status", { enum: ["running", "success", "failed"] }).notNull(),
    issuesUpserted: integer("issues_upserted").notNull().default(0),
    timeEntriesUpserted: integer("time_entries_upserted").notNull().default(0),
    relationsUpserted: integer("relations_upserted").notNull().default(0),
    errorMessage: text("error_message"),
  },
  (t) => ({
    runningGuard: uniqueIndex("uq_sync_running").on(t.status).where(sql`status = 'running'`),
  }),
);

export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

- [ ] **Step 4: Generate migration**

```bash
mkdir -p apps/api/data
cd apps/api && bun run db:generate
```

Expected: `drizzle/0000_<adjective>_<noun>.sql` file appears with `CREATE TABLE` statements.

- [ ] **Step 5: Commit**

```bash
git add apps/api/drizzle.config.ts apps/api/src/db/schema.ts apps/api/drizzle
git commit -m "feat(api): Drizzle schema for issues, time_entries, relations, sync_runs, app_config"
```

### Task 5.2: DB client + migration runner

**Files:**
- Create: `apps/api/src/db/client.ts`
- Create: `apps/api/scripts/migrate.ts`

- [ ] **Step 1: `src/db/client.ts`**

```ts
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

export type Db = BunSQLiteDatabase<typeof schema>;

export function createDb(path: string): Db {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") sqlite.exec("PRAGMA journal_mode = WAL;");
  const db = drizzle(sqlite, { schema });
  // Auto-migrate on every boot — idempotent for drizzle's migration journal,
  // and required for `:memory:` databases used in tests / Playwright.
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
```

- [ ] **Step 2: `scripts/migrate.ts`**

```ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const dbPath = process.env.DB_PATH ?? "./data/overtide.db";
const sqlite = new Database(dbPath);
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: "./drizzle" });
console.log(`Migrated ${dbPath}`);
```

- [ ] **Step 3: Run migration**

```bash
cd apps/api && bun run db:migrate
```

Expected: `Migrated ./data/overtide.db`. Run `sqlite3 data/overtide.db ".tables"` if `sqlite3` CLI is around — should list 5 tables.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/client.ts apps/api/scripts/migrate.ts
git commit -m "feat(api): DB client factory + migration script"
```

### Task 5.3: Schema smoke test (TDD)

**Files:**
- Test: `apps/api/src/db/schema.test.ts`

- [ ] **Step 1: Write test**

```ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

function memDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("schema", () => {
  it("inserts and selects an issue", async () => {
    const db = memDb();
    await db.insert(schema.issues).values({
      id: 1, role: "earning", trackerId: 1, trackerName: "Development",
      projectId: 1, projectName: "P", subject: "S", statusName: "Open",
      createdOn: "2026-01-01T00:00:00Z", updatedOn: "2026-01-01T00:00:00Z",
      url: "https://r/issues/1", rawJson: "{}",
    });
    const rows = await db.select().from(schema.issues);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("earning");
  });

  it("rejects second running sync_run (unique index)", async () => {
    const db = memDb();
    await db.insert(schema.syncRuns).values({ startedAt: "t1", status: "running" });
    await expect(
      db.insert(schema.syncRuns).values({ startedAt: "t2", status: "running" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify PASS**

```bash
bunx vitest run src/db
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/db/schema.test.ts
git commit -m "test(api): schema smoke + concurrent-sync unique index"
```

---

## Phase 6 — Redmine client

### Task 6.1: Auth header builder (TDD)

**Files:**
- Create: `apps/api/src/redmine/auth.ts`
- Test: `apps/api/src/redmine/auth.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { buildAuthHeaders } from "./auth";

const base = { redmineUrl: "x", redemptionTrackerId: 1, overtimeActivityId: 1, port: 1, logLevel: "info" };

describe("buildAuthHeaders", () => {
  it("emits X-Redmine-API-Key when apiKey auth", () => {
    const env: Env = { ...base, auth: { kind: "apiKey", apiKey: "abc" } };
    expect(buildAuthHeaders(env)).toEqual({ "X-Redmine-API-Key": "abc" });
  });

  it("emits Basic auth when basic", () => {
    const env: Env = { ...base, auth: { kind: "basic", username: "u", password: "p" } };
    const expected = `Basic ${Buffer.from("u:p").toString("base64")}`;
    expect(buildAuthHeaders(env)).toEqual({ Authorization: expected });
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { Env } from "../config/env";

export function buildAuthHeaders(env: Env): Record<string, string> {
  if (env.auth.kind === "apiKey") return { "X-Redmine-API-Key": env.auth.apiKey };
  const token = Buffer.from(`${env.auth.username}:${env.auth.password}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}
```

- [ ] **Step 3: PASS + commit**

```bash
bunx vitest run src/redmine/auth
git add apps/api/src/redmine/auth.ts apps/api/src/redmine/auth.test.ts
git commit -m "feat(redmine): auth header builder (Basic + API key)"
```

### Task 6.2: HTTP client with retry/backoff/timeout (TDD)

**Files:**
- Create: `apps/api/src/redmine/client.ts`
- Test: `apps/api/src/redmine/client.test.ts`
- Test: `apps/api/test/helpers/msw.ts`

- [ ] **Step 1: MSW test helper**

```ts
// apps/api/test/helpers/msw.ts
import { setupServer } from "msw/node";
import type { RequestHandler } from "msw";
export function startMsw(...handlers: RequestHandler[]) {
  const server = setupServer(...handlers);
  server.listen({ onUnhandledRequest: "error" });
  return server;
}
```

- [ ] **Step 2: Write failing test**

```ts
// apps/api/src/redmine/client.test.ts
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMsw } from "../../test/helpers/msw";
import { RedmineClient, RedmineError } from "./client";

const env = { redmineUrl: "https://r.test", auth: { kind: "apiKey" as const, apiKey: "k" }, redemptionTrackerId: 1, overtimeActivityId: 1, port: 0, logLevel: "info" };

let server: ReturnType<typeof startMsw>;
afterEach(() => server.close());

describe("RedmineClient", () => {
  it("returns parsed JSON on 200", async () => {
    server = startMsw(http.get("https://r.test/users/current.json", () => HttpResponse.json({ user: { id: 7 } })));
    const c = new RedmineClient(env);
    const body = await c.get("/users/current.json");
    expect(body).toEqual({ user: { id: 7 } });
  });

  it("retries up to 3 times on 429 then succeeds", async () => {
    vi.useFakeTimers();
    let calls = 0;
    server = startMsw(http.get("https://r.test/x.json", () => {
      calls += 1;
      if (calls < 3) return new HttpResponse(null, { status: 429 });
      return HttpResponse.json({ ok: true });
    }));
    const c = new RedmineClient(env);
    const promise = c.get("/x.json");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await promise).toEqual({ ok: true });
    expect(calls).toBe(3);
    vi.useRealTimers();
  });

  it("fails fast on 401 with REDMINE_AUTH_FAILED", async () => {
    server = startMsw(http.get("https://r.test/x.json", () => new HttpResponse(null, { status: 401 })));
    const c = new RedmineClient(env);
    await expect(c.get("/x.json")).rejects.toMatchObject({ code: "REDMINE_AUTH_FAILED" });
  });
});
```

- [ ] **Step 3: Implement `client.ts`**

```ts
import type { Env } from "../config/env";
import { logger } from "../lib/logger";
import { buildAuthHeaders } from "./auth";

export class RedmineError extends Error {
  constructor(public code: string, public status: number, public path: string, message: string) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

export class RedmineClient {
  constructor(private env: Env) {}

  async get(path: string, params: Record<string, string | number | undefined> = {}): Promise<unknown> {
    const url = new URL(this.env.redmineUrl + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    return this.request("GET", url.toString());
  }

  async post(path: string, body: unknown): Promise<unknown> {
    return this.request("POST", this.env.redmineUrl + path, body);
  }

  async delete(path: string): Promise<unknown> {
    return this.request("DELETE", this.env.redmineUrl + path);
  }

  private async request(method: string, url: string, body?: unknown): Promise<unknown> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...buildAuthHeaders(this.env),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 401 || res.status === 403) {
          throw new RedmineError("REDMINE_AUTH_FAILED", res.status, url, "auth failed");
        }
        if (res.status === 429 || res.status >= 500) {
          if (attempt < MAX_ATTEMPTS) {
            await sleep(backoffMs(attempt));
            continue;
          }
          throw new RedmineError(
            res.status === 429 ? "REDMINE_RATE_LIMITED" : `REDMINE_HTTP_${res.status}`,
            res.status, url, `failed after ${MAX_ATTEMPTS} attempts`,
          );
        }
        if (!res.ok) {
          throw new RedmineError(`REDMINE_HTTP_${res.status}`, res.status, url, await res.text());
        }
        if (res.status === 204) return null;
        return await res.json();
      } catch (e) {
        if (e instanceof RedmineError && e.code === "REDMINE_AUTH_FAILED") throw e;
        if (e instanceof Error && e.name === "TimeoutError") {
          if (attempt < MAX_ATTEMPTS) {
            await sleep(backoffMs(attempt));
            continue;
          }
          throw new RedmineError("REDMINE_TIMEOUT", 0, url, "15s exceeded after 3 attempts");
        }
        lastErr = e;
        if (attempt === MAX_ATTEMPTS) throw e;
      }
    }
    throw lastErr;
  }
}

function backoffMs(attempt: number) {
  return [250, 1000, 4000][attempt - 1] ?? 4000;
}
function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
```

- [ ] **Step 4: PASS + commit**

```bash
bunx vitest run src/redmine
git add apps/api/src/redmine/client.ts apps/api/src/redmine/client.test.ts apps/api/test/helpers/msw.ts
git commit -m "feat(redmine): http client with retry/backoff/timeout"
```

### Task 6.3: Typed endpoint wrappers + Redmine types

**Files:**
- Create: `apps/api/src/redmine/types.ts`
- Create: `apps/api/src/redmine/endpoints.ts`
- Test: `apps/api/src/redmine/endpoints.test.ts`

- [ ] **Step 1: `types.ts`** (zod-validated Redmine payloads)

```ts
import { z } from "zod";

export const redmineUserSchema = z.object({ id: z.number(), login: z.string().optional() });
export const usersCurrentResponseSchema = z.object({ user: redmineUserSchema });

export const redmineTimeEntrySchema = z.object({
  id: z.number(),
  user: z.object({ id: z.number() }),
  issue: z.object({ id: z.number() }),
  hours: z.number(),
  activity: z.object({ id: z.number(), name: z.string() }),
  spent_on: z.string(),
  comments: z.string().nullable().optional(),
  created_on: z.string(),
  updated_on: z.string(),
});
export const timeEntriesResponseSchema = z.object({
  time_entries: z.array(redmineTimeEntrySchema),
  total_count: z.number(),
  offset: z.number(),
  limit: z.number(),
});

export const redmineRelationSchema = z.object({
  id: z.number(),
  issue_id: z.number(),
  issue_to_id: z.number(),
  relation_type: z.string(),
});

export const redmineIssueSchema = z.object({
  id: z.number(),
  project: z.object({ id: z.number(), name: z.string() }),
  tracker: z.object({ id: z.number(), name: z.string() }),
  status: z.object({ id: z.number(), name: z.string(), is_closed: z.boolean().optional() }),
  author: z.object({ id: z.number() }).optional(),
  assigned_to: z.object({ id: z.number() }).optional(),
  subject: z.string(),
  created_on: z.string(),
  updated_on: z.string(),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  relations: z.array(redmineRelationSchema).optional(),
});
export const issuesResponseSchema = z.object({
  issues: z.array(redmineIssueSchema),
  total_count: z.number(),
});

export const trackerSchema = z.object({ id: z.number(), name: z.string() });
export const trackersResponseSchema = z.object({ trackers: z.array(trackerSchema) });

export const activitySchema = z.object({ id: z.number(), name: z.string() });
export const activitiesResponseSchema = z.object({ time_entry_activities: z.array(activitySchema) });

export type RedmineTimeEntry = z.infer<typeof redmineTimeEntrySchema>;
export type RedmineIssue = z.infer<typeof redmineIssueSchema>;
export type RedmineRelation = z.infer<typeof redmineRelationSchema>;
```

- [ ] **Step 2: `endpoints.ts`**

```ts
import { RedmineClient } from "./client";
import {
  activitiesResponseSchema, issuesResponseSchema, timeEntriesResponseSchema,
  trackersResponseSchema, usersCurrentResponseSchema, type RedmineIssue, type RedmineTimeEntry,
} from "./types";

export class RedmineEndpoints {
  constructor(private c: RedmineClient) {}

  async currentUserId(): Promise<number> {
    const raw = await this.c.get("/users/current.json");
    return usersCurrentResponseSchema.parse(raw).user.id;
  }

  async trackers() {
    const raw = await this.c.get("/trackers.json");
    return trackersResponseSchema.parse(raw).trackers;
  }

  async activities() {
    const raw = await this.c.get("/enumerations/time_entry_activities.json");
    return activitiesResponseSchema.parse(raw).time_entry_activities;
  }

  async timeEntries(opts: { userId: number; from?: string; limit?: number; offset?: number }) {
    const raw = await this.c.get("/time_entries.json", {
      user_id: opts.userId, limit: opts.limit ?? 100, offset: opts.offset ?? 0, from: opts.from,
    });
    return timeEntriesResponseSchema.parse(raw);
  }

  async *iterAllTimeEntries(opts: { userId: number; from?: string }): AsyncIterable<RedmineTimeEntry> {
    let offset = 0;
    const limit = 100;
    while (true) {
      const page = await this.timeEntries({ ...opts, offset, limit });
      for (const e of page.time_entries) yield e;
      if (page.time_entries.length < limit) return;
      offset += limit;
    }
  }

  async issuesByIds(ids: number[]): Promise<RedmineIssue[]> {
    if (ids.length === 0) return [];
    const out: RedmineIssue[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const raw = await this.c.get("/issues.json", {
        issue_id: chunk.join(","), status_id: "*", include: "relations", limit: 100,
      });
      out.push(...issuesResponseSchema.parse(raw).issues);
    }
    return out;
  }

  async createRelation(fromId: number, toId: number, type = "relates"): Promise<{ id: number }> {
    const raw = await this.c.post(`/issues/${fromId}/relations.json`, {
      relation: { issue_to_id: toId, relation_type: type },
    });
    const parsed = (raw as { relation: { id: number } }).relation;
    return { id: parsed.id };
  }

  async deleteRelation(id: number): Promise<void> {
    await this.c.delete(`/relations/${id}.json`);
  }
}
```

- [ ] **Step 3: Test** (covers happy paths with MSW)

```ts
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { startMsw } from "../../test/helpers/msw";
import { RedmineClient } from "./client";
import { RedmineEndpoints } from "./endpoints";

const env = { redmineUrl: "https://r.test", auth: { kind: "apiKey" as const, apiKey: "k" }, redemptionTrackerId: 1, overtimeActivityId: 1, port: 0, logLevel: "info" };

let server: ReturnType<typeof startMsw>;
afterEach(() => server.close());

describe("RedmineEndpoints", () => {
  it("currentUserId returns user.id", async () => {
    server = startMsw(http.get("https://r.test/users/current.json", () =>
      HttpResponse.json({ user: { id: 42 } })));
    const e = new RedmineEndpoints(new RedmineClient(env));
    expect(await e.currentUserId()).toBe(42);
  });

  it("issuesByIds chunks ids in groups of 50", async () => {
    const seenChunks: string[] = [];
    server = startMsw(http.get("https://r.test/issues.json", ({ request }) => {
      const url = new URL(request.url);
      seenChunks.push(url.searchParams.get("issue_id") ?? "");
      return HttpResponse.json({ issues: [], total_count: 0 });
    }));
    const e = new RedmineEndpoints(new RedmineClient(env));
    await e.issuesByIds(Array.from({ length: 75 }, (_, i) => i + 1));
    expect(seenChunks).toHaveLength(2);
    expect(seenChunks[0]?.split(",")).toHaveLength(50);
    expect(seenChunks[1]?.split(",")).toHaveLength(25);
  });
});
```

- [ ] **Step 4: PASS + commit**

```bash
bunx vitest run src/redmine
git add apps/api/src/redmine/types.ts apps/api/src/redmine/endpoints.ts apps/api/src/redmine/endpoints.test.ts
git commit -m "feat(redmine): typed endpoint wrappers with zod validation"
```

---

## Phase 7 — Sync subsystem

### Task 7.1: Normalizers (TDD)

**Files:**
- Create: `apps/api/src/sync/normalize.ts`
- Test: `apps/api/src/sync/normalize.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import type { RedmineIssue, RedmineTimeEntry } from "../redmine/types";
import { normalizeIssue, normalizeTimeEntry } from "./normalize";

const baseIssue: RedmineIssue = {
  id: 1, project: { id: 1, name: "P" }, tracker: { id: 5, name: "Dev" },
  status: { id: 1, name: "Open", is_closed: false }, subject: "Hello",
  created_on: "2026-01-01T00:00:00Z", updated_on: "2026-01-02T00:00:00Z",
};

describe("normalizeIssue", () => {
  it("maps to DB shape with computed url and rawJson", () => {
    const row = normalizeIssue(baseIssue, "earning", "https://r.test");
    expect(row).toMatchObject({
      id: 1, role: "earning", trackerName: "Dev", projectName: "P",
      subject: "Hello", statusName: "Open", isClosed: false,
      url: "https://r.test/issues/1",
    });
    expect(JSON.parse(row.rawJson)).toEqual(baseIssue);
  });
});

describe("normalizeTimeEntry", () => {
  it("maps RedmineTimeEntry to DB row", () => {
    const te: RedmineTimeEntry = {
      id: 10, user: { id: 7 }, issue: { id: 1 }, hours: 2.5,
      activity: { id: 8, name: "Nadgodziny" }, spent_on: "2026-01-05",
      comments: null, created_on: "2026-01-05T00:00:00Z", updated_on: "2026-01-05T00:00:00Z",
    };
    expect(normalizeTimeEntry(te)).toMatchObject({
      id: 10, issueId: 1, userId: 7, hours: 2.5,
      activityId: 8, activityName: "Nadgodziny", spentOn: "2026-01-05",
    });
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { RedmineIssue, RedmineTimeEntry } from "../redmine/types";
import type { issues as IssuesTable, timeEntries as TETable } from "../db/schema";

type IssueRow = typeof IssuesTable.$inferInsert;
type TimeEntryRow = typeof TETable.$inferInsert;

export function normalizeIssue(i: RedmineIssue, role: "earning" | "redemption", redmineBaseUrl: string): IssueRow {
  return {
    id: i.id,
    role,
    trackerId: i.tracker.id,
    trackerName: i.tracker.name,
    projectId: i.project.id,
    projectName: i.project.name,
    subject: i.subject,
    statusName: i.status.name,
    isClosed: i.status.is_closed ?? false,
    authorId: i.author?.id ?? null,
    assignedToId: i.assigned_to?.id ?? null,
    createdOn: i.created_on,
    updatedOn: i.updated_on,
    startDate: i.start_date ?? null,
    dueDate: i.due_date ?? null,
    url: `${redmineBaseUrl.replace(/\/$/, "")}/issues/${i.id}`,
    rawJson: JSON.stringify(i),
  };
}

export function normalizeTimeEntry(t: RedmineTimeEntry): TimeEntryRow {
  return {
    id: t.id,
    issueId: t.issue.id,
    userId: t.user.id,
    hours: t.hours,
    activityId: t.activity.id,
    activityName: t.activity.name,
    spentOn: t.spent_on,
    comments: t.comments ?? null,
    createdOn: t.created_on,
    updatedOn: t.updated_on,
  };
}
```

- [ ] **Step 3: PASS + commit**

```bash
bunx vitest run src/sync/normalize
git add apps/api/src/sync/normalize.ts apps/api/src/sync/normalize.test.ts
git commit -m "feat(sync): payload normalizers"
```

### Task 7.2: Classifier (TDD)

**Files:**
- Create: `apps/api/src/sync/classify.ts`
- Test: `apps/api/src/sync/classify.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import type { RedmineIssue } from "../redmine/types";
import { classifyIssue } from "./classify";

const make = (trackerId: number): RedmineIssue => ({
  id: 1, project: { id: 1, name: "P" }, tracker: { id: trackerId, name: "T" },
  status: { id: 1, name: "Open" }, subject: "S",
  created_on: "2026-01-01T00:00:00Z", updated_on: "2026-01-02T00:00:00Z",
});

describe("classifyIssue", () => {
  const cfg = { redemptionTrackerId: 12, overtimeActivityId: 8 };

  it("returns 'redemption' when tracker matches", () => {
    expect(classifyIssue(make(12), [{ activity: { id: 8 } } as any], cfg)).toBe("redemption");
  });

  it("returns 'earning' when any time entry has overtime activity", () => {
    expect(classifyIssue(make(5), [{ activity: { id: 8 } } as any], cfg)).toBe("earning");
  });

  it("returns null when no overtime entries and not redemption", () => {
    expect(classifyIssue(make(5), [{ activity: { id: 99 } } as any], cfg)).toBeNull();
  });

  it("redemption tracker wins even when entries have overtime activity (with warning expected at caller)", () => {
    expect(classifyIssue(make(12), [{ activity: { id: 8 } } as any], cfg)).toBe("redemption");
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { RedmineIssue, RedmineTimeEntry } from "../redmine/types";

export function classifyIssue(
  issue: RedmineIssue,
  timeEntries: Pick<RedmineTimeEntry, "activity">[],
  cfg: { redemptionTrackerId: number; overtimeActivityId: number },
): "earning" | "redemption" | null {
  if (issue.tracker.id === cfg.redemptionTrackerId) return "redemption";
  if (timeEntries.some((t) => t.activity.id === cfg.overtimeActivityId)) return "earning";
  return null;
}
```

- [ ] **Step 3: PASS + commit**

```bash
bunx vitest run src/sync/classify
git add apps/api/src/sync/classify.ts apps/api/src/sync/classify.test.ts
git commit -m "feat(sync): role classifier"
```

### Task 7.3: Concurrent sync lock (TDD)

**Files:**
- Create: `apps/api/src/sync/lock.ts`
- Test: `apps/api/src/sync/lock.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { acquireSyncRun, finishSyncRun, SyncInProgressError } from "./lock";

function memDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("sync lock", () => {
  it("rejects second acquire while first is running", async () => {
    const db = memDb();
    await acquireSyncRun(db);
    await expect(acquireSyncRun(db)).rejects.toBeInstanceOf(SyncInProgressError);
  });

  it("allows new acquire after finish", async () => {
    const db = memDb();
    const first = await acquireSyncRun(db);
    await finishSyncRun(db, first.id, { status: "success", issuesUpserted: 1, timeEntriesUpserted: 2, relationsUpserted: 3 });
    const second = await acquireSyncRun(db);
    expect(second.id).not.toBe(first.id);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { syncRuns } from "../db/schema";

export class SyncInProgressError extends Error {
  code = "SYNC_IN_PROGRESS" as const;
}

export async function acquireSyncRun(db: Db): Promise<{ id: number }> {
  try {
    const [row] = await db
      .insert(syncRuns)
      .values({ startedAt: new Date().toISOString(), status: "running" })
      .returning({ id: syncRuns.id });
    if (!row) throw new Error("insert returned no row");
    return row;
  } catch (e) {
    if (e instanceof Error && /unique/i.test(e.message)) throw new SyncInProgressError();
    throw e;
  }
}

export async function finishSyncRun(
  db: Db,
  id: number,
  result: {
    status: "success" | "failed";
    issuesUpserted?: number;
    timeEntriesUpserted?: number;
    relationsUpserted?: number;
    errorMessage?: string;
  },
): Promise<void> {
  await db.update(syncRuns).set({
    status: result.status,
    finishedAt: new Date().toISOString(),
    issuesUpserted: result.issuesUpserted ?? 0,
    timeEntriesUpserted: result.timeEntriesUpserted ?? 0,
    relationsUpserted: result.relationsUpserted ?? 0,
    errorMessage: result.errorMessage ?? null,
  }).where(eq(syncRuns.id, id));
}
```

- [ ] **Step 3: PASS + commit**

```bash
bunx vitest run src/sync/lock
git add apps/api/src/sync/lock.ts apps/api/src/sync/lock.test.ts
git commit -m "feat(sync): concurrent run guard via unique index"
```

### Task 7.4: Sync orchestrator (integration, MSW + in-memory DB)

**Files:**
- Create: `apps/api/src/sync/orchestrator.ts`
- Test: `apps/api/src/sync/orchestrator.test.ts`
- Create: `apps/api/test/fixtures/redmine/sync_basic.ts`

- [ ] **Step 1: Fixture**

```ts
// apps/api/test/fixtures/redmine/sync_basic.ts
export const fixtureSync = {
  user: { id: 7 },
  timeEntries: [
    { id: 100, user: { id: 7 }, issue: { id: 1 }, hours: 2, activity: { id: 8, name: "Nadgodziny" }, spent_on: "2026-01-10", comments: null, created_on: "2026-01-10T00:00:00Z", updated_on: "2026-01-10T00:00:00Z" },
    { id: 101, user: { id: 7 }, issue: { id: 1 }, hours: 1, activity: { id: 99, name: "Other" }, spent_on: "2026-01-11", comments: null, created_on: "2026-01-11T00:00:00Z", updated_on: "2026-01-11T00:00:00Z" },
    { id: 102, user: { id: 7 }, issue: { id: 2 }, hours: 4, activity: { id: 99, name: "Other" }, spent_on: "2026-01-15", comments: null, created_on: "2026-01-15T00:00:00Z", updated_on: "2026-01-15T00:00:00Z" },
  ],
  issues: [
    { id: 1, project: { id: 1, name: "Dev" }, tracker: { id: 5, name: "Bug" }, status: { id: 1, name: "Open", is_closed: false }, subject: "Dev w/ overtime", created_on: "2026-01-01T00:00:00Z", updated_on: "2026-01-11T00:00:00Z", relations: [{ id: 500, issue_id: 1, issue_to_id: 2, relation_type: "relates" }] },
    { id: 2, project: { id: 1, name: "Dev" }, tracker: { id: 12, name: "Odbior" }, status: { id: 1, name: "Open" }, subject: "Wolne", created_on: "2026-01-12T00:00:00Z", updated_on: "2026-01-15T00:00:00Z", relations: [{ id: 500, issue_id: 1, issue_to_id: 2, relation_type: "relates" }] },
  ],
};
```

- [ ] **Step 2: Failing test**

```ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { fixtureSync } from "../../test/fixtures/redmine/sync_basic";
import { startMsw } from "../../test/helpers/msw";
import { runSync } from "./orchestrator";
import { RedmineClient } from "../redmine/client";
import { RedmineEndpoints } from "../redmine/endpoints";

const env = { redmineUrl: "https://r.test", auth: { kind: "apiKey" as const, apiKey: "k" }, redemptionTrackerId: 12, overtimeActivityId: 8, port: 0, logLevel: "info" };

function memDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

let server: ReturnType<typeof startMsw>;
afterEach(() => server.close());

describe("runSync", () => {
  it("populates db end-to-end", async () => {
    server = startMsw(
      http.get("https://r.test/users/current.json", () => HttpResponse.json({ user: fixtureSync.user })),
      http.get("https://r.test/time_entries.json", () => HttpResponse.json({ time_entries: fixtureSync.timeEntries, total_count: 3, offset: 0, limit: 100 })),
      http.get("https://r.test/issues.json", () => HttpResponse.json({ issues: fixtureSync.issues, total_count: 2 })),
    );
    const db = memDb();
    const endpoints = new RedmineEndpoints(new RedmineClient(env));
    const result = await runSync({ db, endpoints, env });
    expect(result.status).toBe("success");

    const issues = await db.select().from(schema.issues);
    expect(issues).toHaveLength(2);
    expect(issues.find((i) => i.id === 1)?.role).toBe("earning");
    expect(issues.find((i) => i.id === 2)?.role).toBe("redemption");

    const tes = await db.select().from(schema.timeEntries);
    expect(tes).toHaveLength(3);

    const rels = await db.select().from(schema.issueRelations);
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ issueFromId: 1, issueToId: 2, relationType: "relates" });
  });
});
```

- [ ] **Step 3: Implement `orchestrator.ts`**

```ts
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { appConfig, issues, issueRelations, timeEntries } from "../db/schema";
import type { Env } from "../config/env";
import { logger } from "../lib/logger";
import type { RedmineEndpoints } from "../redmine/endpoints";
import type { RedmineIssue, RedmineTimeEntry } from "../redmine/types";
import { classifyIssue } from "./classify";
import { acquireSyncRun, finishSyncRun, SyncInProgressError } from "./lock";
import { normalizeIssue, normalizeTimeEntry } from "./normalize";

const OVERLAP_BUFFER_DAYS = 7;

export async function runSync(args: { db: Db; endpoints: RedmineEndpoints; env: Env }) {
  const { db, endpoints, env } = args;
  const run = await acquireSyncRun(db).catch((e) => {
    if (e instanceof SyncInProgressError) throw e;
    throw e;
  });
  try {
    const userId = await endpoints.currentUserId();

    const lastSync = await readConfig(db, "last_sync_at");
    const from = lastSync ? minusDaysIso(lastSync, OVERLAP_BUFFER_DAYS) : undefined;

    const fetchedTE: RedmineTimeEntry[] = [];
    for await (const te of endpoints.iterAllTimeEntries({ userId, from })) fetchedTE.push(te);

    const issueIds = Array.from(new Set(fetchedTE.map((t) => t.issue.id)));
    const fetchedIssues = await endpoints.issuesByIds(issueIds);

    // Build the candidate set of TEs per issue (fresh + already in DB)
    const issueIdSet = new Set(issueIds);
    const existingTE = issueIds.length === 0
      ? []
      : await db.select().from(timeEntries).where(inArray(timeEntries.issueId, issueIds));
    const tesByIssue = new Map<number, { activity: { id: number } }[]>();
    for (const t of existingTE) {
      const arr = tesByIssue.get(t.issueId) ?? [];
      arr.push({ activity: { id: t.activityId } });
      tesByIssue.set(t.issueId, arr);
    }
    for (const t of fetchedTE) {
      const arr = tesByIssue.get(t.issue.id) ?? [];
      arr.push({ activity: { id: t.activity.id } });
      tesByIssue.set(t.issue.id, arr);
    }

    type Classified = { issue: RedmineIssue; role: "earning" | "redemption" };
    const classified: Classified[] = [];
    for (const i of fetchedIssues) {
      const role = classifyIssue(i, tesByIssue.get(i.id) ?? [], env);
      if (role) classified.push({ issue: i, role });
    }
    const keptIds = new Set(classified.map((c) => c.issue.id));

    // Upsert in a transaction
    let issuesUpserted = 0;
    let teUpserted = 0;
    let relUpserted = 0;

    await db.transaction(async (tx) => {
      for (const { issue, role } of classified) {
        const row = normalizeIssue(issue, role, env.redmineUrl);
        await tx.insert(issues).values(row).onConflictDoUpdate({ target: issues.id, set: row });
        issuesUpserted += 1;
      }

      for (const te of fetchedTE) {
        if (!keptIds.has(te.issue.id)) continue;
        const owningRole = classified.find((c) => c.issue.id === te.issue.id)?.role;
        if (owningRole === "redemption" && te.activity.id === env.overtimeActivityId) {
          logger.warn({ teId: te.id, issueId: te.issue.id }, "overtime activity on redemption issue — ignored");
          continue;
        }
        const row = normalizeTimeEntry(te);
        await tx.insert(timeEntries).values(row).onConflictDoUpdate({ target: timeEntries.id, set: row });
        teUpserted += 1;
      }

      for (const { issue } of classified) {
        const fresh = (issue.relations ?? [])
          .filter((r) => r.relation_type === "relates")
          .filter((r) => keptIds.has(r.issue_id) && keptIds.has(r.issue_to_id));

        await tx.delete(issueRelations).where(eq(issueRelations.issueFromId, issue.id));
        for (const r of fresh) {
          await tx.insert(issueRelations).values({
            id: r.id, issueFromId: r.issue_id, issueToId: r.issue_to_id,
            relationType: r.relation_type, createdLocally: false,
            mirroredAt: new Date().toISOString(),
          }).onConflictDoUpdate({
            target: issueRelations.id,
            set: { issueFromId: r.issue_id, issueToId: r.issue_to_id, relationType: r.relation_type },
          });
          relUpserted += 1;
        }
      }

      await writeConfig(tx, "last_sync_at", new Date().toISOString());
    });

    await finishSyncRun(db, run.id, {
      status: "success",
      issuesUpserted, timeEntriesUpserted: teUpserted, relationsUpserted: relUpserted,
    });

    return { id: run.id, status: "success" as const, issuesUpserted, timeEntriesUpserted: teUpserted, relationsUpserted: relUpserted };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 2048) : String(e);
    await finishSyncRun(db, run.id, { status: "failed", errorMessage: msg });
    throw e;
  }
}

async function readConfig(db: Db, key: string): Promise<string | undefined> {
  const rows = await db.select().from(appConfig).where(eq(appConfig.key, key)).limit(1);
  return rows[0]?.value;
}

async function writeConfig(db: Db, key: string, value: string): Promise<void> {
  await db.insert(appConfig).values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: new Date().toISOString() } });
}

function minusDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: PASS + commit**

```bash
bunx vitest run src/sync
git add apps/api/src/sync/orchestrator.ts apps/api/src/sync/orchestrator.test.ts apps/api/test/fixtures
git commit -m "feat(sync): on-demand orchestrator with classification + write-through"
```

---

## Phase 8 — FIFO matching (TDD)

### Task 8.1: Pure function + table-driven tests

**Files:**
- Create: `apps/api/src/matching/fifo.ts`
- Test: `apps/api/src/matching/fifo.test.ts`

- [ ] **Step 1: Failing test (table-driven)**

```ts
import { describe, expect, it } from "vitest";
import { computeFIFO, type FIFOInput } from "./fifo";

type Case = {
  name: string;
  input: FIFOInput;
  expect: {
    totalsEarned: number;
    totalsRedeemed: number;
    totalsAvailable: number;
    totalsUnlinked: number;
    perEarning?: Record<number, { consumed: number; remaining: number }>;
    perRedemption?: Record<number, { covered: number; unlinked: number }>;
  };
};

const cases: Case[] = [
  {
    name: "1 OT, 1 R, perfect cover",
    input: {
      earnings: [{ id: 1, earned: 8, anchorDate: "2026-01-01" }],
      redemptions: [{ id: 10, requested: 8, anchorDate: "2026-01-05" }],
      relations: [{ earningId: 1, redemptionId: 10 }],
    },
    expect: { totalsEarned: 8, totalsRedeemed: 8, totalsAvailable: 0, totalsUnlinked: 0 },
  },
  {
    name: "R splits across 2 OTs FIFO",
    input: {
      earnings: [
        { id: 1, earned: 3, anchorDate: "2026-01-01" },
        { id: 2, earned: 5, anchorDate: "2026-01-10" },
      ],
      redemptions: [{ id: 10, requested: 7, anchorDate: "2026-02-01" }],
      relations: [{ earningId: 1, redemptionId: 10 }, { earningId: 2, redemptionId: 10 }],
    },
    expect: {
      totalsEarned: 8, totalsRedeemed: 7, totalsAvailable: 1, totalsUnlinked: 0,
      perEarning: { 1: { consumed: 3, remaining: 0 }, 2: { consumed: 4, remaining: 1 } },
    },
  },
  {
    name: "R exceeds linked → unlinked > 0",
    input: {
      earnings: [{ id: 1, earned: 2, anchorDate: "2026-01-01" }],
      redemptions: [{ id: 10, requested: 5, anchorDate: "2026-01-05" }],
      relations: [{ earningId: 1, redemptionId: 10 }],
    },
    expect: {
      totalsEarned: 2, totalsRedeemed: 2, totalsAvailable: 0, totalsUnlinked: 3,
      perRedemption: { 10: { covered: 2, unlinked: 3 } },
    },
  },
  {
    name: "orphan R (no relations)",
    input: {
      earnings: [{ id: 1, earned: 8, anchorDate: "2026-01-01" }],
      redemptions: [{ id: 10, requested: 4, anchorDate: "2026-01-05" }],
      relations: [],
    },
    expect: { totalsEarned: 8, totalsRedeemed: 0, totalsAvailable: 8, totalsUnlinked: 4 },
  },
  {
    name: "two R's compete for one OT (older first)",
    input: {
      earnings: [{ id: 1, earned: 5, anchorDate: "2026-01-01" }],
      redemptions: [
        { id: 10, requested: 3, anchorDate: "2026-02-01" },
        { id: 11, requested: 4, anchorDate: "2026-02-05" },
      ],
      relations: [{ earningId: 1, redemptionId: 10 }, { earningId: 1, redemptionId: 11 }],
    },
    expect: {
      totalsEarned: 5, totalsRedeemed: 5, totalsAvailable: 0, totalsUnlinked: 2,
      perRedemption: { 10: { covered: 3, unlinked: 0 }, 11: { covered: 2, unlinked: 2 } },
    },
  },
  {
    name: "tie-break by id at equal anchor",
    input: {
      earnings: [
        { id: 2, earned: 1, anchorDate: "2026-01-01" },
        { id: 1, earned: 1, anchorDate: "2026-01-01" },
      ],
      redemptions: [{ id: 10, requested: 1, anchorDate: "2026-02-01" }],
      relations: [{ earningId: 1, redemptionId: 10 }, { earningId: 2, redemptionId: 10 }],
    },
    expect: {
      totalsEarned: 2, totalsRedeemed: 1, totalsAvailable: 1, totalsUnlinked: 0,
      perEarning: { 1: { consumed: 1, remaining: 0 }, 2: { consumed: 0, remaining: 1 } },
    },
  },
  {
    name: "empty inputs",
    input: { earnings: [], redemptions: [], relations: [] },
    expect: { totalsEarned: 0, totalsRedeemed: 0, totalsAvailable: 0, totalsUnlinked: 0 },
  },
];

describe("computeFIFO", () => {
  for (const c of cases) {
    it(c.name, () => {
      const result = computeFIFO(c.input);
      expect(result.totals.earned).toBeCloseTo(c.expect.totalsEarned, 5);
      expect(result.totals.redeemed).toBeCloseTo(c.expect.totalsRedeemed, 5);
      expect(result.totals.available).toBeCloseTo(c.expect.totalsAvailable, 5);
      expect(result.totals.unlinkedHours).toBeCloseTo(c.expect.totalsUnlinked, 5);
      if (c.expect.perEarning) {
        for (const [idStr, exp] of Object.entries(c.expect.perEarning)) {
          const got = result.perEarning.get(Number(idStr))!;
          expect(got.consumed).toBeCloseTo(exp.consumed, 5);
          expect(got.remaining).toBeCloseTo(exp.remaining, 5);
        }
      }
      if (c.expect.perRedemption) {
        for (const [idStr, exp] of Object.entries(c.expect.perRedemption)) {
          const got = result.perRedemption.get(Number(idStr))!;
          expect(got.covered).toBeCloseTo(exp.covered, 5);
          expect(got.unlinked).toBeCloseTo(exp.unlinked, 5);
        }
      }
    });
  }
});
```

- [ ] **Step 2: Implement `fifo.ts`**

```ts
export type FIFOInput = {
  earnings: Array<{ id: number; earned: number; anchorDate: string }>;
  redemptions: Array<{ id: number; requested: number; anchorDate: string }>;
  relations: Array<{ earningId: number; redemptionId: number }>;
};

export type Allocation = { earningId: number; redemptionId: number; hours: number };

export type FIFOResult = {
  allocations: Allocation[];
  perEarning: Map<number, { earned: number; consumed: number; remaining: number }>;
  perRedemption: Map<number, { requested: number; covered: number; unlinked: number }>;
  totals: { earned: number; redeemed: number; available: number; unlinkedHours: number };
};

const byAnchorThenId = (a: { anchorDate: string; id: number }, b: { anchorDate: string; id: number }) => {
  if (a.anchorDate < b.anchorDate) return -1;
  if (a.anchorDate > b.anchorDate) return 1;
  return a.id - b.id;
};

export function computeFIFO(input: FIFOInput): FIFOResult {
  const earnings = [...input.earnings].sort(byAnchorThenId);
  const redemptions = [...input.redemptions].sort(byAnchorThenId);

  const linksFor = new Map<number, Set<number>>(); // redemptionId → set of earningId
  for (const r of input.relations) {
    const set = linksFor.get(r.redemptionId) ?? new Set<number>();
    set.add(r.earningId);
    linksFor.set(r.redemptionId, set);
  }

  const consumed = new Map<number, number>();
  const allocations: Allocation[] = [];
  const perRedemption = new Map<number, { requested: number; covered: number; unlinked: number }>();

  for (const r of redemptions) {
    const linked = linksFor.get(r.id) ?? new Set<number>();
    const linkedEarnings = earnings.filter((e) => linked.has(e.id));
    let remaining = r.requested;
    for (const e of linkedEarnings) {
      if (remaining <= 0) break;
      const used = consumed.get(e.id) ?? 0;
      const available = e.earned - used;
      if (available <= 0) continue;
      const give = Math.min(remaining, available);
      consumed.set(e.id, used + give);
      allocations.push({ earningId: e.id, redemptionId: r.id, hours: give });
      remaining -= give;
    }
    perRedemption.set(r.id, {
      requested: r.requested,
      covered: r.requested - remaining,
      unlinked: remaining,
    });
  }

  const perEarning = new Map<number, { earned: number; consumed: number; remaining: number }>();
  for (const e of earnings) {
    const used = consumed.get(e.id) ?? 0;
    perEarning.set(e.id, { earned: e.earned, consumed: used, remaining: e.earned - used });
  }

  const totalsEarned = earnings.reduce((s, e) => s + e.earned, 0);
  const totalsRedeemed = allocations.reduce((s, a) => s + a.hours, 0);
  const totalsUnlinked = [...perRedemption.values()].reduce((s, r) => s + r.unlinked, 0);

  return {
    allocations,
    perEarning,
    perRedemption,
    totals: {
      earned: totalsEarned,
      redeemed: totalsRedeemed,
      available: totalsEarned - totalsRedeemed,
      unlinkedHours: totalsUnlinked,
    },
  };
}
```

- [ ] **Step 3: PASS + commit**

```bash
bunx vitest run src/matching
git add apps/api/src/matching
git commit -m "feat(matching): FIFO algorithm with table-driven tests"
```

---

## Phase 9 — HTTP routes

### Task 9.1: Response envelope + error middleware

**Files:**
- Create: `apps/api/src/lib/envelope.ts`
- Create: `apps/api/src/middleware/errors.ts`

- [ ] **Step 1: `lib/envelope.ts`**

```ts
import type { Context } from "hono";

export class AppError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const ok = <T>(c: Context, data: T, meta?: Record<string, unknown>) =>
  c.json({ data, ...(meta ? { meta } : {}) });

export const fail = (c: Context, e: AppError) =>
  c.json({ error: { code: e.code, message: e.message, details: e.details } }, e.httpStatus as 400);
```

- [ ] **Step 2: `middleware/errors.ts`**

```ts
import type { ErrorHandler } from "hono";
import { ZodError } from "zod";
import { logger } from "../lib/logger";
import { AppError, fail } from "../lib/envelope";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) return fail(c, err);
  if (err instanceof ZodError) {
    return fail(c, new AppError("VALIDATION_ERROR", 400, "Invalid input", err.flatten()));
  }
  const code =
    "code" in err && typeof (err as { code: unknown }).code === "string"
      ? (err as { code: string }).code
      : "INTERNAL_ERROR";
  logger.error({ err }, "unhandled error");
  return fail(c, new AppError(code, 500, err.message ?? "Internal error"));
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/envelope.ts apps/api/src/middleware
git commit -m "feat(api): response envelope + error middleware"
```

### Task 9.2: /api/health

**Files:**
- Create: `apps/api/src/routes/health.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Implement `routes/health.ts`**

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Env } from "../config/env";
import { appConfig } from "../db/schema";
import { ok } from "../lib/envelope";
import { RedmineClient } from "../redmine/client";
import { RedmineEndpoints } from "../redmine/endpoints";

export function healthRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();
  r.get("/", async (c) => {
    const errors: { code: string; message: string }[] = [];
    let redmine: "ok" | "unreachable" | "auth_failed" | "rest_disabled" = "ok";
    try {
      const ep = new RedmineEndpoints(new RedmineClient(deps.env));
      await ep.currentUserId();
    } catch (e: any) {
      if (e?.code === "REDMINE_AUTH_FAILED") redmine = "auth_failed";
      else if (e?.status === 404 || e?.status === 0) redmine = "rest_disabled";
      else redmine = "unreachable";
      errors.push({ code: e?.code ?? "UNKNOWN", message: e?.message ?? String(e) });
    }
    const [row] = await deps.db.select().from(appConfig).where(eq(appConfig.key, "last_sync_at")).limit(1);
    return ok(c, { redmine, db: "ok", lastSync: row?.value ?? null, errors });
  });
  return r;
}
```

- [ ] **Step 2: Wire into `app.ts`** (modify previous stub)

```ts
import { Hono } from "hono";
import { loadEnv } from "./config/env";
import { createDb } from "./db/client";
import { errorHandler } from "./middleware/errors";
import { healthRoutes } from "./routes/health";

export function createApp(opts?: { dbPath?: string }) {
  const env = loadEnv();
  const db = createDb(opts?.dbPath ?? "./data/overtide.db");
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/api/health", healthRoutes({ db, env }));
  return { app, env, db };
}
```

Update `index.ts` to destructure (and honour `DB_PATH` env, used by Playwright E2E):

```ts
import { createApp } from "./app";
const { app, env } = createApp({ dbPath: process.env.DB_PATH });
Bun.serve({ hostname: "127.0.0.1", port: env.port, fetch: app.fetch });
console.log(`Overtide API listening on http://127.0.0.1:${env.port}`);
```

- [ ] **Step 3: Smoke + commit**

```bash
# with a working .env
bun --filter @overtide/api dev &
sleep 1
curl -s http://127.0.0.1:8787/api/health
kill %1
git add apps/api/src/routes/health.ts apps/api/src/app.ts apps/api/src/index.ts
git commit -m "feat(api): /api/health with redmine + db status"
```

### Task 9.3: /api/sync

**Files:**
- Create: `apps/api/src/routes/sync.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/sync.test.ts`

- [ ] **Step 1: Failing test** (integration, app-level)

```ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { fixtureSync } from "../../test/fixtures/redmine/sync_basic";
import { startMsw } from "../../test/helpers/msw";
import { Hono } from "hono";
import { syncRoutes } from "./sync";
import { errorHandler } from "../middleware/errors";

const env = { redmineUrl: "https://r.test", auth: { kind: "apiKey" as const, apiKey: "k" }, redemptionTrackerId: 12, overtimeActivityId: 8, port: 0, logLevel: "info" };

function memDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

let server: ReturnType<typeof startMsw>;
afterEach(() => server.close());

describe("POST /api/sync", () => {
  it("runs sync and returns success", async () => {
    server = startMsw(
      http.get("https://r.test/users/current.json", () => HttpResponse.json({ user: fixtureSync.user })),
      http.get("https://r.test/time_entries.json", () => HttpResponse.json({ time_entries: fixtureSync.timeEntries, total_count: 3, offset: 0, limit: 100 })),
      http.get("https://r.test/issues.json", () => HttpResponse.json({ issues: fixtureSync.issues, total_count: 2 })),
    );
    const db = memDb();
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/sync", syncRoutes({ db, env }));
    const res = await app.request("/api/sync", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("success");
  });

  it("returns 409 when sync already running", async () => {
    const db = memDb();
    await db.insert(schema.syncRuns).values({ startedAt: "x", status: "running" });
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/sync", syncRoutes({ db, env }));
    const res = await app.request("/api/sync", { method: "POST" });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Env } from "../config/env";
import { syncRuns } from "../db/schema";
import { AppError } from "../lib/envelope";
import { ok } from "../lib/envelope";
import { RedmineClient } from "../redmine/client";
import { RedmineEndpoints } from "../redmine/endpoints";
import { runSync } from "../sync/orchestrator";
import { SyncInProgressError } from "../sync/lock";

export function syncRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();

  r.post("/", async (c) => {
    try {
      const endpoints = new RedmineEndpoints(new RedmineClient(deps.env));
      const result = await runSync({ db: deps.db, endpoints, env: deps.env });
      return ok(c, result);
    } catch (e) {
      if (e instanceof SyncInProgressError) throw new AppError("SYNC_IN_PROGRESS", 409, "A sync is already running");
      throw e;
    }
  });

  r.get("/history", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
    const rows = await deps.db.select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(limit);
    return ok(c, rows);
  });

  r.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) throw new AppError("BAD_ID", 400, "id must be a number");
    const [row] = await deps.db.select().from(syncRuns).where(eq(syncRuns.id, id)).limit(1);
    if (!row) throw new AppError("NOT_FOUND", 404, `sync_run ${id} not found`);
    return ok(c, row);
  });

  return r;
}
```

- [ ] **Step 3: Mount + PASS + commit**

Add to `app.ts`:

```ts
import { syncRoutes } from "./routes/sync";
// ... inside createApp:
app.route("/api/sync", syncRoutes({ db, env }));
```

```bash
bunx vitest run src/routes/sync
git add apps/api/src/routes/sync.ts apps/api/src/routes/sync.test.ts apps/api/src/app.ts
git commit -m "feat(api): /api/sync POST + GET history + GET :id"
```

### Task 9.4: /api/balance + timeline

**Files:**
- Create: `apps/api/src/routes/balance.ts`
- Create: `apps/api/src/db/queries.ts` (shared helpers — used by balance, issues, unlinked)

- [ ] **Step 1: `db/queries.ts`** — helpers to get earnings + redemptions + relations in shape for FIFO

```ts
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { issues, issueRelations, timeEntries } from "./schema";

export type EarningRow = {
  id: number; subject: string; projectName: string; trackerName: string; statusName: string;
  isClosed: boolean; createdOn: string; updatedOn: string; url: string;
  earned: number; anchorDate: string;
};

export type RedemptionRow = {
  id: number; subject: string; projectName: string; trackerName: string; statusName: string;
  isClosed: boolean; createdOn: string; updatedOn: string; url: string;
  requested: number; anchorDate: string;
};

export async function fetchEarnings(db: Db): Promise<EarningRow[]> {
  const rows = await db.all<{
    id: number; subject: string; project_name: string; tracker_name: string; status_name: string;
    is_closed: number; created_on: string; updated_on: string; url: string;
    earned: number; anchor: string | null;
  }>(/* sql */`
    SELECT i.id, i.subject, i.project_name, i.tracker_name, i.status_name,
           i.is_closed, i.created_on, i.updated_on, i.url,
           COALESCE(SUM(CASE WHEN te.activity_id = $overtime THEN te.hours ELSE 0 END), 0) AS earned,
           COALESCE(MIN(te.spent_on), DATE(i.created_on)) AS anchor
    FROM issues i
    LEFT JOIN time_entries te ON te.issue_id = i.id
    WHERE i.role = 'earning'
    GROUP BY i.id
  `);
  // NOTE: Drizzle's bun-sqlite raw `all` differs; use db.run/db.get/etc.
  // The actual implementation is given in Step 2 — left here as a sketch.
  return rows.map((r) => ({
    id: r.id, subject: r.subject, projectName: r.project_name, trackerName: r.tracker_name,
    statusName: r.status_name, isClosed: r.is_closed === 1, createdOn: r.created_on,
    updatedOn: r.updated_on, url: r.url, earned: r.earned, anchorDate: r.anchor!,
  }));
}
```

- [ ] **Step 2: Replace sketch with real Drizzle implementation**

Drizzle's `bun:sqlite` driver lets us use the underlying SQLite instance for raw SQL when aggregation is easier in SQL. Use `sql` template:

```ts
import { sql, eq } from "drizzle-orm";
import type { Db } from "./client";
import { issues, issueRelations, timeEntries } from "./schema";

export type EarningRow = {
  id: number; subject: string; projectName: string; trackerName: string; statusName: string;
  isClosed: boolean; createdOn: string; updatedOn: string; url: string;
  earned: number; anchorDate: string;
};

export type RedemptionRow = {
  id: number; subject: string; projectName: string; trackerName: string; statusName: string;
  isClosed: boolean; createdOn: string; updatedOn: string; url: string;
  requested: number; anchorDate: string;
};

export async function fetchEarnings(db: Db, overtimeActivityId: number): Promise<EarningRow[]> {
  const result = db.all<any>(sql`
    SELECT i.id, i.subject, i.project_name AS projectName, i.tracker_name AS trackerName,
           i.status_name AS statusName, i.is_closed AS isClosed, i.created_on AS createdOn,
           i.updated_on AS updatedOn, i.url,
           COALESCE(SUM(CASE WHEN te.activity_id = ${overtimeActivityId} THEN te.hours ELSE 0 END), 0) AS earned,
           COALESCE(MIN(te.spent_on), DATE(i.created_on)) AS anchorDate
    FROM issues i
    LEFT JOIN time_entries te ON te.issue_id = i.id
    WHERE i.role = 'earning'
    GROUP BY i.id
  `);
  return (result as any[]).map((r) => ({ ...r, isClosed: Boolean(r.isClosed) }));
}

export async function fetchRedemptions(db: Db): Promise<RedemptionRow[]> {
  const result = db.all<any>(sql`
    SELECT i.id, i.subject, i.project_name AS projectName, i.tracker_name AS trackerName,
           i.status_name AS statusName, i.is_closed AS isClosed, i.created_on AS createdOn,
           i.updated_on AS updatedOn, i.url,
           COALESCE(SUM(te.hours), 0) AS requested,
           COALESCE(MIN(te.spent_on), DATE(i.created_on)) AS anchorDate
    FROM issues i
    LEFT JOIN time_entries te ON te.issue_id = i.id
    WHERE i.role = 'redemption'
    GROUP BY i.id
  `);
  return (result as any[]).map((r) => ({ ...r, isClosed: Boolean(r.isClosed) }));
}

export async function fetchRelations(db: Db): Promise<Array<{ earningId: number; redemptionId: number }>> {
  const rows = await db.select().from(issueRelations);
  const out: Array<{ earningId: number; redemptionId: number }> = [];
  const ids = new Set(rows.flatMap((r) => [r.issueFromId, r.issueToId]));
  if (ids.size === 0) return out;
  const issueRows = await db.select().from(issues);
  const roleById = new Map(issueRows.map((i) => [i.id, i.role]));
  for (const r of rows) {
    if (r.relationType !== "relates") continue;
    const fromRole = roleById.get(r.issueFromId);
    const toRole = roleById.get(r.issueToId);
    if (fromRole === "earning" && toRole === "redemption") {
      out.push({ earningId: r.issueFromId, redemptionId: r.issueToId });
    } else if (fromRole === "redemption" && toRole === "earning") {
      out.push({ earningId: r.issueToId, redemptionId: r.issueFromId });
    }
  }
  return out;
}
```

- [ ] **Step 3: `routes/balance.ts`**

```ts
import { Hono } from "hono";
import type { Db } from "../db/client";
import type { Env } from "../config/env";
import { fetchEarnings, fetchRedemptions, fetchRelations } from "../db/queries";
import { ok } from "../lib/envelope";
import { computeFIFO } from "../matching/fifo";

export function balanceRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();

  r.get("/", async (c) => {
    const [earnings, redemptions, relations] = await Promise.all([
      fetchEarnings(deps.db, deps.env.overtimeActivityId),
      fetchRedemptions(deps.db),
      fetchRelations(deps.db),
    ]);
    const fifo = computeFIFO({ earnings, redemptions, relations });
    return ok(c, fifo.totals);
  });

  r.get("/timeline", async (c) => {
    // monthly bucket: { month: 'YYYY-MM', earned, redeemed }
    const earnings = await fetchEarnings(deps.db, deps.env.overtimeActivityId);
    const redemptions = await fetchRedemptions(deps.db);
    const buckets = new Map<string, { earned: number; redeemed: number }>();
    const bump = (date: string, field: "earned" | "redeemed", hours: number) => {
      const key = date.slice(0, 7);
      const b = buckets.get(key) ?? { earned: 0, redeemed: 0 };
      b[field] += hours;
      buckets.set(key, b);
    };
    for (const e of earnings) bump(e.anchorDate, "earned", e.earned);
    for (const rd of redemptions) bump(rd.anchorDate, "redeemed", rd.requested);
    const series = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));
    return ok(c, series);
  });

  return r;
}
```

- [ ] **Step 4: Mount + write a smoke test + commit**

Mount in `app.ts`:

```ts
import { balanceRoutes } from "./routes/balance";
// ...
app.route("/api/balance", balanceRoutes({ db, env }));
```

Test (`apps/api/src/routes/balance.test.ts`):

```ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { errorHandler } from "../middleware/errors";
import { balanceRoutes } from "./balance";

const env = { redmineUrl: "x", auth: { kind: "apiKey" as const, apiKey: "k" }, redemptionTrackerId: 12, overtimeActivityId: 8, port: 0, logLevel: "info" };

function setupDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  // seed 1 earning + 1 redemption + relation
  db.insert(schema.issues).values([
    { id: 1, role: "earning", trackerId: 5, trackerName: "Dev", projectId: 1, projectName: "P", subject: "S", statusName: "Open", createdOn: "2026-01-01T00:00:00Z", updatedOn: "2026-01-01T00:00:00Z", url: "u1", rawJson: "{}" },
    { id: 2, role: "redemption", trackerId: 12, trackerName: "Odbior", projectId: 1, projectName: "P", subject: "S", statusName: "Open", createdOn: "2026-02-01T00:00:00Z", updatedOn: "2026-02-01T00:00:00Z", url: "u2", rawJson: "{}" },
  ]).run();
  db.insert(schema.timeEntries).values([
    { id: 10, issueId: 1, userId: 7, hours: 4, activityId: 8, activityName: "Nadgodziny", spentOn: "2026-01-05", createdOn: "x", updatedOn: "x" },
    { id: 11, issueId: 2, userId: 7, hours: 3, activityId: 99, activityName: "Other", spentOn: "2026-02-05", createdOn: "x", updatedOn: "x" },
  ]).run();
  db.insert(schema.issueRelations).values({ id: 500, issueFromId: 1, issueToId: 2, relationType: "relates", mirroredAt: "x" }).run();
  return db;
}

describe("GET /api/balance", () => {
  it("computes balance via FIFO over seeded data", async () => {
    const db = setupDb();
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/balance", balanceRoutes({ db, env }));
    const res = await app.request("/api/balance");
    const body = await res.json();
    expect(body.data).toMatchObject({ earned: 4, redeemed: 3, available: 1, unlinkedHours: 0 });
  });
});
```

```bash
bunx vitest run src/routes/balance
git add apps/api/src/db/queries.ts apps/api/src/routes/balance.ts apps/api/src/routes/balance.test.ts apps/api/src/app.ts
git commit -m "feat(api): /api/balance + /api/balance/timeline with FIFO"
```

### Task 9.5: /api/issues/*

**Files:**
- Create: `apps/api/src/routes/issues.ts`
- Test: `apps/api/src/routes/issues.test.ts`

- [ ] **Step 1: Implement**

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Env } from "../config/env";
import { issues, issueRelations, timeEntries } from "../db/schema";
import { fetchEarnings, fetchRedemptions, fetchRelations } from "../db/queries";
import { AppError, ok } from "../lib/envelope";
import { computeFIFO } from "../matching/fifo";

export function issuesRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();

  r.get("/earning", async (c) => {
    const [earnings, redemptions, relations] = await Promise.all([
      fetchEarnings(deps.db, deps.env.overtimeActivityId),
      fetchRedemptions(deps.db),
      fetchRelations(deps.db),
    ]);
    const fifo = computeFIFO({ earnings, redemptions, relations });
    const data = earnings.map((e) => {
      const m = fifo.perEarning.get(e.id) ?? { earned: e.earned, consumed: 0, remaining: e.earned };
      return { ...e, ...m, role: "earning" as const };
    });
    return ok(c, data);
  });

  r.get("/redemption", async (c) => {
    const [earnings, redemptions, relations] = await Promise.all([
      fetchEarnings(deps.db, deps.env.overtimeActivityId),
      fetchRedemptions(deps.db),
      fetchRelations(deps.db),
    ]);
    const fifo = computeFIFO({ earnings, redemptions, relations });
    const linkedByR = new Map<number, number[]>();
    for (const rel of relations) {
      const arr = linkedByR.get(rel.redemptionId) ?? [];
      arr.push(rel.earningId);
      linkedByR.set(rel.redemptionId, arr);
    }
    const data = redemptions.map((rd) => {
      const m = fifo.perRedemption.get(rd.id) ?? { requested: rd.requested, covered: 0, unlinked: rd.requested };
      return { ...rd, ...m, role: "redemption" as const, linkedEarningIds: linkedByR.get(rd.id) ?? [] };
    });
    return ok(c, data);
  });

  r.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) throw new AppError("BAD_ID", 400, "id must be a number");
    const [issue] = await deps.db.select().from(issues).where(eq(issues.id, id)).limit(1);
    if (!issue) throw new AppError("NOT_FOUND", 404, `issue ${id} not found`);
    const tEntries = await deps.db.select().from(timeEntries).where(eq(timeEntries.issueId, id));
    const rels = await deps.db.select().from(issueRelations).where(
      issue.role === "earning" ? eq(issueRelations.issueFromId, id) : eq(issueRelations.issueToId, id),
    );
    return ok(c, { issue, timeEntries: tEntries, relations: rels });
  });

  return r;
}
```

- [ ] **Step 2: Smoke test similar to balance.test.ts (one happy path per endpoint) + commit**

```ts
// apps/api/src/routes/issues.test.ts — adapt setupDb from balance.test.ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { errorHandler } from "../middleware/errors";
import { issuesRoutes } from "./issues";

const env = { redmineUrl: "x", auth: { kind: "apiKey" as const, apiKey: "k" }, redemptionTrackerId: 12, overtimeActivityId: 8, port: 0, logLevel: "info" };

describe("GET /api/issues/earning", () => {
  it("returns earnings with consumed/remaining", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "./drizzle" });
    db.insert(schema.issues).values({ id: 1, role: "earning", trackerId: 5, trackerName: "Dev", projectId: 1, projectName: "P", subject: "S", statusName: "Open", createdOn: "2026-01-01T00:00:00Z", updatedOn: "2026-01-01T00:00:00Z", url: "u", rawJson: "{}" }).run();
    db.insert(schema.timeEntries).values({ id: 10, issueId: 1, userId: 7, hours: 4, activityId: 8, activityName: "Nadgodziny", spentOn: "2026-01-05", createdOn: "x", updatedOn: "x" }).run();
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/issues", issuesRoutes({ db, env }));
    const res = await app.request("/api/issues/earning");
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 1, earned: 4, consumed: 0, remaining: 4 });
  });
});
```

```bash
bunx vitest run src/routes/issues
git add apps/api/src/routes/issues.ts apps/api/src/routes/issues.test.ts
git commit -m "feat(api): /api/issues/earning|redemption|:id"
```

### Task 9.6: /api/unlinked

**Files:**
- Create: `apps/api/src/routes/unlinked.ts`

- [ ] **Step 1: Implement**

```ts
import { Hono } from "hono";
import type { Db } from "../db/client";
import type { Env } from "../config/env";
import { fetchEarnings, fetchRedemptions, fetchRelations } from "../db/queries";
import { ok } from "../lib/envelope";
import { computeFIFO } from "../matching/fifo";

export function unlinkedRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();
  r.get("/", async (c) => {
    const [earnings, redemptions, relations] = await Promise.all([
      fetchEarnings(deps.db, deps.env.overtimeActivityId),
      fetchRedemptions(deps.db),
      fetchRelations(deps.db),
    ]);
    const fifo = computeFIFO({ earnings, redemptions, relations });
    const linkedByR = new Map<number, number[]>();
    for (const rel of relations) {
      const arr = linkedByR.get(rel.redemptionId) ?? [];
      arr.push(rel.earningId);
      linkedByR.set(rel.redemptionId, arr);
    }
    const data = redemptions
      .map((rd) => ({ rd, m: fifo.perRedemption.get(rd.id) }))
      .filter(({ m }) => (m?.unlinked ?? 0) > 0)
      .map(({ rd, m }) => ({ ...rd, ...(m ?? { requested: rd.requested, covered: 0, unlinked: rd.requested }), linkedEarningIds: linkedByR.get(rd.id) ?? [] }));
    return ok(c, data);
  });
  return r;
}
```

- [ ] **Step 2: Mount + commit**

```ts
// app.ts
import { unlinkedRoutes } from "./routes/unlinked";
app.route("/api/unlinked", unlinkedRoutes({ db, env }));
```

```bash
git add apps/api/src/routes/unlinked.ts apps/api/src/app.ts
git commit -m "feat(api): /api/unlinked"
```

### Task 9.7: /api/relations (write-through)

**Files:**
- Create: `apps/api/src/routes/relations.ts`
- Test: `apps/api/src/routes/relations.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { startMsw } from "../../test/helpers/msw";
import { Hono } from "hono";
import { relationsRoutes } from "./relations";
import { errorHandler } from "../middleware/errors";

const env = { redmineUrl: "https://r.test", auth: { kind: "apiKey" as const, apiKey: "k" }, redemptionTrackerId: 12, overtimeActivityId: 8, port: 0, logLevel: "info" };

function seed() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.insert(schema.issues).values([
    { id: 1, role: "earning", trackerId: 5, trackerName: "Dev", projectId: 1, projectName: "P", subject: "S", statusName: "Open", createdOn: "x", updatedOn: "x", url: "u", rawJson: "{}" },
    { id: 2, role: "redemption", trackerId: 12, trackerName: "O", projectId: 1, projectName: "P", subject: "S", statusName: "Open", createdOn: "x", updatedOn: "x", url: "u", rawJson: "{}" },
  ]).run();
  return db;
}

let server: ReturnType<typeof startMsw>;
afterEach(() => server.close());

describe("POST /api/relations", () => {
  it("creates relation in Redmine + DB", async () => {
    server = startMsw(http.post("https://r.test/issues/1/relations.json", async () =>
      HttpResponse.json({ relation: { id: 9999, issue_id: 1, issue_to_id: 2, relation_type: "relates" } })));
    const db = seed();
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/relations", relationsRoutes({ db, env }));
    const res = await app.request("/api/relations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_earning_id: 1, to_redemption_id: 2 }),
    });
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.issueRelations);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 9999, createdLocally: true });
  });

  it("returns 400 on cross-role mismatch", async () => {
    const db = seed();
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/relations", relationsRoutes({ db, env }));
    const res = await app.request("/api/relations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_earning_id: 2, to_redemption_id: 1 }), // swapped
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Env } from "../config/env";
import { issues, issueRelations } from "../db/schema";
import { AppError, ok } from "../lib/envelope";
import { RedmineClient } from "../redmine/client";
import { RedmineEndpoints } from "../redmine/endpoints";

const createSchema = z.object({
  from_earning_id: z.number().int().positive(),
  to_redemption_id: z.number().int().positive(),
});

export function relationsRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();

  r.post("/", zValidator("json", createSchema), async (c) => {
    const body = c.req.valid("json");
    if (body.from_earning_id === body.to_redemption_id) {
      throw new AppError("SELF_LINK", 400, "cannot link issue to itself");
    }
    const [from] = await deps.db.select().from(issues).where(eq(issues.id, body.from_earning_id)).limit(1);
    if (!from) throw new AppError("ISSUE_NOT_MIRRORED", 404, `issue ${body.from_earning_id} not mirrored`);
    if (from.role !== "earning") throw new AppError("ISSUE_NOT_EARNING", 400, `${body.from_earning_id} is not an earning issue`);

    const [to] = await deps.db.select().from(issues).where(eq(issues.id, body.to_redemption_id)).limit(1);
    if (!to) throw new AppError("ISSUE_NOT_MIRRORED", 404, `issue ${body.to_redemption_id} not mirrored`);
    if (to.role !== "redemption") throw new AppError("ISSUE_NOT_REDEMPTION", 400, `${body.to_redemption_id} is not a redemption`);

    const existing = await deps.db.select().from(issueRelations).where(
      and(eq(issueRelations.issueFromId, from.id), eq(issueRelations.issueToId, to.id)),
    ).limit(1);
    if (existing.length > 0) return ok(c, { id: existing[0]!.id, status: "ALREADY_LINKED" });

    const endpoints = new RedmineEndpoints(new RedmineClient(deps.env));
    const created = await endpoints.createRelation(from.id, to.id);
    await deps.db.insert(issueRelations).values({
      id: created.id,
      issueFromId: from.id,
      issueToId: to.id,
      relationType: "relates",
      createdLocally: true,
      mirroredAt: new Date().toISOString(),
    });
    return ok(c, { id: created.id, status: "CREATED" });
  });

  r.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) throw new AppError("BAD_ID", 400, "id must be a number");
    const [rel] = await deps.db.select().from(issueRelations).where(eq(issueRelations.id, id)).limit(1);
    if (!rel) throw new AppError("NOT_FOUND", 404, `relation ${id} not found`);
    if (!rel.createdLocally) throw new AppError("RELATION_NOT_OWNED", 403, "can only delete relations created by Overtide");

    const endpoints = new RedmineEndpoints(new RedmineClient(deps.env));
    await endpoints.deleteRelation(id);
    await deps.db.delete(issueRelations).where(eq(issueRelations.id, id));
    return ok(c, { id, status: "DELETED" });
  });

  return r;
}
```

- [ ] **Step 3: Mount + PASS + commit**

```ts
// app.ts
import { relationsRoutes } from "./routes/relations";
app.route("/api/relations", relationsRoutes({ db, env }));
```

```bash
bunx vitest run src/routes/relations
git add apps/api/src/routes/relations.ts apps/api/src/routes/relations.test.ts apps/api/src/app.ts
git commit -m "feat(api): /api/relations POST + DELETE write-through"
```

---

## Phase 10 — Backend acceptance

### Task 10.1: Coverage gate

- [ ] **Step 1: Run full coverage**

```bash
cd apps/api && bunx vitest run --coverage
```

Expected: overall ≥ 80%, `matching/` 100%, `redmine/` ≥ 90%, `sync/` ≥ 85%.

If thresholds fail, add specific cases for uncovered branches (especially in `client.ts` error paths and `orchestrator.ts` failure modes). Re-run.

### Task 10.2: Manual smoke against real or recorded Redmine

- [ ] **Step 1: With real `.env`**

```bash
bun --filter @overtide/api dev &
sleep 1
curl -s http://127.0.0.1:8787/api/health | jq
# Expected: { "data": { "redmine": "ok"|"auth_failed"|"rest_disabled", ... } }
```

- [ ] **Step 2: If `redmine: ok`, run a sync**

```bash
curl -sX POST http://127.0.0.1:8787/api/sync | jq
curl -s http://127.0.0.1:8787/api/balance | jq
curl -s http://127.0.0.1:8787/api/issues/earning | jq '.data | length'
curl -s http://127.0.0.1:8787/api/unlinked | jq '.data | length'
kill %1
```

If any step fails, debug; the `error.code` field guides the fix.

### Task 10.3: README backend section

**Files:**
- Create: `README.md` (root)

- [ ] **Step 1: Write `README.md`**

```markdown
# Overtide

Personal Redmine overtime tracker — earn hours under a Redmine `Nadgodziny` time-entry activity,
redeem them via `Odbiór nadgodzin` tracker issues linked with `relates`, monitor FIFO balance.

## Quick start (backend only)

```bash
bun install
cp .env.example apps/api/.env
# edit apps/api/.env: REDMINE_URL, REDMINE_USERNAME, REDMINE_PASSWORD,
# REDMINE_TRACKER_REDEMPTION_ID, REDMINE_ACTIVITY_OVERTIME_ID

bun --filter @overtide/api db:migrate
bun --filter @overtide/api dev
```

Verify: `curl http://127.0.0.1:8787/api/health`

## Architecture

See `docs/superpowers/specs/2026-05-11-overtide-design.md`.

## Tests

```bash
bun --filter @overtide/api test
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: backend quick-start in root README"
```

---

## Acceptance criteria — Backend

- [ ] `bun --filter @overtide/api dev` boots; `/api/health` returns a JSON envelope.
- [ ] `bun --filter @overtide/api test` is green with coverage thresholds met.
- [ ] Against a working Redmine, `POST /api/sync` populates SQLite; `GET /api/balance` returns plausible totals.
- [ ] Concurrent `POST /api/sync` returns 409 `SYNC_IN_PROGRESS`.
- [ ] `POST /api/relations` creates the link in Redmine **and** mirrors it locally; idempotent re-POST returns `ALREADY_LINKED`.

When all boxes tick, this plan is complete and Plan B (Frontend) can start.
