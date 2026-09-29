# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-09-29T09:15:47.905Z
> Files: 148 tracked | Anatomy hits: 0 | Misses: 0

> Project structure index. Auto-maintained by OpenWolf hooks and daemon.
> Run `openwolf scan` to generate, or wait for the first Claude Code session.
> Status: Pending initial scan

## ./

- `.gitignore` — Git ignore rules (~152 tok)
- `AGENTS.md` — OpenWolf (~75 tok)
- `biome.json` — Biome linter/formatter configuration (~155 tok)
- `CLAUDE.md` — OpenWolf (~99 tok)
- `dev.cmd` (~314 tok)
- `package.json` — Node.js package manifest (~127 tok)
- `README.md` — Project documentation (~3534 tok)
- `tsconfig.base.json` (~114 tok)

## apps/api/

- `drizzle.config.ts` — Drizzle ORM configuration (~60 tok)
- `package.json` — Node.js package manifest (~228 tok)
- `tsconfig.json` — TypeScript configuration (~49 tok)

## apps/api/drizzle/

- `0000_purple_blue_marvel.sql` — SQL: tables: app_config, issue_relations, issues, sync_runs (~744 tok)
- `0002_dazzling_namora.sql` — SQL: 1 alter(s) (~17 tok)
- `0003_redemption_operations.sql` — SQL: tables: redemption_operations (~204 tok)
- `0004_sync_observability.sql` — SQL: 3 alter(s) (~90 tok)

## apps/api/drizzle/meta/

- `_journal.json` (~195 tok)
- `0000_snapshot.json` (~3563 tok)
- `0002_snapshot.json` (~4459 tok)
- `0003_snapshot.json` (~4680 tok)

## apps/api/scripts/

- `migrate.ts` — Declares dbPath (~168 tok)

## apps/api/src/

- `app.ts` — Exports createApp (~589 tok)
- `index.ts` (~113 tok)

## apps/api/src/config/

- `env.test.ts` — Declares minimal (~856 tok)
- `env.ts` — Project id for the "Urlopy" project; required to create redemptions. (~825 tok)

## apps/api/src/db/

- `client.ts` — Exports Db, createDb (~272 tok)
- `queries.test.ts` — Declares memDb (~852 tok)
- `queries.ts` — Exports EarningRow, RedemptionRow, fetchEarnings, fetchRedemptions, fetchRelations (~1108 tok)
- `schema.test.ts` — Declares memDb (~412 tok)
- `schema.ts` — Exports issues, timeEntries, issueRelations, syncRuns + 2 more (~1375 tok)

## apps/api/src/lib/

- `envelope.ts` — Exports AppError, ok, fail (~150 tok)
- `logger.ts` — Exports logger (~150 tok)

## apps/api/src/matching/

- `fifo.test.ts` — Declares FIFOInput (~2134 tok)
- `fifo.ts` — Manual override. NULL → algorithm allocates this pair greedily. (~1288 tok)

## apps/api/src/middleware/

- `errors.ts` — Exports errorHandler (~284 tok)

## apps/api/src/redmine/

- `auth.test.ts` — Declares base (~234 tok)
- `auth.ts` — Exports buildAuthHeaders (~98 tok)
- `client.test.ts` — API routes: GET (6 endpoints) (~545 tok)
- `client.ts` — Exports RedmineError, RedmineClient (~888 tok)
- `endpoints.test.ts` — API routes: GET, POST (7 endpoints) (~1742 tok)
- `endpoints.ts` — API routes: GET, POST, DELETE (10 endpoints) (~1235 tok)
- `types.ts` — Zod schemas: redmineUserSchema, usersCurrentResponseSchema, redmineTimeEntrySchema, timeEntriesResponseSchema + 9 more (~728 tok)

## apps/api/src/routes/

- `backup.test.ts` — API routes: GET (3 endpoints) (~438 tok)
- `backup.ts` — API routes: GET (1 endpoints) (~302 tok)
- `balance.test.ts` — env: setupDb (~780 tok)
- `balance.ts` — API routes: GET (2 endpoints) (~535 tok)
- `health.ts` — API routes: GET (1 endpoints) (~420 tok)
- `issues.test.ts` — apps/api/src/routes/issues.test.ts — adapt setupDb from balance.test.ts (~565 tok)
- `issues.ts` — API routes: GET (3 endpoints) (~779 tok)
- `redemptions.test.ts` — API routes: GET, POST (9 endpoints) (~7130 tok)
- `redemptions.ts` — API routes: POST (2 endpoints) (~5536 tok)
- `relations.test.ts` — API routes: POST (1 endpoints) (~1452 tok)
- `relations.ts` — API routes: POST, DELETE (2 endpoints) (~1728 tok)
- `sync.test.ts` — API routes: GET (3 endpoints) (~1272 tok)
- `sync.ts` — API routes: POST, GET (4 endpoints) (~660 tok)
- `unlinked.test.ts` — env: setupDb (~774 tok)
- `unlinked.ts` — API routes: GET (1 endpoints) (~370 tok)

## apps/api/src/sync/

- `classify.test.ts` — Declares make (~444 tok)
- `classify.ts` — Exports classifyIssue (~131 tok)
- `lock.test.ts` — Declares memDb (~348 tok)
- `lock.ts` — Exports SyncInProgressError, acquireSyncRun, finishSyncRun (~479 tok)
- `normalize.test.ts` — Declares baseIssue (~455 tok)
- `normalize.ts` — Exports normalizeIssue, normalizeTimeEntry (~386 tok)
- `orchestrator.test.ts` — API routes: GET (21 endpoints) (~3710 tok)
- `orchestrator.ts` — Exports runSync (~2925 tok)

## apps/api/test/fixtures/redmine/

- `sync_basic.ts` — Exports fixtureSync (~478 tok)

## apps/api/test/helpers/

- `msw.ts` — Exports startMsw (~75 tok)

## apps/web/

- `components.json` (~157 tok)
- `index.html` — Overtide (~131 tok)
- `package.json` — Node.js package manifest (~412 tok)
- `playwright.config.ts` — Playwright test configuration (~230 tok)
- `postcss.config.js` — PostCSS configuration (~18 tok)
- `tsconfig.json` — TypeScript configuration (~66 tok)
- `vite.config.ts` — Vite build configuration (~169 tok)

## apps/web/e2e/

- `redemption-wizard.spec.ts` — Declares dialog (~1028 tok)
- `smoke.spec.ts` (~265 tok)

## apps/web/scripts/

- `screenshots-blur.mjs` — Capture the three "client-sensitive" README screenshots with subject (~1607 tok)
- `screenshots.mjs` — Capture README screenshots against a running dev stack. (~1108 tok)

## apps/web/src/

- `main.tsx` — queryClient (~278 tok)
- `routeTree.gen.ts` — @ts-nocheck (~1681 tok)
- `test-setup.ts` (~13 tok)

## apps/web/src/api/

- `client.test.ts` — Declares fetchMock (~743 tok)
- `client.ts` — Exports ApiClientError, ApiFetchOptions, apiFetch, apiFetchSchema (~529 tok)
- `mutations.ts` — Optional hour override; omit for greedy FIFO. (~1389 tok)
- `queries.ts` — Exports qk, useHealth, useBalance, useTimeline + 6 more (~672 tok)

## apps/web/src/components/balance/

- `AnimatedNumber.tsx` — AnimatedNumber — uses useEffect (~166 tok)
- `BalanceBreakdown.tsx` — BalanceBreakdown — renders chart (~2263 tok)
- `BalanceCard.tsx` — Stat (~720 tok)
- `BalancePill.tsx` — pickTone (~585 tok)

## apps/web/src/components/charts/

- `tooltip.ts` — Shared Recharts <Tooltip /> styling — white pill on dark theme so it (~178 tok)

## apps/web/src/components/command/

- `CommandPalette.tsx` — PAGES — uses useState, useNavigate, useEffect (~640 tok)

## apps/web/src/components/issues/

- `EarningTable.tsx` — EarningTable — renders table (~734 tok)
- `IssueDetailPanel.tsx` — IssueDetailPanel — uses useRouter (~1436 tok)
- `RedemptionTable.tsx` — RedemptionTable — renders table (~984 tok)

## apps/web/src/components/layout/

- `AppShell.tsx` — AppShell (~115 tok)
- `NavLink.tsx` — NavLink (~202 tok)
- `TopBar.tsx` — TopBar (~414 tok)

## apps/web/src/components/linker/

- `RelationLinker.tsx` — Empty string = greedy FIFO. Numeric string = explicit override. (~2183 tok)

## apps/web/src/components/redemption-wizard/

- `CreateRedemptionWizard.tsx` — Falls back to deriveInitials at runtime if not provided. (~6684 tok)
- `wizard.test.ts` — Sanity test that the web bundle resolves the shared builder so the preview (~212 tok)

## apps/web/src/components/states/

- `EmptyState.tsx` — EmptyState (~145 tok)

## apps/web/src/components/sync/

- `SyncButton.tsx` — SyncButton (~156 tok)
- `SyncRunBadge.tsx` — relativeTime (~207 tok)

## apps/web/src/components/timeline/

- `TimelineChart.tsx` — dayShort — renders chart (~940 tok)

## apps/web/src/components/ui/

- `badge.tsx` — badgeVariants (~558 tok)
- `button.tsx` — buttonVariants (~935 tok)
- `card.tsx` — Card (~772 tok)
- `dialog.tsx` — Dialog — renders modal (~1153 tok)
- `dropdown-menu.tsx` — DropdownMenu (~2581 tok)
- `input.tsx` — Input (~309 tok)
- `separator.tsx` — Separator (~157 tok)
- `sheet.tsx` — Sheet (~1269 tok)
- `skeleton.tsx` — Skeleton (~84 tok)
- `table.tsx` — Table — renders table (~679 tok)
- `textarea.tsx` — Textarea (~190 tok)
- `tooltip.tsx` — TooltipProvider (~819 tok)

## apps/web/src/components/warnings/

- `DeficitBanner.tsx` — DeficitBanner (~177 tok)
- `UnlinkedBanner.tsx` — UnlinkedBanner (~266 tok)

## apps/web/src/lib/

- `format.ts` — Exports hours, dateShort (~43 tok)
- `utils.ts` — Exports cn (~50 tok)

## apps/web/src/routes/

- `__root.tsx` — RootLayout (~253 tok)
- `earning.tsx` — Route (~99 tok)
- `index.tsx` — Route (~163 tok)
- `issue.$id.tsx` — Route — uses useParams (~170 tok)
- `redemptions.tsx` — RedemptionsPage — uses useState (~291 tok)
- `settings.tsx` — SettingsPage (~609 tok)
- `sync.tsx` — SyncPage — renders table (~1244 tok)
- `timeline.tsx` — Route — renders chart (~99 tok)
- `unlinked.tsx` — UnlinkedPage (~567 tok)

## apps/web/src/styles/

- `globals.css` — Styles: 5 rules, 43 vars, 1 layers (~614 tok)

## docs/superpowers/plans/

- `2026-05-11-overtide-backend.md` — Overtide Backend Implementation Plan (~25666 tok)
- `2026-05-11-overtide-frontend.md` — Overtide Frontend Implementation Plan (~15563 tok)
- `2026-05-12-redemption-wizard.md` — Redemption Wizard (~3683 tok)
- `2026-06-07-overtide-reliability-hardening.md` — Overtide Reliability Hardening Implementation Plan (~5065 tok)

## docs/superpowers/specs/

- `2026-05-11-overtide-design.md` — Overtide — Design Spec (~7330 tok)

## packages/shared/

- `package.json` — Node.js package manifest (~52 tok)
- `tsconfig.json` — TypeScript configuration (~33 tok)

## packages/shared/src/

- `domain.ts` — Zod schemas: issueRoleSchema, issueSchema, balanceSchema, healthDataSchema + 8 more (~1270 tok)
- `envelope.test.ts` — Declares ApiResponse (~214 tok)
- `envelope.ts` — Zod schemas: apiErrorSchema (~198 tok)
- `index.ts` (~27 tok)
- `redemption-wizard.test.ts` — Declares earnings (~2471 tok)
- `redemption-wizard.ts` — Allocation requested by the wizard: take `hours` from earning `earningId`. (~2494 tok)

## site/

- `.gitignore` — Git ignore rules (~38 tok)
- `package.json` — Node.js package manifest (~101 tok)
- `README.md` — Project documentation (~341 tok)
- `sync.mjs` — Sync the repo README + screenshots into the VitePress site source. (~534 tok)
- `vercel.json` (~64 tok)

## site/.vitepress/

- `config.ts` — VitePress treats `site/` as the docs root. `sync.mjs` copies the repo (~505 tok)
