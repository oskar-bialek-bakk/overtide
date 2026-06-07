# Overtide Reliability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Overtide more trustworthy for personal overtime accounting by surfacing partial failures, validating API contracts, improving sync observability, and adding a local backup/export path.

**Architecture:** Keep reliability features inside existing API/UI boundaries instead of introducing a new service. Persist only operational facts that matter after a restart, validate all network-facing contracts at the shared/API-client edges, and keep each change small enough for focused review.

**Tech Stack:** Bun, Hono, Drizzle SQLite, Zod, React, TanStack Query, Vitest/Bun test, Playwright.

---

## PR Boundaries

Implement this as four small PRs after PR #11 is merged, or as stacked branches on top of `codex/harden-personal-reliability` if continuing before merge.

1. Partial redemption operation tracking and retry.
2. Sync health/observability endpoint and UI summary.
3. Zod-validated frontend API contracts.
4. Local backup/export endpoint and UI action.

Each PR must pass:

```powershell
bun run lint
bun run typecheck
bun --filter @overtide/api test
bun --filter @overtide/web test
cd packages/shared; bun test
bun --filter @overtide/web e2e
```

## File Map

`apps/api/src/db/schema.ts` owns SQLite table definitions. Add operational tables here only when the fact must survive process restarts.

`apps/api/drizzle/*.sql` owns migrations. Add one migration per schema change and update Drizzle metadata with the existing migration workflow.

`apps/api/src/routes/redemptions.ts` owns redemption creation. Keep Redmine calls here for now, but split retryable operation bookkeeping into small helpers in the same file first; extract only when duplication appears.

`apps/api/src/routes/sync.ts` owns sync run endpoints. Add operational status here rather than spreading health data across unrelated routes.

`apps/api/src/routes/backup.ts` should be created for export/download behavior.

`packages/shared/src/*.ts` owns cross-boundary schemas and UI/API types. Put response schemas here before the frontend consumes them.

`apps/web/src/api/client.ts`, `apps/web/src/api/queries.ts`, and `apps/web/src/api/mutations.ts` own API consumption. Add schema parsing at this boundary so components receive validated data.

`apps/web/src/routes/sync.tsx` and `apps/web/src/routes/settings.tsx` are the most natural places for operational state and backup controls.

---

## Task 1: Persist Partial Redemption Operations

**Files:**

- Modify: `apps/api/src/db/schema.ts`
- Create migration: `apps/api/drizzle/0003_redemption_operations.sql`
- Modify metadata: `apps/api/drizzle/meta/_journal.json`
- Modify metadata: `apps/api/drizzle/meta/0003_snapshot.json`
- Modify: `apps/api/src/routes/redemptions.ts`
- Test: `apps/api/src/routes/redemptions.test.ts`
- Modify shared schema: `packages/shared/src/redemption-wizard.ts`
- Test shared schema: `packages/shared/src/redemption-wizard.test.ts`

- [ ] **Step 1: Add failing API test for partial success persistence**

Add this test in `apps/api/src/routes/redemptions.test.ts` after the existing warning test:

```ts
it("persists a retryable operation when time entry creation partially fails", async () => {
  server = startMsw(
    http.get("https://r.test/users/current.json", () =>
      HttpResponse.json({ user: { id: 1039, firstname: "Oskar", lastname: "Bialek" } }),
    ),
    http.post("https://r.test/issues.json", () =>
      HttpResponse.json(
        {
          issue: {
            id: 999,
            project: { id: 12, name: "urlopy" },
            tracker: { id: 19, name: "T" },
            status: { id: 1, name: "Nowe", is_closed: false },
            subject: "Odbior nadgodzin OB 04.05",
            start_date: "2026-05-04",
            due_date: "2026-05-04",
            created_on: "2026-05-04T10:00:00Z",
            updated_on: "2026-05-04T10:00:00Z",
          },
        },
        { status: 201 },
      ),
    ),
    http.post("https://r.test/time_entries.json", () =>
      HttpResponse.json({ error: "boom" }, { status: 500 }),
    ),
    http.post("https://r.test/issues/:id/relations.json", ({ params }) =>
      HttpResponse.json({
        relation: {
          id: 5000,
          issue_id: Number(params.id),
          issue_to_id: 999,
          relation_type: "relates",
        },
      }),
    ),
  );

  const { db } = seedDb();
  const app = makeApp(db);
  const res = await app.request("/api/redemptions/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: "2026-05-04",
      endDate: "2026-05-04",
      totalHours: 4,
      allocations: [{ earningId: 114518, hours: 4 }],
    }),
  });

  expect(res.status).toBe(201);
  const json = (await res.json()) as { data: { issueId: number; retryableOperationId?: number } };
  expect(json.data.retryableOperationId).toBeNumber();

  const operations = await db.select().from(schema.redemptionOperations);
  expect(operations).toHaveLength(1);
  expect(operations[0]).toMatchObject({
    redemptionIssueId: 999,
    status: "partial",
    missingTimeEntries: 1,
    missingRelations: 0,
  });
});
```

Run:

```powershell
bun --filter @overtide/api test src/routes/redemptions.test.ts
```

Expected: FAIL because `schema.redemptionOperations` and `retryableOperationId` do not exist.

- [ ] **Step 2: Add the operation table**

Add this table to `apps/api/src/db/schema.ts`:

```ts
export const redemptionOperations = sqliteTable(
  "redemption_operations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    redemptionIssueId: integer("redemption_issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["success", "partial", "failed"] }).notNull(),
    warning: text("warning"),
    missingTimeEntries: integer("missing_time_entries").notNull().default(0),
    missingRelations: integer("missing_relations").notNull().default(0),
    requestJson: text("request_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    redemptionIdx: index("idx_redemption_operations_issue").on(t.redemptionIssueId),
    statusIdx: index("idx_redemption_operations_status").on(t.status),
  }),
);
```

Create `apps/api/drizzle/0003_redemption_operations.sql`:

```sql
CREATE TABLE `redemption_operations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `redemption_issue_id` integer NOT NULL,
  `status` text NOT NULL,
  `warning` text,
  `missing_time_entries` integer DEFAULT 0 NOT NULL,
  `missing_relations` integer DEFAULT 0 NOT NULL,
  `request_json` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`redemption_issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `idx_redemption_operations_issue` ON `redemption_operations` (`redemption_issue_id`);
CREATE INDEX `idx_redemption_operations_status` ON `redemption_operations` (`status`);
```

Update Drizzle metadata with the project migration command:

```powershell
bun --filter @overtide/api db:generate
```

If the command proposes unrelated changes, stop and inspect before accepting.

- [ ] **Step 3: Persist operation outcome in create route**

In `apps/api/src/routes/redemptions.ts`, import `redemptionOperations` and insert one row inside the transaction after mirroring issue/time entries/relations:

```ts
const operationStatus = warning ? "partial" : "success";
let retryableOperationId: number | undefined;
const [operation] = tx
  .insert(redemptionOperations)
  .values({
    redemptionIssueId: createdIssue.id,
    status: operationStatus,
    warning,
    missingTimeEntries: tePlans.length - createdTimeEntries.length,
    missingRelations: body.allocations.length - createdRelations.length,
    requestJson: JSON.stringify(body),
    createdAt: nowISO,
    updatedAt: nowISO,
  })
  .returning({ id: redemptionOperations.id });
retryableOperationId = operation?.id;
```

Add `retryableOperationId` to the response only when `operationStatus === "partial"`:

```ts
...(retryableOperationId && operationStatus === "partial" ? { retryableOperationId } : {}),
```

- [ ] **Step 4: Extend shared response schema**

In `packages/shared/src/redemption-wizard.ts`, extend `createRedemptionResponseSchema`:

```ts
retryableOperationId: z.number().int().positive().optional(),
```

Add a test in `packages/shared/src/redemption-wizard.test.ts` that parses a warning response with `retryableOperationId`.

- [ ] **Step 5: Verify Task 1**

Run:

```powershell
bun --filter @overtide/api test src/routes/redemptions.test.ts
cd packages/shared; bun test src/redemption-wizard.test.ts
bun run lint
bun run typecheck
```

Expected: all pass.

---

## Task 2: Add Retry Endpoint For Partial Redemption Operations

**Files:**

- Modify: `apps/api/src/routes/redemptions.ts`
- Test: `apps/api/src/routes/redemptions.test.ts`
- Modify: `apps/web/src/api/mutations.ts`
- Modify: `apps/web/src/components/redemption-wizard/CreateRedemptionWizard.tsx`

- [ ] **Step 1: Add failing retry test**

Add a test that seeds a `redemption_operations` row with one failed time entry and calls:

```http
POST /api/redemptions/operations/:id/retry
```

Expected behavior:

```ts
expect(res.status).toBe(200);
expect(json.data.status).toBe("success");
expect(json.data.retriedTimeEntries).toBe(1);
expect(json.data.retriedRelations).toBe(0);
```

Run:

```powershell
bun --filter @overtide/api test src/routes/redemptions.test.ts
```

Expected: FAIL with 404.

- [ ] **Step 2: Implement retry route**

Add route in `apps/api/src/routes/redemptions.ts`:

```ts
r.post("/operations/:id/retry", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) throw new AppError("BAD_ID", 400, "id must be a number");
  const [operation] = await deps.db
    .select()
    .from(redemptionOperations)
    .where(eq(redemptionOperations.id, id))
    .limit(1);
  if (!operation) throw new AppError("NOT_FOUND", 404, `operation ${id} not found`);
  if (operation.status === "success") return ok(c, { id, status: "success", retriedTimeEntries: 0, retriedRelations: 0 });

  // Rebuild missing Redmine artifacts from operation.requestJson and current mirrored issue.
  // Keep the same warning semantics as /create; update the operation row at the end.
});
```

Keep this route intentionally narrow: only retry artifacts missing from the original operation, and do not create another Redmine issue.

- [ ] **Step 3: Add UI retry affordance**

In `apps/web/src/api/mutations.ts`, add:

```ts
export function useRetryRedemptionOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ id: number; status: "success" | "partial"; warning?: string }>(
        `/api/redemptions/operations/${id}/retry`,
        { method: "POST" },
      ),
    onSuccess: (r) => {
      if (r.status === "success") toast.success("Retry completed");
      else toast.warning(`Retry still has warnings — ${r.warning ?? "check Redmine"}`);
      invalidateRelationQueries(qc);
      qc.invalidateQueries({ queryKey: qk.timeline });
      qc.invalidateQueries({ queryKey: qk.syncHistory });
    },
    onError: (e) =>
      toast.error(e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e)),
  });
}
```

In `CreateRedemptionWizard.tsx`, when create returns a warning and `retryableOperationId`, show a compact retry button in the result/warning area. Do not auto-retry.

- [ ] **Step 4: Verify Task 2**

Run:

```powershell
bun --filter @overtide/api test src/routes/redemptions.test.ts
bun --filter @overtide/web test
bun --filter @overtide/web e2e
```

Expected: all pass.

---

## Task 3: Add Sync Observability Summary

**Files:**

- Modify: `apps/api/src/sync/orchestrator.ts`
- Modify: `apps/api/src/db/schema.ts`
- Create migration if new columns are required
- Modify: `apps/api/src/routes/sync.ts`
- Test: `apps/api/src/routes/sync.test.ts`
- Modify shared types: `packages/shared/src/domain.ts`
- Modify web route: `apps/web/src/routes/sync.tsx`

- [ ] **Step 1: Track skipped relation counts in sync result**

In `runSync`, count:

```ts
let relationsSkippedUnknownIssue = 0;
let relationsSkippedSameRole = 0;
let overtimeOnRedemptionIgnored = 0;
```

Increment `overtimeOnRedemptionIgnored` where the warning is logged, increment relation skip counters around relation normalization.

Return these fields from `runSync`.

- [ ] **Step 2: Persist fields on sync_runs**

Add nullable/defaulted integer columns:

```ts
relationsSkippedUnknownIssue: integer("relations_skipped_unknown_issue").notNull().default(0),
relationsSkippedSameRole: integer("relations_skipped_same_role").notNull().default(0),
overtimeOnRedemptionIgnored: integer("overtime_on_redemption_ignored").notNull().default(0),
```

Update `finishSyncRun` calls to store these values.

- [ ] **Step 3: Expose `/api/sync/status`**

Add route in `apps/api/src/routes/sync.ts`:

```ts
r.get("/status", async (c) => {
  const [last] = await deps.db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  return ok(c, {
    lastRun: last ?? null,
    stale: !last?.finishedAt || Date.now() - Date.parse(last.finishedAt) > 1000 * 60 * 60 * 24 * 7,
  });
});
```

Use a seven-day stale threshold because this is a personal tool and weekly drift is already suspicious.

- [ ] **Step 4: Display status in Sync page**

In `apps/web/src/routes/sync.tsx`, add a compact status panel above history:

```tsx
<SyncRunBadge run={status.lastRun} />
{status.stale && <Badge variant="destructive">stale</Badge>}
```

Show skipped counters when non-zero.

- [ ] **Step 5: Verify Task 3**

Run:

```powershell
bun --filter @overtide/api test src/routes/sync.test.ts src/sync/orchestrator.test.ts
bun --filter @overtide/web test
bun run lint
bun run typecheck
```

Expected: all pass.

---

## Task 4: Validate Frontend API Contracts With Zod

**Files:**

- Modify: `packages/shared/src/domain.ts`
- Modify: `packages/shared/src/envelope.ts`
- Test: `packages/shared/src/envelope.test.ts`
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/web/src/api/client.test.ts`
- Modify: `apps/web/src/api/queries.ts`
- Modify: `apps/web/src/api/mutations.ts`

- [ ] **Step 1: Add schema-aware fetch helper**

In `apps/web/src/api/client.ts`, add:

```ts
import type { z } from "zod";

export async function apiFetchSchema<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  opts: ApiFetchOptions = {},
): Promise<z.infer<TSchema>> {
  const data = await apiFetch<unknown>(path, opts);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiClientError("BAD_RESPONSE_SCHEMA", "response did not match schema", parsed.error);
  }
  return parsed.data;
}
```

- [ ] **Step 2: Move response schemas into shared**

Add Zod schemas for `Balance`, `EarningIssue`, `RedemptionIssue`, `SyncRun`, `HealthData`, `TimelinePoint`, and `IssueDetail`.

Keep schemas permissive only where Redmine raw JSON is intentionally unknown.

- [ ] **Step 3: Update queries/mutations to parse**

Example:

```ts
queryFn: () => apiFetchSchema(balanceSchema, "/api/balance")
```

Use the actual helper argument order chosen in Step 1 and update all calls consistently.

- [ ] **Step 4: Add malformed response tests**

In `apps/web/src/api/client.test.ts`, add:

```ts
it("throws BAD_RESPONSE_SCHEMA when data does not match the expected schema", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { total: "bad" } }))));
  await expect(apiFetchSchema("/api/balance", balanceSchema)).rejects.toMatchObject({
    code: "BAD_RESPONSE_SCHEMA",
  });
});
```

- [ ] **Step 5: Verify Task 4**

Run:

```powershell
cd packages/shared; bun test
bun --filter @overtide/web test
bun run lint
bun run typecheck
```

Expected: all pass.

---

## Task 5: Add Local Backup Export

**Files:**

- Create: `apps/api/src/routes/backup.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/backup.test.ts`
- Modify: `apps/web/src/routes/settings.tsx`
- Modify: `apps/web/src/api/queries.ts` or `apps/web/src/api/mutations.ts`

- [ ] **Step 1: Add backup endpoint test**

Create `apps/api/src/routes/backup.test.ts`:

```ts
import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import * as schema from "../db/schema";
import { errorHandler } from "../middleware/errors";
import { backupRoutes } from "./backup";

describe("GET /api/backup/export", () => {
  it("returns a JSON backup with key local tables", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "./drizzle" });
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/backup", backupRoutes({ db }));

    const res = await app.request("/api/backup/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.version).toBe(1);
    expect(Array.isArray(json.issues)).toBe(true);
    expect(Array.isArray(json.timeEntries)).toBe(true);
    expect(Array.isArray(json.issueRelations)).toBe(true);
    expect(Array.isArray(json.syncRuns)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement backup route**

Create `apps/api/src/routes/backup.ts`:

```ts
import { Hono } from "hono";
import type { Db } from "../db/client";
import { appConfig, issueRelations, issues, syncRuns, timeEntries } from "../db/schema";

export function backupRoutes(deps: { db: Db }) {
  const r = new Hono();
  r.get("/export", async (c) => {
    const exportedAt = new Date().toISOString();
    const payload = {
      version: 1,
      exportedAt,
      issues: await deps.db.select().from(issues),
      timeEntries: await deps.db.select().from(timeEntries),
      issueRelations: await deps.db.select().from(issueRelations),
      syncRuns: await deps.db.select().from(syncRuns),
      appConfig: await deps.db.select().from(appConfig),
    };
    c.header("Content-Disposition", `attachment; filename="overtide-backup-${exportedAt.slice(0, 10)}.json"`);
    return c.json(payload);
  });
  return r;
}
```

Register in `apps/api/src/app.ts`:

```ts
import { backupRoutes } from "./routes/backup";
app.route("/api/backup", backupRoutes({ db }));
```

- [ ] **Step 3: Add Settings button**

In `apps/web/src/routes/settings.tsx`, add a button:

```tsx
<Button asChild>
  <a href="/api/backup/export" download>
    Download backup
  </a>
</Button>
```

Put it near operational/settings controls, not in a marketing-style card.

- [ ] **Step 4: Verify Task 5**

Run:

```powershell
bun --filter @overtide/api test src/routes/backup.test.ts
bun --filter @overtide/web e2e
bun run lint
bun run typecheck
```

Expected: all pass.

---

## Execution Notes

Start with Task 1 only after PR #11 is merged or after creating a stacked branch explicitly based on `codex/harden-personal-reliability`. Keep each task in its own commit. If a task grows beyond one reviewable PR, stop after the backend API surface and create a follow-up plan for the UI portion.
